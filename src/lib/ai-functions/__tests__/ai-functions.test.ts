// @vitest-environment node

import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Minimal in-memory stand-in for the Admin SDK. It follows Firestore's
 * comparison semantics closely enough to catch shape bugs: a range filter
 * never matches values of a different type (a string bound never matches a
 * Timestamp field), and missing fields never match.
 */
type Data = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };
type Order = { field: string; dir: 'asc' | 'desc' };

const store = new Map<string, Map<string, Data>>();
const queries: Array<{ collection: string; filters: Filter[] }> = [];

function readField(data: Data, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, key) => (value && typeof value === 'object' ? (value as Data)[key] : undefined),
    data,
  );
}

function typeOf(value: unknown): string {
  if (value instanceof Timestamp) return 'timestamp';
  if (value === null) return 'null';
  return typeof value;
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matches(data: Data, filter: Filter): boolean {
  const value = readField(data, filter.field);
  if (value === undefined) return false;
  if (filter.op === '==') {
    if (value instanceof Timestamp && filter.value instanceof Timestamp) {
      return value.isEqual(filter.value);
    }
    return value === filter.value;
  }
  if (typeOf(value) !== typeOf(filter.value)) return false;
  const c = compare(value, filter.value);
  switch (filter.op) {
    case '>=':
      return c >= 0;
    case '>':
      return c > 0;
    case '<=':
      return c <= 0;
    case '<':
      return c < 0;
    default:
      throw new Error(`Unsupported operator ${filter.op}`);
  }
}

class FakeQuery {
  constructor(
    private readonly name: string,
    private readonly filters: Filter[] = [],
    private readonly orders: Order[] = [],
    private readonly max?: number,
  ) {}

  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.name, [...this.filters, { field, op, value }], this.orders, this.max);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.name, this.filters, [...this.orders, { field, dir }], this.max);
  }

  limit(n: number) {
    return new FakeQuery(this.name, this.filters, this.orders, n);
  }

  async get() {
    queries.push({ collection: this.name, filters: this.filters });
    let docs = [...(store.get(this.name)?.entries() ?? [])]
      .filter(([, data]) => this.filters.every((f) => matches(data, f)))
      .filter(([, data]) => this.orders.every((o) => readField(data, o.field) !== undefined));
    for (const order of [...this.orders].reverse()) {
      docs = [...docs].sort((a, b) => {
        const c = compare(readField(a[1], order.field), readField(b[1], order.field));
        return order.dir === 'desc' ? -c : c;
      });
    }
    if (this.max !== undefined) docs = docs.slice(0, this.max);
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs.map(([id, data]) => ({ id, data: () => data })),
    };
  }

  doc(id: string) {
    const name = this.name;
    return {
      async get() {
        const data = store.get(name)?.get(id);
        return { id, exists: data !== undefined, data: () => data };
      },
    };
  }
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: (name: string) => new FakeQuery(name) },
}));

const ai = await import('../index');

function put(collection: string, id: string, data: Data) {
  if (!store.has(collection)) store.set(collection, new Map());
  store.get(collection)!.set(id, data);
}

/** Expenses are stored like the API stores them: a Timestamp at local noon. */
function day(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0));
}

function expense(id: string, data: Data & { date: string }) {
  put('expenses', id, {
    vendor: 'Staples',
    category: 'Office expenses',
    amount: 10,
    expenseType: 'personal',
    groupId: null,
    createdAt: day(data.date),
    ...data,
    date: day(data.date),
  });
}

const ALICE = 'alice';
const BOB = 'bob';
const MALLORY = 'mallory';

beforeEach(() => {
  store.clear();
  queries.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 20, 9, 0, 0)); // 20 June 2026

  put('groupMembers', `g1_${ALICE}`, { groupId: 'g1', userId: ALICE, status: 'active', role: 'member' });
  put('groupMembers', `g1_${BOB}`, { groupId: 'g1', userId: BOB, status: 'active', role: 'owner' });
  put('groupMembers', `g1_${MALLORY}`, { groupId: 'g1', userId: MALLORY, status: 'removed', role: 'admin' });

  // Alice, personal
  expense('a1', { userId: ALICE, vendor: 'Costco', category: 'Groceries', amount: 40, date: '2026-06-03' });
  expense('a2', { userId: ALICE, vendor: 'Staples', amount: 25, date: '2026-06-10' });
  expense('a-may', { userId: ALICE, vendor: 'Staples', amount: 100, date: '2026-05-15' });
  // Group g1, by Alice and Bob
  expense('g-alice', {
    userId: ALICE,
    expenseType: 'group',
    groupId: 'g1',
    vendor: 'Bell',
    category: 'Telephone',
    amount: 60,
    date: '2026-06-05',
  });
  expense('g-bob', {
    userId: BOB,
    expenseType: 'group',
    groupId: 'g1',
    vendor: 'Rogers',
    category: 'Telephone',
    amount: 90,
    date: '2026-06-12',
  });
  // Bob, personal (must never leak to Alice)
  expense('b1', { userId: BOB, vendor: 'Secret', amount: 999, date: '2026-06-11' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('date handling (expense.date is a Firestore Timestamp)', () => {
  it('getExpenseSummary counts expenses in a YYYY-MM-DD range', async () => {
    const result = await ai.getExpenseSummary(ALICE, { startDate: '2026-06-01', endDate: '2026-06-30' });
    // a1 + a2 + Alice's own group expense; never Bob's
    expect(result.totalExpenses).toBe(3);
    expect(result.totalAmount).toBe(125);
  });

  it('includes both boundary days', async () => {
    const result = await ai.getExpenseSummary(ALICE, { startDate: '2026-06-03', endDate: '2026-06-10' });
    expect(result.totalExpenses).toBe(3);
  });

  it('comparePeriods compares Timestamp-dated expenses', async () => {
    const result = await ai.comparePeriods(ALICE, {
      period1Start: '2026-05-01',
      period1End: '2026-05-31',
      period2Start: '2026-06-01',
      period2End: '2026-06-30',
      category: 'Office expenses',
    });
    expect(result.period1.totalAmount).toBe(100);
    expect(result.period2.totalAmount).toBe(25);
    expect(result.comparison.trend).toBe('decreased');
  });

  it('returns expense dates as YYYY-MM-DD strings, not Timestamp objects', async () => {
    const result = await ai.getRecentExpenses(ALICE, { limit: 2 });
    expect(result.expenses.map((e) => e.date)).toEqual(['2026-06-10', '2026-06-05']);
  });

  it('rejects malformed dates instead of silently matching nothing', async () => {
    await expect(ai.getExpenseSummary(ALICE, { startDate: 'June 1', endDate: '2026-06-30' })).rejects.toThrow(
      /YYYY-MM-DD/,
    );
  });
});

describe('group scoping', () => {
  it('group summaries include every member\'s group expenses', async () => {
    const result = await ai.getExpenseSummary(ALICE, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      groupId: 'g1',
    });
    expect(result.totalExpenses).toBe(2);
    expect(result.totalAmount).toBe(150);
  });

  it('getGroupExpenses filters by date and formats dates', async () => {
    const result = await ai.getGroupExpenses(ALICE, { groupId: 'g1', startDate: '2026-06-10' });
    expect(result.expenses).toEqual([
      expect.objectContaining({ id: 'g-bob', date: '2026-06-12', amount: 90 }),
    ]);
  });

  it('refuses group data to non-members and former members', async () => {
    await expect(ai.getGroupExpenses(MALLORY, { groupId: 'g1' })).rejects.toThrow(/not an active member/i);
    await expect(ai.getGroupExpenses('stranger', { groupId: 'g1' })).rejects.toThrow(/not an active member/i);
    await expect(
      ai.getExpenseSummary('stranger', { startDate: '2026-06-01', endDate: '2026-06-30', groupId: 'g1' }),
    ).rejects.toThrow(/not an active member/i);
    await expect(ai.searchExpenses('stranger', { groupId: 'g1' })).rejects.toThrow(/not an active member/i);
  });

  it('category breakdown for a group covers all members', async () => {
    const result = await ai.getCategoryBreakdown(ALICE, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      groupId: 'g1',
    });
    expect(result.categories).toEqual([
      { category: 'Telephone', amount: 150, count: 2, percentage: 100 },
    ]);
  });

  it('category breakdown of an empty range has no NaN percentages', async () => {
    const result = await ai.getCategoryBreakdown(ALICE, { startDate: '2020-01-01', endDate: '2020-01-31' });
    expect(result.totalAmount).toBe(0);
    expect(result.categories).toEqual([]);
  });
});

describe('searchExpenses', () => {
  it('applies the vendor filter before the result limit', async () => {
    const result = await ai.searchExpenses(ALICE, { vendor: 'costco', limit: 1 });
    expect(result.expenses).toEqual([expect.objectContaining({ id: 'a1', vendor: 'Costco', date: '2026-06-03' })]);
  });

  it('filters by category, amount and date', async () => {
    const result = await ai.searchExpenses(ALICE, {
      category: 'Office expenses',
      minAmount: 20,
      startDate: '2026-06-01',
    });
    expect(result.expenses.map((e) => e.id)).toEqual(['a2']);
  });
});

describe('getBudgetStatus', () => {
  beforeEach(() => {
    put('budgets_personal', 'bp-june', {
      userId: ALICE,
      category: 'Office expenses',
      monthlyLimit: 200,
      period: { month: 6, year: 2026 },
    });
    put('budgets_personal', 'bp-may', {
      userId: ALICE,
      category: 'Office expenses',
      monthlyLimit: 50,
      period: { month: 5, year: 2026 },
    });
    put('budgets_personal', 'bp-bob', {
      userId: BOB,
      category: 'Office expenses',
      monthlyLimit: 10,
      period: { month: 6, year: 2026 },
    });
    // Group budgets have no userId: they belong to the group.
    put('budgets_group', 'bg-june', {
      groupId: 'g1',
      category: 'Telephone',
      monthlyLimit: 300,
      period: { month: 6, year: 2026 },
      setBy: BOB,
    });
  });

  it('uses only the current month\'s personal budgets and personal spending', async () => {
    const result = await ai.getBudgetStatus(ALICE, {});
    expect(result.budgets).toEqual([
      expect.objectContaining({ category: 'Office expenses', limit: 200, spent: 25, remaining: 175, percentUsed: 13 }),
    ]);
    expect(result.totalBudget).toBe(200);
  });

  it('handles last_month', async () => {
    const result = await ai.getBudgetStatus(ALICE, { period: 'last_month' });
    expect(result.startDate).toBe('2026-05-01');
    expect(result.endDate).toBe('2026-05-31');
    expect(result.budgets).toEqual([
      expect.objectContaining({ category: 'Office expenses', limit: 50, spent: 100, status: 'over' }),
    ]);
  });

  it('reads group budgets by groupId and counts every member\'s spending', async () => {
    const result = await ai.getBudgetStatus(ALICE, { groupId: 'g1' });
    expect(result.budgets).toEqual([
      expect.objectContaining({ category: 'Telephone', limit: 300, spent: 150, percentUsed: 50 }),
    ]);
    const budgetQuery = queries.find((q) => q.collection === 'budgets_group');
    expect(budgetQuery?.filters.some((f) => f.field === 'userId')).toBe(false);
  });

  it('refuses a group budget to non-members', async () => {
    await expect(ai.getBudgetStatus('stranger', { groupId: 'g1' })).rejects.toThrow(/not an active member/i);
  });
});
