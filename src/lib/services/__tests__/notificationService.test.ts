// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationType } from '@/lib/types/notifications';

/**
 * NotificationService runs on the server (e.g. /api/expenses ->
 * BudgetNotificationService). There is no signed-in user there, so the
 * client SDK is denied by the security rules (notification create is
 * server-only). It must read preferences and write notifications through
 * the Admin SDK.
 */

type Data = Record<string, unknown>;
const docs = new Map<string, Data>(); // full path -> data
let autoId = 0;

function readField(data: Data, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (v, k) => (v && typeof v === 'object' ? (v as Data)[k] : undefined),
    data,
  );
}

class FakeDocRef {
  constructor(readonly path: string) {}
  get id() {
    return this.path.split('/').pop()!;
  }
  collection(name: string) {
    return new FakeCollection(`${this.path}/${name}`);
  }
  async get() {
    const data = docs.get(this.path);
    return { id: this.id, exists: data !== undefined, data: () => data, ref: this };
  }
  async update(patch: Data) {
    const current = docs.get(this.path);
    if (!current) throw new Error(`No document ${this.path}`);
    docs.set(this.path, { ...current, ...patch });
  }
}

class FakeCollection {
  constructor(
    readonly path: string,
    private readonly filters: Array<{ field: string; op: string; value: unknown }> = [],
  ) {}
  doc(id: string) {
    return new FakeDocRef(`${this.path}/${id}`);
  }
  async add(data: Data) {
    const ref = this.doc(`auto-${++autoId}`);
    docs.set(ref.path, data);
    return ref;
  }
  where(field: string, op: string, value: unknown) {
    return new FakeCollection(this.path, [...this.filters, { field, op, value }]);
  }
  limit() {
    return this;
  }
  async get() {
    const prefix = `${this.path}/`;
    const matching = [...docs.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .filter(([, d]) =>
        this.filters.every((f) => {
          const v = readField(d, f.field);
          if (f.op === '==') return v === f.value;
          // createdAt range: the fake stores serverTimestamp sentinels; treat
          // them as "now", i.e. inside the grouping window.
          if (f.op === '>=') return v !== undefined;
          throw new Error(`Unsupported op ${f.op}`);
        }),
      )
      .map(([p, d]) => ({ id: p.split('/').pop()!, data: () => d, ref: new FakeDocRef(p) }));
    return { empty: matching.length === 0, size: matching.length, docs: matching };
  }
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: (name: string) => new FakeCollection(name) },
}));

// The client SDK must not be used on the server path.
vi.mock('@/lib/firebase', () => {
  throw new Error('client Firebase SDK imported by a server-side notification module');
});

const { NotificationService } = await import('../notificationService');

function notifications() {
  return [...docs.entries()].filter(([p]) => p.startsWith('notifications/')).map(([, d]) => d);
}

beforeEach(() => {
  docs.clear();
  autoId = 0;
  vi.useRealTimers();
});

describe('NotificationService (server, Admin SDK)', () => {
  it('writes a budget notification to the notifications collection', async () => {
    const id = await NotificationService.createBudgetExceededNotification({
      userId: 'alice',
      budgetId: 'b1',
      category: 'Office expenses',
      percentage: 120,
      current: 120,
      limit: 100,
      overage: 20,
    });

    expect(id).toBeTruthy();
    const [written] = notifications();
    expect(written).toMatchObject({
      userId: 'alice',
      type: NotificationType.BUDGET_EXCEEDED,
      category: 'budget',
      priority: 'critical',
      read: false,
      relatedId: 'b1',
    });
    expect(written.createdAt).toBeDefined();
  });

  it('respects a global mute in userNotificationSettings', async () => {
    docs.set('userNotificationSettings/alice', { userId: 'alice', globalMute: true });
    const id = await NotificationService.createBudgetWarningNotification({
      userId: 'alice',
      budgetId: 'b1',
      category: 'Office expenses',
      percentage: 80,
      current: 80,
      limit: 100,
    });
    expect(id).toBeNull();
    expect(notifications()).toHaveLength(0);
  });

  it('respects a disabled in-app preference for the type', async () => {
    docs.set('users/alice/notificationPreferences/default', {
      [NotificationType.BUDGET_WARNING]: { inApp: false, push: false, frequency: 'realtime' },
    });
    const id = await NotificationService.createBudgetWarningNotification({
      userId: 'alice',
      budgetId: 'b1',
      category: 'Office expenses',
      percentage: 80,
      current: 80,
      limit: 100,
    });
    expect(id).toBeNull();
    expect(notifications()).toHaveLength(0);
  });

  it('groups repeated group-expense notifications into one document', async () => {
    const params = {
      userId: 'alice',
      groupId: 'g1',
      groupName: 'Team',
      expenseId: 'e1',
      vendor: 'Staples',
      amount: 10,
      actorId: 'bob',
      actorName: 'Bob',
    };
    // Keep the test independent of the quiet-hours window.
    docs.set('userNotificationSettings/alice', { quietHoursStart: '00:00', quietHoursEnd: '00:00' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20, 12, 0, 0));

    const first = await NotificationService.createGroupExpenseNotification(params);
    expect(first).toBeTruthy();
    const second = await NotificationService.createGroupExpenseNotification({ ...params, expenseId: 'e2' });
    expect(second).toBeNull(); // folded into the first

    const all = notifications();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      userId: 'alice',
      isGrouped: true,
      groupKey: 'group_expense_added_g1_alice',
      groupCount: 2,
      title: '2 new expenses added',
    });
  });
});
