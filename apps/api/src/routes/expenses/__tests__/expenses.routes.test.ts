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
});
