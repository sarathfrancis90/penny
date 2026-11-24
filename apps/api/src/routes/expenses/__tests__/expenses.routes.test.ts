import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';

describe('expense routes', () => {
  it('rejects a body userId that does not match the Firebase token user', async () => {
    const createExpense = vi.fn();
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-token' }) },
      services: {
        expenses: {
          createExpense,
          updateExpense: vi.fn(),
          deleteExpense: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        userId: 'user-body',
        vendor: 'Acme',
        amount: 10,
        date: '2026-06-06',
        category: 'Office expenses',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: 'Forbidden',
      details: 'Request userId does not match authenticated user',
    });
    expect(createExpense).not.toHaveBeenCalled();

    await app.close();
  });

  it('creates expenses using the authenticated user as authority', async () => {
    const createExpense = vi.fn(async () => ({ id: 'expense-1' }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        expenses: {
          createExpense,
          updateExpense: vi.fn(),
          deleteExpense: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        vendor: 'Acme',
        amount: 10,
        date: '2026-06-06',
        category: 'Office expenses',
        groupId: 'group-1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      id: 'expense-1',
      message: 'Expense created successfully',
    });
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        vendor: 'Acme',
        amount: 10,
        groupId: 'group-1',
      }),
    );

    await app.close();
  });

  it('rejects non-canonical categories on create', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        vendor: 'Acme',
        amount: 10,
        date: '2026-06-06',
        category: 'Other Business Expenses',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Bad Request',
      details: 'category must be a canonical CRA category',
    });

    await app.close();
  });

  async function appWithExpenses() {
    const expenses = {
      createExpense: vi.fn(async () => ({ id: 'expense-1' })),
      updateExpense: vi.fn(async () => ({ id: 'expense-1' })),
      deleteExpense: vi.fn(),
    };
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: { expenses },
    });
    const send = (method: 'POST' | 'PATCH' | 'PUT', url: string, payload: object) =>
      app.inject({
        method,
        url,
        headers: { authorization: 'Bearer valid-token' },
        payload,
      });
    return { app, expenses, send };
  }

  const validExpense = {
    vendor: 'Acme',
    amount: 10,
    date: '2026-06-06',
    category: 'Office expenses',
  };

  it('rejects impossible and out-of-range dates on create', async () => {
    const { app, expenses, send } = await appWithExpenses();

    for (const date of ['2025-02-31', '2025-00-10', '2025-13-01', '1999-12-31', '9999-01-01', '06/06/2026']) {
      const response = await send('POST', '/api/expenses', { ...validExpense, date });
      expect(response.statusCode, date).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'Bad Request',
        details: 'date must be a valid YYYY-MM-DD date',
      });
    }
    expect(expenses.createExpense).not.toHaveBeenCalled();

    const leapDay = await send('POST', '/api/expenses', { ...validExpense, date: '2024-02-29' });
    expect(leapDay.statusCode).toBe(200);

    await app.close();
  });

  it('passes a valid clientRequestId to the service and rejects a malformed one', async () => {
    const { app, expenses, send } = await appWithExpenses();

    const accepted = await send('POST', '/api/expenses', {
      ...validExpense,
      clientRequestId: '3f2b6c1e-8a4d-4c57-9b1a-0d2e5f7a9c11',
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({
      success: true,
      id: 'expense-1',
      message: 'Expense created successfully',
    });
    expect(expenses.createExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientRequestId: '3f2b6c1e-8a4d-4c57-9b1a-0d2e5f7a9c11' }),
    );

    for (const clientRequestId of ['short', 'has spaces in it', 'x'.repeat(65), 12345678]) {
      const response = await send('POST', '/api/expenses', { ...validExpense, clientRequestId });
      expect(response.statusCode).toBe(400);
    }
    expect(expenses.createExpense).toHaveBeenCalledTimes(1);

    const withoutKey = await send('POST', '/api/expenses', validExpense);
    expect(withoutKey.statusCode).toBe(200);
    expect(expenses.createExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientRequestId: undefined }),
    );

    await app.close();
  });

  it('rejects a provided-but-invalid amount or date on update instead of ignoring it', async () => {
    const { app, expenses, send } = await appWithExpenses();

    for (const payload of [
      { amount: 0 },
      { amount: -5 },
      { amount: '12.50' },
      { date: '2025-02-31' },
      { date: 'yesterday' },
    ]) {
      for (const method of ['PATCH', 'PUT'] as const) {
        const response = await send(method, '/api/expenses/expense-1', payload);
        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
        expect(response.json().error).toBe('Bad Request');
      }
    }
    expect(expenses.updateExpense).not.toHaveBeenCalled();

    await app.close();
  });

  it('updates through PATCH and PUT with the same handler', async () => {
    const { app, expenses, send } = await appWithExpenses();
    const payload = {
      userId: 'user-1',
      vendor: 'Acme',
      amount: 12.5,
      category: 'Office expenses',
      description: 'Paper',
      date: '2026-06-06',
    };

    for (const method of ['PATCH', 'PUT'] as const) {
      const response = await send(method, '/api/expenses/expense-1', payload);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        success: true,
        id: 'expense-1',
        message: 'Expense updated',
      });
      expect(expenses.updateExpense).toHaveBeenLastCalledWith({
        id: 'expense-1',
        userId: 'user-1',
        vendor: 'Acme',
        amount: 12.5,
        category: 'Office expenses',
        description: 'Paper',
        date: '2026-06-06',
      });
    }
    expect(expenses.updateExpense).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('still ignores a legacy category the installed app resends unchanged on update', async () => {
    const { app, expenses, send } = await appWithExpenses();

    const response = await send('PATCH', '/api/expenses/expense-1', {
      vendor: 'Acme',
      category: 'Other Business Expenses',
    });

    expect(response.statusCode).toBe(200);
    expect(expenses.updateExpense).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'Acme', category: undefined }),
    );

    await app.close();
  });
});
