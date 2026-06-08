import { describe, expect, it, vi } from 'vitest';

import { createFirestoreBudgetService } from '../firestore-budgets';
import type { NotificationService } from '../notifications';

function snapshot(data: Record<string, unknown> | null, ref?: unknown) {
  return {
    exists: data !== null,
    empty: data === null,
    data: () => data ?? undefined,
    docs: data === null ? [] : [{ id: 'existing-doc', data: () => data, ref }],
    ref,
  };
}

function querySnapshot(docs: Array<Record<string, unknown>> = []) {
  return {
    empty: docs.length === 0,
    docs: docs.map((data, index) => ({
      id: `doc-${index}`,
      data: () => data,
      ref: { delete: vi.fn(), update: vi.fn() },
    })),
  };
}

function chain(snapshotResult: unknown) {
  const query = {
    where: vi.fn(() => query),
    limit: vi.fn(() => query),
    get: vi.fn(async () => snapshotResult),
  };
  return query;
}

function firestore() {
  const budgetRef = {
    id: 'budget-1',
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => snapshot({
      groupId: 'group-1',
      category: 'Office expenses',
      monthlyLimit: 600,
      period: { month: 6, year: 2026 },
    }, budgetRef)),
  };
  const db = {
    batch: vi.fn(() => ({
      delete: vi.fn(),
      commit: vi.fn(async () => undefined),
    })),
    collection: vi.fn((name: string) => {
      if (name === 'groupMembers') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => snapshot({
              groupId: 'group-1',
              userId: 'user-1',
              role: 'admin',
              status: 'active',
            })),
          })),
          where: vi.fn(() => chain(querySnapshot())),
        };
      }
      if (name === 'budgets_group') {
        return {
          add: vi.fn(async () => budgetRef),
          doc: vi.fn(() => ({
            ...budgetRef,
            get: vi.fn(async () => snapshot({
              groupId: 'group-1',
              category: 'Office expenses',
              monthlyLimit: 500,
              period: { month: 6, year: 2026 },
            }, budgetRef)),
          })),
          where: vi.fn(() => chain(querySnapshot())),
        };
      }
      return {
        doc: vi.fn(() => ({
          get: vi.fn(async () => snapshot(null)),
        })),
        where: vi.fn(() => chain(querySnapshot())),
      };
    }),
  };
  return db;
}

function notifications(): NotificationService {
  return {
    notifyGroupMembers: vi.fn(async () => undefined),
    notifyUsers: vi.fn(async () => undefined),
  };
}

describe('firestore budget group notifications', () => {
  it('notifies group members after creating a group budget', async () => {
    const notificationService = notifications();
    const service = createFirestoreBudgetService(
      firestore() as never,
      notificationService,
    );

    await service.createGroupBudget({
      userId: 'user-1',
      groupId: 'group-1',
      category: 'Office expenses',
      monthlyLimit: 500,
      period: { month: 6, year: 2026 },
    });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'user-1',
        type: 'group_settings_changed',
        title: 'Group budget created',
        relatedType: 'budget',
        metadata: expect.objectContaining({
          action: 'created',
          category: 'Office expenses',
          monthlyLimit: 500,
        }),
      }),
    );
  });

  it('notifies group members after updating a group budget', async () => {
    const notificationService = notifications();
    const service = createFirestoreBudgetService(
      firestore() as never,
      notificationService,
    );

    await service.updateGroupBudget({
      id: 'budget-1',
      userId: 'user-1',
      monthlyLimit: 600,
    });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'user-1',
        type: 'group_settings_changed',
        title: 'Group budget updated',
        relatedId: 'budget-1',
        relatedType: 'budget',
        metadata: expect.objectContaining({
          action: 'updated',
          monthlyLimit: 600,
        }),
      }),
    );
  });

  it('notifies group members after deleting a group budget', async () => {
    const notificationService = notifications();
    const service = createFirestoreBudgetService(
      firestore() as never,
      notificationService,
    );

    await service.deleteGroupBudget({
      id: 'budget-1',
      userId: 'user-1',
    });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'user-1',
        type: 'group_settings_changed',
        title: 'Group budget deleted',
        relatedId: 'budget-1',
        relatedType: 'budget',
        metadata: expect.objectContaining({
          action: 'deleted',
          category: 'Office expenses',
        }),
      }),
    );
  });
});
