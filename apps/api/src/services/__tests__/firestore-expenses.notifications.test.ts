import { describe, expect, it, vi } from 'vitest';

import { createFirestoreExpenseService } from '../firestore-expenses';
import type { NotificationService } from '../notifications';

function docSnapshot(data: Record<string, unknown> | null) {
  return {
    exists: data !== null,
    data: () => data ?? undefined,
  };
}

function firestore(expenseData: Record<string, unknown> | null = null) {
  const refs = new Map<string, { id: string; path: string; get: () => Promise<unknown> }>();
  const transaction = {
    delete: vi.fn(),
    get: vi.fn(async (ref: { path: string }) => {
      if (ref.path.startsWith('expenses/')) return docSnapshot(expenseData);
      if (ref.path === 'groupMembers/group-1_user-1') {
        return docSnapshot({
          groupId: 'group-1',
          userId: 'user-1',
          role: 'member',
          status: 'active',
          permissions: {
            canAddExpenses: true,
            canEditOwnExpenses: true,
            canEditAllExpenses: false,
            canDeleteExpenses: true,
          },
        });
      }
      return docSnapshot({});
    }),
    set: vi.fn(),
    update: vi.fn(),
  };
  const db = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id?: string) => {
        const docId = id ?? `${name}-generated`;
        const path = `${name}/${docId}`;
        if (!refs.has(path)) {
          refs.set(path, {
            id: docId,
            path,
            get: async () => {
              if (path === 'groupMembers/group-1_user-1') {
                return docSnapshot({ status: 'active' });
              }
              return docSnapshot({});
            },
          });
        }
        return refs.get(path);
      }),
    })),
    runTransaction: vi.fn(async (callback) => callback(transaction)),
  };
  return { db, transaction };
}

function notifications(): NotificationService {
  return {
    notifyGroupMembers: vi.fn(async () => undefined),
    notifyUsers: vi.fn(async () => undefined),
  };
}

describe('firestore expense notifications', () => {
  it('notifies group members after creating a group expense', async () => {
    const { db } = firestore();
    const notificationService = notifications();
    const service = createFirestoreExpenseService(db as never, notificationService);

    const result = await service.createExpense({
      userId: 'user-1',
      vendor: 'Cafe',
      amount: 12.5,
      date: '2026-06-08',
      category: 'Meals and entertainment',
      groupId: 'group-1',
    });

    expect(result).toEqual({ id: 'expenses-generated' });
    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'user-1',
        type: 'group_expense_added',
        title: 'New expense added',
        relatedId: 'expenses-generated',
        relatedType: 'expense',
        metadata: expect.objectContaining({
          vendor: 'Cafe',
          amount: 12.5,
          category: 'Meals and entertainment',
        }),
      }),
    );
  });

  it('notifies group members after updating a group expense', async () => {
    const { db } = firestore({
      groupId: 'group-1',
      expenseType: 'group',
      userId: 'user-1',
      vendor: 'Cafe',
      amount: 12.5,
      category: 'Meals and entertainment',
      groupMetadata: { approvalStatus: 'approved' },
    });
    const notificationService = notifications();
    const service = createFirestoreExpenseService(db as never, notificationService);

    await service.updateExpense({
      id: 'expense-1',
      userId: 'user-1',
      vendor: 'New Cafe',
      amount: 15,
    });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'user-1',
        type: 'group_expense_updated',
        title: 'Expense updated',
        relatedId: 'expense-1',
        relatedType: 'expense',
        metadata: expect.objectContaining({
          vendor: 'New Cafe',
          amount: 15,
          changes: ['vendor', 'amount'],
        }),
      }),
    );
  });

  it('notifies group members after deleting a group expense', async () => {
    const { db } = firestore({
      groupId: 'group-1',
      expenseType: 'group',
      userId: 'user-1',
      vendor: 'Cafe',
      amount: 12.5,
      category: 'Meals and entertainment',
      groupMetadata: { approvalStatus: 'approved' },
    });
    const notificationService = notifications();
    const service = createFirestoreExpenseService(db as never, notificationService);

    await service.deleteExpense({ id: 'expense-1', userId: 'user-1' });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'user-1',
        type: 'group_expense_deleted',
        title: 'Expense deleted',
        relatedId: 'expense-1',
        relatedType: 'expense',
        metadata: expect.objectContaining({
          vendor: 'Cafe',
          amount: 12.5,
        }),
      }),
    );
  });
});
