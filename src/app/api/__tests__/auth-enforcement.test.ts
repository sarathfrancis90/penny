// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every web API route that reads or writes user data must take the caller's
 * identity from a verified Firebase ID token (Authorization: Bearer), never
 * from a userId in the body or query:
 *  - no token            -> 401
 *  - userId != token uid  -> 403
 *  - own data             -> ok
 */

type Data = Record<string, unknown>;
const store = new Map<string, Map<string, Data>>();
let autoId = 0;

function col(path: string) {
  if (!store.has(path)) store.set(path, new Map());
  return store.get(path)!;
}

/** Firestore rejects undefined field values; so does this fake. */
function assertNoUndefined(value: unknown, path = ''): void {
  if (value === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}")`);
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, path ? `${path}.${k}` : k);
  }
}

function applyUpdate(target: Data, update: Data) {
  for (const [key, value] of Object.entries(update)) {
    const parts = key.split('.');
    let node = target;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
      node = node[part] as Data;
    }
    node[parts[parts.length - 1]] = value;
  }
}

function docRef(colPath: string, id: string) {
  return {
    id,
    path: `${colPath}/${id}`,
    async get() {
      const data = col(colPath).get(id);
      return { id, exists: data !== undefined, data: () => data, ref: docRef(colPath, id) };
    },
    async set(data: Data) {
      assertNoUndefined(data);
      col(colPath).set(id, { ...data });
    },
    async update(data: Data) {
      assertNoUndefined(data);
      const existing = col(colPath).get(id);
      if (!existing) throw new Error('not-found');
      applyUpdate(existing, data);
    },
    async delete() {
      col(colPath).delete(id);
    },
    collection(name: string) {
      return new FakeQuery(`${colPath}/${id}/${name}`);
    },
  };
}

class FakeQuery {
  constructor(
    private readonly path: string,
    private readonly filters: Array<[string, string, unknown]> = [],
  ) {}
  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.path, [...this.filters, [field, op, value]]);
  }
  orderBy() {
    return this;
  }
  limit() {
    return this;
  }
  doc(id?: string) {
    return docRef(this.path, id ?? `auto-${++autoId}`);
  }
  async add(data: Data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
  async get() {
    const rows = [...col(this.path).entries()].filter(([, d]) =>
      this.filters.every(([field, op, value]) => {
        const actual = field.split('.').reduce<unknown>((n, k) => (n as Data | undefined)?.[k], d);
        if (op === '==') return actual === value;
        if (op === 'in') return (value as unknown[]).includes(actual);
        if (op === '>=' || op === '<=') return actual !== undefined;
        throw new Error(`unsupported op ${op}`);
      }),
    );
    return {
      empty: rows.length === 0,
      size: rows.length,
      docs: rows.map(([id, data]) => ({ id, data: () => data, ref: docRef(this.path, id) })),
    };
  }
}

const batchCommits: number[] = [];

vi.mock('@/lib/firebase-admin', () => ({
  adminApp: {},
  adminDb: {
    collection: (name: string) => new FakeQuery(name),
    batch: () => {
      const ops: Array<{ path: string }> = [];
      let committed = false;
      return {
        delete(ref: { path: string }) {
          if (committed) throw new Error('Cannot modify a WriteBatch that has been committed.');
          ops.push(ref);
        },
        async commit() {
          if (committed) throw new Error('Cannot modify a WriteBatch that has been committed.');
          committed = true;
          batchCommits.push(ops.length);
          for (const { path } of ops) {
            const i = path.lastIndexOf('/');
            col(path.slice(0, i)).delete(path.slice(i + 1));
          }
        },
      };
    },
  },
  adminAuth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'alice-token') return { uid: 'alice', email: 'alice@example.com' };
      if (token === 'bob-token') return { uid: 'bob', email: 'bob@example.com' };
      throw new Error('auth/argument-error');
    }),
    deleteUser: vi.fn(async () => undefined),
    getUserByEmail: vi.fn(async (email: string) => {
      if (email === 'bob@example.com') return { uid: 'bob', email };
      throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    }),
  },
}));

const deleteFiles = vi.fn(async () => undefined);
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ deleteFiles }) }),
}));

vi.mock('@/lib/storageService', () => ({ deleteReceipt: vi.fn(async () => undefined) }));

const checkAndNotify = vi.fn(async () => undefined);
vi.mock('@/lib/services/budgetNotificationService', () => ({
  BudgetNotificationService: { checkAndNotify },
}));

vi.mock('@/lib/services/pushService', () => ({
  PushService: {
    sendToUsers: vi.fn(async () => undefined),
    sendToUser: vi.fn(async () => undefined),
  },
}));

const expenseRoute = await import('../expenses/route');
const expenseByIdRoute = await import('../expenses/[id]/route');
const conversationsRoute = await import('../conversations/route');
const groupRoute = await import('../groups/[groupId]/route');
const leaveRoute = await import('../groups/[groupId]/leave/route');
const membersRoute = await import('../groups/[groupId]/members/route');
const accountDeleteRoute = await import('../account/delete/route');

function req(url: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

const memberPermissions = {
  canAddExpenses: true,
  canEditOwnExpenses: true,
  canEditAllExpenses: false,
  canDeleteExpenses: false,
  canInviteMembers: false,
  canRemoveMembers: false,
};

const newExpense = {
  vendor: 'Coffee Shop',
  amount: 12.5,
  date: '2026-11-20',
  category: 'Meals and entertainment',
};

beforeEach(() => {
  store.clear();
  batchCommits.length = 0;
  checkAndNotify.mockClear();
  deleteFiles.mockClear();

  col('expenses').set('alice-exp', {
    userId: 'alice', vendor: 'Staples', amount: 40, category: 'Office expenses',
    expenseType: 'personal', groupId: null,
  });
  col('expenses').set('bob-exp', {
    userId: 'bob', vendor: 'Bell', amount: 80, category: 'Telephone',
    expenseType: 'personal', groupId: null,
  });
  col('conversations').set('alice-conv', { userId: 'alice', status: 'active', title: 'Alice' });
  col('conversations').set('bob-conv', { userId: 'bob', status: 'active', title: 'Bob' });
  col('groups').set('g1', {
    name: 'Team', icon: '👥', settings: { requireApproval: false, allowMemberInvites: true },
    stats: { memberCount: 2, expenseCount: 0, totalAmount: 0 },
  });
  col('groupMembers').set('g1_alice', {
    groupId: 'g1', userId: 'alice', role: 'owner', status: 'active',
    permissions: { ...memberPermissions, canEditAllExpenses: true, canDeleteExpenses: true, canInviteMembers: true },
  });
  col('groupMembers').set('g1_bob', {
    groupId: 'g1', userId: 'bob', role: 'member', status: 'active', permissions: memberPermissions,
  });
});

describe('PUT/DELETE /api/expenses/[id]', () => {
  it('rejects requests without a token (401)', async () => {
    const put = await expenseByIdRoute.PUT(
      req('/api/expenses/alice-exp', { method: 'PUT', body: { amount: 1 } }),
      ctx({ id: 'alice-exp' }),
    );
    expect(put.status).toBe(401);

    const del = await expenseByIdRoute.DELETE(
      req('/api/expenses/alice-exp', { method: 'DELETE' }),
      ctx({ id: 'alice-exp' }),
    );
    expect(del.status).toBe(401);
    expect(col('expenses').get('alice-exp')?.amount).toBe(40);
  });

  it("forbids changing someone else's expense (403)", async () => {
    const put = await expenseByIdRoute.PUT(
      req('/api/expenses/bob-exp', { method: 'PUT', token: 'alice-token', body: { amount: 1 } }),
      ctx({ id: 'bob-exp' }),
    );
    expect(put.status).toBe(403);

    const del = await expenseByIdRoute.DELETE(
      req('/api/expenses/bob-exp', { method: 'DELETE', token: 'alice-token' }),
      ctx({ id: 'bob-exp' }),
    );
    expect(del.status).toBe(403);
    expect(col('expenses').get('bob-exp')).toMatchObject({ amount: 80 });
  });

  it('lets the owner update and delete their own expense', async () => {
    const put = await expenseByIdRoute.PUT(
      req('/api/expenses/alice-exp', { method: 'PUT', token: 'alice-token', body: { amount: 55 } }),
      ctx({ id: 'alice-exp' }),
    );
    expect(put.status).toBe(200);
    expect(col('expenses').get('alice-exp')?.amount).toBe(55);

    const del = await expenseByIdRoute.DELETE(
      req('/api/expenses/alice-exp', { method: 'DELETE', token: 'alice-token' }),
      ctx({ id: 'alice-exp' }),
    );
    expect(del.status).toBe(200);
    expect(col('expenses').has('alice-exp')).toBe(false);
  });

  it('applies group permissions: members edit their own, only admins delete others', async () => {
    col('expenses').set('g-alice', {
      userId: 'alice', vendor: 'Hotel', amount: 200, category: 'Travel (including transportation fees, accommodations, and meals)',
      expenseType: 'group', groupId: 'g1',
    });
    const memberEdit = await expenseByIdRoute.PUT(
      req('/api/expenses/g-alice', { method: 'PUT', token: 'bob-token', body: { amount: 1 } }),
      ctx({ id: 'g-alice' }),
    );
    expect(memberEdit.status).toBe(403);

    const memberDelete = await expenseByIdRoute.DELETE(
      req('/api/expenses/g-alice', { method: 'DELETE', token: 'bob-token' }),
      ctx({ id: 'g-alice' }),
    );
    expect(memberDelete.status).toBe(403);

    const ownerDelete = await expenseByIdRoute.DELETE(
      req('/api/expenses/g-alice', { method: 'DELETE', token: 'alice-token' }),
      ctx({ id: 'g-alice' }),
    );
    expect(ownerDelete.status).toBe(200);
  });
});

describe('POST /api/expenses', () => {
  it('rejects requests without a token, even with a body userId (401)', async () => {
    const res = await expenseRoute.POST(
      req('/api/expenses', { method: 'POST', body: { ...newExpense, userId: 'alice' } }),
    );
    expect(res.status).toBe(401);
    expect(col('expenses').size).toBe(2);
  });

  it('rejects a body userId that differs from the token (403)', async () => {
    const res = await expenseRoute.POST(
      req('/api/expenses', { method: 'POST', token: 'alice-token', body: { ...newExpense, userId: 'bob' } }),
    );
    expect(res.status).toBe(403);
    expect(col('expenses').size).toBe(2);
  });

  it("creates the expense for the token's user", async () => {
    const res = await expenseRoute.POST(
      req('/api/expenses', { method: 'POST', token: 'alice-token', body: newExpense }),
    );
    expect(res.status).toBe(200);
    const { id } = await res.json();
    expect(col('expenses').get(id)).toMatchObject({ userId: 'alice', expenseType: 'personal' });
  });

  it('refuses a group expense from a non-member (403)', async () => {
    col('groups').set('g2', { name: 'Other', settings: {}, stats: {} });
    const res = await expenseRoute.POST(
      req('/api/expenses', { method: 'POST', token: 'alice-token', body: { ...newExpense, groupId: 'g2' } }),
    );
    expect(res.status).toBe(403);
  });

  it('notifies other group members even when the actor has no photoURL', async () => {
    const res = await expenseRoute.POST(
      req('/api/expenses', { method: 'POST', token: 'alice-token', body: { ...newExpense, groupId: 'g1' } }),
    );
    expect(res.status).toBe(200);
    const notifications = [...col('notifications').values()];
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: 'bob', type: 'group_expense_added' });
    expect(notifications[0]).not.toHaveProperty('actorAvatar');
  });

  it('checks budgets against their monthlyLimit', async () => {
    col('budgets_personal').set('b1', {
      userId: 'alice', category: newExpense.category, monthlyLimit: 100,
      period: { month: 11, year: 2026 },
    });
    await expenseRoute.POST(
      req('/api/expenses', { method: 'POST', token: 'alice-token', body: newExpense }),
    );
    expect(checkAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({ budgetId: 'b1', budgetLimit: 100, userId: 'alice' }),
    );
  });
});

describe('GET /api/conversations', () => {
  it('rejects a query userId without a token (401)', async () => {
    const res = await conversationsRoute.GET(req('/api/conversations?userId=bob'));
    expect(res.status).toBe(401);
  });

  it("refuses to list another user's conversations (403)", async () => {
    const res = await conversationsRoute.GET(req('/api/conversations?userId=bob', { token: 'alice-token' }));
    expect(res.status).toBe(403);
  });

  it("lists only the token user's conversations", async () => {
    const res = await conversationsRoute.GET(req('/api/conversations', { token: 'alice-token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversations.map((c: { id: string }) => c.id)).toEqual(['alice-conv']);
  });
});

describe('group routes', () => {
  it('GET /api/groups/[groupId] requires a token and membership', async () => {
    expect((await groupRoute.GET(req('/api/groups/g1?userId=alice'), ctx({ groupId: 'g1' }))).status).toBe(401);

    col('groupMembers').delete('g1_bob');
    const outsider = await groupRoute.GET(req('/api/groups/g1', { token: 'bob-token' }), ctx({ groupId: 'g1' }));
    expect(outsider.status).toBe(403);

    const member = await groupRoute.GET(req('/api/groups/g1', { token: 'alice-token' }), ctx({ groupId: 'g1' }));
    expect(member.status).toBe(200);
  });

  it('POST /api/groups/[groupId]/leave needs a token and leaves as the token user', async () => {
    const anonymous = await leaveRoute.POST(
      req('/api/groups/g1/leave', { method: 'POST', body: { userId: 'bob' } }),
      ctx({ groupId: 'g1' }),
    );
    expect(anonymous.status).toBe(401);
    expect(col('groupMembers').get('g1_bob')?.status).toBe('active');

    const spoofed = await leaveRoute.POST(
      req('/api/groups/g1/leave', { method: 'POST', token: 'alice-token', body: { userId: 'bob' } }),
      ctx({ groupId: 'g1' }),
    );
    expect(spoofed.status).toBe(403);

    const res = await leaveRoute.POST(
      req('/api/groups/g1/leave', { method: 'POST', token: 'bob-token' }),
      ctx({ groupId: 'g1' }),
    );
    expect(res.status).toBe(200);
    expect(col('groupMembers').get('g1_bob')?.status).toBe('left');
  });

  it('POST /api/groups/[groupId]/members notifies an invitee found in Firebase Auth', async () => {
    col('groupMembers').delete('g1_bob');
    const res = await membersRoute.POST(
      req('/api/groups/g1/members', { method: 'POST', token: 'alice-token', body: { email: 'bob@example.com' } }),
      ctx({ groupId: 'g1' }),
    );
    expect(res.status).toBe(200);
    const notifications = [...col('notifications').values()];
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: 'bob', type: 'group_invitation' });
  });
});

describe('DELETE /api/account/delete', () => {
  it('requires a token (401)', async () => {
    const res = await accountDeleteRoute.DELETE(req('/api/account/delete', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it("deletes all of the user's data in fresh batches, plus their files", async () => {
    for (let i = 0; i < 1000; i++) {
      col('expenses').set(`bulk-${i}`, { userId: 'alice', amount: 1 });
    }
    col('savings_contributions').set('c1', { userId: 'alice', amount: 5 });
    col('users').set('alice', { email: 'alice@example.com' });
    col('users/alice/notificationPreferences').set('default', { muted: false });

    const res = await accountDeleteRoute.DELETE(
      req('/api/account/delete', { method: 'DELETE', token: 'alice-token' }),
    );
    expect(res.status).toBe(200);

    const aliceExpenses = [...col('expenses').values()].filter((e) => e.userId === 'alice');
    expect(aliceExpenses).toHaveLength(0);
    expect(col('expenses').has('bob-exp')).toBe(true);
    expect(col('savings_contributions').size).toBe(0);
    expect(col('users/alice/notificationPreferences').size).toBe(0);
    expect(col('users').has('alice')).toBe(false);
    expect(batchCommits.length).toBeGreaterThan(2);
    expect(Math.max(...batchCommits)).toBeLessThanOrEqual(450);
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'receipts/alice/' });
  });
});
