import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreExpenseService } from '../firestore-expenses';
import { DEFAULT_ROLE_PERMISSIONS } from '../group-permissions';
import type { NotificationService } from '../notifications';

function notifications(): NotificationService {
  return {
    notifyGroupMembers: vi.fn(async () => undefined),
    notifyUsers: vi.fn(async () => undefined),
  };
}

function member(
  db: FakeFirestore,
  userId: string,
  role: keyof typeof DEFAULT_ROLE_PERMISSIONS,
  overrides: Record<string, unknown> = {},
) {
  db.seed(`groupMembers/group-1_${userId}`, {
    groupId: 'group-1',
    userId,
    role,
    status: 'active',
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
    ...overrides,
  });
}

function setup() {
  const db = new FakeFirestore();
  db.seed('groups/group-1', {
    name: 'Studio',
    status: 'active',
    stats: { memberCount: 4, expenseCount: 1, totalAmount: 40 },
  });
  member(db, 'owner-1', 'owner');
  member(db, 'admin-1', 'admin');
  member(db, 'member-1', 'member');
  member(db, 'member-2', 'member');
  member(db, 'viewer-1', 'viewer');
  db.seed('expenses/group-expense', {
    userId: 'member-1',
    groupId: 'group-1',
    expenseType: 'group',
    vendor: 'Cafe',
    amount: 40,
    category: 'Meals and entertainment',
    groupMetadata: { approvalStatus: 'approved' },
  });
  db.seed('expenses/personal-expense', {
    userId: 'member-1',
    groupId: null,
    expenseType: 'personal',
    vendor: 'Books',
    amount: 15,
    category: 'Office expenses',
  });
  const notificationService = notifications();
  const service = createFirestoreExpenseService(db as never, notificationService);
  return { db, service, notificationService };
}

const newExpense = {
  vendor: 'Cafe',
  amount: 12.5,
  date: '2026-06-08',
  category: 'Meals and entertainment',
};

describe('adding an expense to a group that is no longer active', () => {
  it('refuses an archived group and leaves its totals alone', async () => {
    const { db, service } = setup();
    db.seed('groups/group-1', {
      name: 'Studio',
      status: 'archived',
      stats: { memberCount: 4, expenseCount: 1, totalAmount: 40 },
    });
    await expect(
      service.createExpense({ ...newExpense, userId: 'member-1', groupId: 'group-1' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 1, totalAmount: 40 });
  });

  it('treats a deleted group as missing', async () => {
    const { db, service } = setup();
    db.seed('groups/group-1', { name: 'Studio', status: 'deleted' });
    await expect(
      service.createExpense({ ...newExpense, userId: 'member-1', groupId: 'group-1' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('personal budget alerts', () => {
  function withBudget(settings: Record<string, unknown> = {}) {
    const ctx = setup();
    ctx.db.seed('budgets_personal/budget-1', {
      userId: 'member-1',
      category: 'Groceries',
      monthlyLimit: 100,
      period: { month: 6, year: 2026 },
      settings: { rollover: false, alertThreshold: 80, notificationsEnabled: true, ...settings },
    });
    return ctx;
  }
  const grocery = (amount: number, date = '2026-06-10') => ({
    userId: 'member-1',
    vendor: 'Market',
    amount,
    date,
    category: 'Groceries',
  });
  const alerts = (n: NotificationService) =>
    vi.mocked(n.notifyUsers).mock.calls.map(([input]) => input.type);

  it('warns once when spending crosses the alert threshold', async () => {
    const { service, notificationService } = withBudget();
    await service.createExpense(grocery(50));
    expect(alerts(notificationService)).toEqual([]);
    await service.createExpense(grocery(35));
    expect(alerts(notificationService)).toEqual(['budget_warning']);
    expect(vi.mocked(notificationService.notifyUsers).mock.calls[0][0]).toMatchObject({
      userIds: ['member-1'],
      category: 'budget',
      actionUrl: '/budgets',
      relatedId: 'budget-1',
    });
    await service.createExpense(grocery(5));
    expect(alerts(notificationService)).toEqual(['budget_warning']);
  });

  it('says exceeded when an expense goes past the limit', async () => {
    const { service, notificationService } = withBudget();
    await service.createExpense(grocery(85));
    await service.createExpense(grocery(20));
    expect(alerts(notificationService)).toEqual(['budget_warning', 'budget_exceeded']);
    await service.createExpense(grocery(10));
    expect(alerts(notificationService)).toEqual(['budget_warning', 'budget_exceeded']);
  });

  it('jumps straight to exceeded when one expense crosses both lines', async () => {
    const { service, notificationService } = withBudget();
    await service.createExpense(grocery(120));
    expect(alerts(notificationService)).toEqual(['budget_exceeded']);
  });

  it('stays quiet when alerts are off, for other categories, and other months', async () => {
    const off = withBudget({ notificationsEnabled: false });
    await off.service.createExpense(grocery(150));
    expect(alerts(off.notificationService)).toEqual([]);

    const other = withBudget();
    await other.service.createExpense({ ...grocery(150), category: 'Office expenses' });
    await other.service.createExpense(grocery(150, '2026-07-02'));
    expect(alerts(other.notificationService)).toEqual([]);
  });

  it('still saves the expense when the alert cannot be sent', async () => {
    const { service, notificationService, db } = withBudget();
    vi.mocked(notificationService.notifyUsers).mockRejectedValueOnce(new Error('down'));
    const { id } = await service.createExpense(grocery(120));
    expect(db.read(`expenses/${id}`)).toMatchObject({ amount: 120 });
  });
});

describe('expense mutation permissions', () => {
  it('rejects edits and deletes of a group expense by a signed-in non-member', async () => {
    const { db, service } = setup();

    await expect(
      service.updateExpense({ id: 'group-expense', userId: 'stranger', amount: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.deleteExpense({ id: 'group-expense', userId: 'stranger' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(db.read('expenses/group-expense')?.amount).toBe(40);
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 1, totalAmount: 40 });
  });

  it('rejects edits and deletes of another member’s expense by a plain member', async () => {
    const { db, service } = setup();

    await expect(
      service.updateExpense({ id: 'group-expense', userId: 'member-2', vendor: 'Hacked' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.deleteExpense({ id: 'group-expense', userId: 'member-2' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.read('expenses/group-expense')?.vendor).toBe('Cafe');
  });

  it('rejects a former member editing or deleting their own group expense', async () => {
    const { db, service } = setup();
    member(db, 'member-1', 'member', { status: 'left' });

    await expect(
      service.updateExpense({ id: 'group-expense', userId: 'member-1', vendor: 'X' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.deleteExpense({ id: 'group-expense', userId: 'member-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets a member edit and delete their own group expense', async () => {
    const { db, service } = setup();

    await service.updateExpense({ id: 'group-expense', userId: 'member-1', vendor: 'Bistro' });
    expect(db.read('expenses/group-expense')?.vendor).toBe('Bistro');

    await service.deleteExpense({ id: 'group-expense', userId: 'member-1' });
    expect(db.read('expenses/group-expense')).toBeUndefined();
  });

  it('lets a member demoted to viewer delete, but not edit, their own group expense', async () => {
    const { db, service } = setup();
    member(db, 'member-1', 'viewer');

    await expect(
      service.updateExpense({ id: 'group-expense', userId: 'member-1', vendor: 'X' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await service.deleteExpense({ id: 'group-expense', userId: 'member-1' });
    expect(db.read('expenses/group-expense')).toBeUndefined();
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 0, totalAmount: 0 });
  });

  it('lets an admin edit and delete any group expense', async () => {
    const { db, service } = setup();

    await service.updateExpense({ id: 'group-expense', userId: 'admin-1', vendor: 'Bistro' });
    expect(db.read('expenses/group-expense')?.vendor).toBe('Bistro');

    await service.deleteExpense({ id: 'group-expense', userId: 'admin-1' });
    expect(db.read('expenses/group-expense')).toBeUndefined();
  });

  it('falls back to role defaults when a member document has no permissions', async () => {
    const { db, service } = setup();
    db.seed('groupMembers/group-1_admin-1', {
      groupId: 'group-1',
      userId: 'admin-1',
      role: 'admin',
      status: 'active',
    });
    db.seed('groupMembers/group-1_member-2', {
      groupId: 'group-1',
      userId: 'member-2',
      role: 'member',
      status: 'active',
    });

    await expect(
      service.updateExpense({ id: 'group-expense', userId: 'member-2', vendor: 'X' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await service.updateExpense({ id: 'group-expense', userId: 'admin-1', vendor: 'Bistro' });
    expect(db.read('expenses/group-expense')?.vendor).toBe('Bistro');
  });

  it('only lets the owner touch a personal expense', async () => {
    const { db, service } = setup();

    await expect(
      service.updateExpense({ id: 'personal-expense', userId: 'admin-1', vendor: 'X' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.deleteExpense({ id: 'personal-expense', userId: 'admin-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await service.deleteExpense({ id: 'personal-expense', userId: 'member-1' });
    expect(db.read('expenses/personal-expense')).toBeUndefined();
  });
});

describe('group expense creation permissions', () => {
  it('rejects a viewer creating a group expense', async () => {
    const { db, service, notificationService } = setup();

    await expect(
      service.createExpense({ ...newExpense, userId: 'viewer-1', groupId: 'group-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(db.paths('expenses')).toHaveLength(2);
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 1, totalAmount: 40 });
    expect(notificationService.notifyGroupMembers).not.toHaveBeenCalled();
  });

  it('lets a legacy member without a permissions map add expenses, but not a legacy viewer', async () => {
    const { db, service } = setup();
    db.seed('groupMembers/group-1_member-2', {
      groupId: 'group-1',
      userId: 'member-2',
      role: 'member',
      status: 'active',
    });
    db.seed('groupMembers/group-1_viewer-1', {
      groupId: 'group-1',
      userId: 'viewer-1',
      role: 'viewer',
      status: 'active',
    });

    await service.createExpense({ ...newExpense, userId: 'member-2', groupId: 'group-1' });
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 2, totalAmount: 52.5 });

    await expect(
      service.createExpense({ ...newExpense, userId: 'viewer-1', groupId: 'group-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('expense dates', () => {
  it('rejects impossible dates instead of rolling them into the next month', async () => {
    const { db, service } = setup();

    for (const date of ['2025-02-31', '2025-00-10', '2025-13-01', '2025-06-00']) {
      await expect(
        service.createExpense({ ...newExpense, userId: 'member-1', date }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(
      service.updateExpense({ id: 'personal-expense', userId: 'member-1', date: '2025-02-31' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(db.paths('expenses')).toHaveLength(2);
  });

  it('stores a valid date at local noon', async () => {
    const { db, service } = setup();
    const { id } = await service.createExpense({ ...newExpense, userId: 'member-1' });
    const stored = (db.read(`expenses/${id}`)?.date as { toDate(): Date }).toDate();
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate(), stored.getHours()]).toEqual([
      2026, 5, 8, 12,
    ]);
  });

  it('rejects moving an expense to an out-of-range year but tolerates an unchanged legacy date', async () => {
    const { db, service } = setup();
    await service.updateExpense({ id: 'personal-expense', userId: 'member-1', date: '2026-06-08' });
    await expect(
      service.updateExpense({ id: 'personal-expense', userId: 'member-1', date: '1925-03-02' }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // An expense saved long ago with a misread year can still have its other
    // fields edited: the installed app resends the stored date untouched.
    const legacy = Timestamp.fromDate(new Date(1925, 2, 2, 12, 0, 0));
    db.seed('expenses/legacy-date', { userId: 'member-1', vendor: 'Old', amount: 5, date: legacy });
    await service.updateExpense({
      id: 'legacy-date',
      userId: 'member-1',
      vendor: 'Fixed vendor',
      date: '1925-03-02',
    });
    expect(db.read('expenses/legacy-date')?.vendor).toBe('Fixed vendor');
  });
});

describe('group stats on expense edits', () => {
  it('applies the amount difference to the group total', async () => {
    const { db, service } = setup();

    await service.updateExpense({ id: 'group-expense', userId: 'member-1', amount: 55.5 });
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 1, totalAmount: 55.5 });

    await service.updateExpense({ id: 'group-expense', userId: 'member-1', amount: 10 });
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 1, totalAmount: 10 });
  });

  it('leaves the group total alone when the amount is not edited', async () => {
    const { db, service } = setup();
    await service.updateExpense({ id: 'group-expense', userId: 'member-1', vendor: 'Bistro' });
    expect(db.read('groups/group-1')?.stats).toMatchObject({ totalAmount: 40 });
  });
});

describe('idempotent expense creation', () => {
  it('returns the first expense for a retried clientRequestId without repeating side effects', async () => {
    const { db, service, notificationService } = setup();
    const input = {
      ...newExpense,
      userId: 'member-1',
      groupId: 'group-1',
      clientRequestId: 'req_12345678',
    };

    const first = await service.createExpense(input);
    const second = await service.createExpense(input);

    expect(second).toEqual(first);
    expect(first.id).toMatch(/^cr_[0-9a-f]{32}$/);
    expect(db.paths('expenses')).toHaveLength(3);
    expect(db.read('groups/group-1')?.stats).toMatchObject({ expenseCount: 2, totalAmount: 52.5 });
    expect(db.paths('groupActivities')).toHaveLength(1);
    expect(notificationService.notifyGroupMembers).toHaveBeenCalledTimes(1);
  });

  it('keeps separate expenses for different users and different request ids', async () => {
    const { service } = setup();
    const a = await service.createExpense({ ...newExpense, userId: 'member-1', clientRequestId: 'req_12345678' });
    const b = await service.createExpense({ ...newExpense, userId: 'member-2', clientRequestId: 'req_12345678' });
    const c = await service.createExpense({ ...newExpense, userId: 'member-1', clientRequestId: 'req_87654321' });
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('creates a new expense on every call when no clientRequestId is sent', async () => {
    const { db, service } = setup();
    const a = await service.createExpense({ ...newExpense, userId: 'member-1' });
    const b = await service.createExpense({ ...newExpense, userId: 'member-1' });
    expect(a.id).not.toBe(b.id);
    expect(db.paths('expenses')).toHaveLength(4);
  });
});
