import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';

function auth() {
  return { verifyIdToken: async () => ({ uid: 'user-1' }) };
}

describe('budget routes', () => {
  it('creates personal budgets using the authenticated user', async () => {
    const createPersonalBudget = vi.fn(async () => ({
      id: 'budget-1',
      userId: 'user-1',
      category: 'Office expenses',
      monthlyLimit: 250,
      period: { month: 6, year: 2026 },
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: auth(),
      services: {
        budgets: {
          createPersonalBudget,
          listPersonalBudgets: vi.fn(),
          getPersonalBudget: vi.fn(),
          updatePersonalBudget: vi.fn(),
          deletePersonalBudget: vi.fn(),
          getPersonalBudgetUsage: vi.fn(),
          createGroupBudget: vi.fn(),
          listGroupBudgets: vi.fn(),
          getGroupBudget: vi.fn(),
          updateGroupBudget: vi.fn(),
          deleteGroupBudget: vi.fn(),
          getGroupBudgetUsage: vi.fn(),
        },
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/budgets/personal',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        userId: 'user-1',
        category: 'Office expenses',
        monthlyLimit: 250,
        period: { month: 6, year: 2026 },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'budget-1',
      userId: 'user-1',
      category: 'Office expenses',
    });
    expect(createPersonalBudget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', monthlyLimit: 250 }),
    );

    await app.close();
  });

  it('rejects mismatched userId values on personal budget create', async () => {
    const createPersonalBudget = vi.fn();
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: auth(),
      services: {
        budgets: {
          createPersonalBudget,
          listPersonalBudgets: vi.fn(),
          getPersonalBudget: vi.fn(),
          updatePersonalBudget: vi.fn(),
          deletePersonalBudget: vi.fn(),
          getPersonalBudgetUsage: vi.fn(),
          createGroupBudget: vi.fn(),
          listGroupBudgets: vi.fn(),
          getGroupBudget: vi.fn(),
          updateGroupBudget: vi.fn(),
          deleteGroupBudget: vi.fn(),
          getGroupBudgetUsage: vi.fn(),
        },
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/budgets/personal',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        userId: 'other-user',
        category: 'Office expenses',
        monthlyLimit: 250,
        period: { month: 6, year: 2026 },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: 'Forbidden',
      details: 'Request userId does not match authenticated user',
    });
    expect(createPersonalBudget).not.toHaveBeenCalled();

    await app.close();
  });

  it('creates group budgets with the token user as setter', async () => {
    const createGroupBudget = vi.fn(async () => ({
      id: 'budget-1',
      groupId: 'group-1',
      setBy: 'user-1',
      category: 'Meals and entertainment',
      monthlyLimit: 500,
      period: { month: 6, year: 2026 },
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: auth(),
      services: {
        budgets: {
          createGroupBudget,
          createPersonalBudget: vi.fn(),
          listPersonalBudgets: vi.fn(),
          getPersonalBudget: vi.fn(),
          updatePersonalBudget: vi.fn(),
          deletePersonalBudget: vi.fn(),
          getPersonalBudgetUsage: vi.fn(),
          listGroupBudgets: vi.fn(),
          getGroupBudget: vi.fn(),
          updateGroupBudget: vi.fn(),
          deleteGroupBudget: vi.fn(),
          getGroupBudgetUsage: vi.fn(),
        },
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/budgets/group',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        groupId: 'group-1',
        category: 'Meals and entertainment',
        monthlyLimit: 500,
        period: { month: 6, year: 2026 },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'budget-1',
      groupId: 'group-1',
      setBy: 'user-1',
    });
    expect(createGroupBudget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', groupId: 'group-1' }),
    );

    await app.close();
  });
});
