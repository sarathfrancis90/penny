// @vitest-environment node

import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The admin console routes that touch Firestore must run on the Admin SDK
 * (the client SDK has no signed-in user on the server, so the rules deny
 * it) and, because the Admin SDK bypasses rules, must verify a Firebase ID
 * token carrying the `admin: true` custom claim. The legacy admin cookie
 * alone is not enough.
 */

type Data = Record<string, unknown>;
const store = new Map<string, Map<string, Data>>();
const deleted: string[] = [];
const written: Array<{ path: string; data: Data }> = [];

function col(name: string) {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
}

function compare(a: unknown, b: unknown) {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis();
  return a === b ? 0 : (a as number) < (b as number) ? -1 : 1;
}

class FakeQuery {
  constructor(
    private readonly name: string,
    private readonly filters: Array<[string, string, unknown]> = [],
    private readonly order?: [string, 'asc' | 'desc'],
  ) {}
  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.name, [...this.filters, [field, op, value]], this.order);
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.name, this.filters, [field, dir]);
  }
  select() {
    return this;
  }
  limit() {
    return this;
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this.rows().length }) }) };
  }
  private rows() {
    let rows = [...col(this.name).entries()].filter(([, d]) =>
      this.filters.every(([f, op, v]) => {
        const c = compare(d[f], v);
        if (op === '==') return d[f] === v;
        if (op === '>=') return d[f] !== undefined && c >= 0;
        if (op === '<=') return d[f] !== undefined && c <= 0;
        throw new Error(`op ${op}`);
      }),
    );
    if (this.order) {
      const [f, dir] = this.order;
      rows = rows.sort((a, b) => (dir === 'desc' ? -1 : 1) * compare(a[1][f], b[1][f]));
    }
    return rows;
  }
  async get() {
    const rows = this.rows();
    return {
      size: rows.length,
      empty: rows.length === 0,
      docs: rows.map(([id, data]) => ({ id, data: () => data, ref: { path: `${this.name}/${id}` } })),
    };
  }
  doc(id: string) {
    const name = this.name;
    return {
      path: `${name}/${id}`,
      async get() {
        const data = col(name).get(id);
        return { exists: data !== undefined, data: () => data };
      },
      async set(data: Data) {
        col(name).set(id, data);
        written.push({ path: `${name}/${id}`, data });
      },
    };
  }
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => new FakeQuery(name),
    batch: () => {
      const ops: string[] = [];
      return {
        delete: (ref: { path: string }) => ops.push(ref.path),
        commit: async () => {
          for (const path of ops) {
            const [name, id] = path.split('/');
            col(name).delete(id);
            deleted.push(path);
          }
        },
      };
    },
  },
  adminAuth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'admin-token') return { uid: 'founder', admin: true };
      if (token === 'user-token') return { uid: 'alice', admin: false };
      throw new Error('bad token');
    }),
    getUser: vi.fn(async (uid: string) => ({
      uid,
      email: `${uid}@example.com`,
      displayName: uid,
      photoURL: null,
      emailVerified: true,
      disabled: false,
      metadata: { creationTime: '2026-01-01T00:00:00Z', lastSignInTime: '2026-06-01T00:00:00Z' },
    })),
    listUsers: vi.fn(async () => ({
      users: [
        {
          uid: 'alice',
          email: 'alice@example.com',
          displayName: 'Alice',
          photoURL: null,
          emailVerified: true,
          disabled: false,
          metadata: { creationTime: '2026-01-01T00:00:00Z', lastSignInTime: '2026-06-01T00:00:00Z' },
        },
      ],
    })),
  },
}));

// A server route must never fall back to the client SDK.
vi.mock('@/lib/firebase', () => {
  throw new Error('client Firebase SDK imported by an admin API route');
});

const configRoute = await import('../config/route');
const costsRoute = await import('../costs/route');
const usersRoute = await import('../users/route');
const userRoute = await import('../users/[userId]/route');
const exportRoute = await import('../users/[userId]/export/route');
const analyticsRoute = await import('../analytics/route');
const systemRoute = await import('../system/route');

function req(url: string, token?: string, init: { method?: string; body?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${url}`, { ...init, headers });
}

const ctx = (userId: string) => ({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  store.clear();
  deleted.length = 0;
  written.length = 0;
  const day = (d: string) => Timestamp.fromDate(new Date(`${d}T12:00:00`));
  col('expenses').set('e1', {
    userId: 'alice',
    vendor: 'Staples',
    amount: 10,
    category: 'Office expenses',
    date: day('2026-06-01'),
    createdAt: day('2026-06-01'),
  });
  col('expenses').set('e2', {
    userId: 'alice',
    vendor: 'Bell',
    amount: 5,
    category: 'Telephone',
    date: day('2026-06-02'),
    createdAt: day('2026-06-02'),
  });
  col('expenses').set('e3', { userId: 'bob', vendor: 'X', amount: 1, createdAt: day('2026-06-02') });
  col('analytics').set('a1', {
    userId: 'alice',
    timestamp: Timestamp.now(),
    success: true,
    estimatedTokens: 100,
    estimatedCost: 0.5,
    duration: 10,
  });
});

const cases: Array<[string, () => Promise<Response>, (token?: string) => Promise<Response>]> = [
  ['GET /api/admin/config', () => configRoute.GET(req('/api/admin/config')), (t) => configRoute.GET(req('/api/admin/config', t))],
  [
    'POST /api/admin/config',
    () => configRoute.POST(req('/api/admin/config', undefined, { method: 'POST', body: '{}' })),
    (t) => configRoute.POST(req('/api/admin/config', t, { method: 'POST', body: '{}' })),
  ],
  ['GET /api/admin/costs', () => costsRoute.GET(req('/api/admin/costs')), (t) => costsRoute.GET(req('/api/admin/costs', t))],
  ['GET /api/admin/users', () => usersRoute.GET(req('/api/admin/users')), (t) => usersRoute.GET(req('/api/admin/users', t))],
  [
    'GET /api/admin/users/[userId]',
    () => userRoute.GET(req('/api/admin/users/alice'), ctx('alice')),
    (t) => userRoute.GET(req('/api/admin/users/alice', t), ctx('alice')),
  ],
  [
    'DELETE /api/admin/users/[userId]',
    () => userRoute.DELETE(req('/api/admin/users/alice', undefined, { method: 'DELETE' }), ctx('alice')),
    (t) => userRoute.DELETE(req('/api/admin/users/alice', t, { method: 'DELETE' }), ctx('alice')),
  ],
  [
    'GET /api/admin/users/[userId]/export',
    () => exportRoute.GET(req('/api/admin/users/alice/export'), ctx('alice')),
    (t) => exportRoute.GET(req('/api/admin/users/alice/export', t), ctx('alice')),
  ],
  [
    'GET /api/admin/analytics',
    () => analyticsRoute.GET(req('/api/admin/analytics?days=30')),
    (t) => analyticsRoute.GET(req('/api/admin/analytics?days=30', t)),
  ],
  [
    'GET /api/admin/system',
    () => systemRoute.GET(req('/api/admin/system')),
    (t) => systemRoute.GET(req('/api/admin/system', t)),
  ],
];

describe.each(cases)('%s auth', (_name, withoutToken, withToken) => {
  it('returns 401 without a bearer token', async () => {
    expect((await withoutToken()).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    expect((await withToken('garbage')).status).toBe(401);
  });

  it('returns 403 for a signed-in user without the admin claim', async () => {
    expect((await withToken('user-token')).status).toBe(403);
    expect(deleted).toEqual([]);
    expect(written).toEqual([]);
  });

  it('returns 200 for an admin', async () => {
    expect((await withToken('admin-token')).status).toBe(200);
  });
});

describe('admin routes read real data through the Admin SDK', () => {
  it('config: saves an update with the admin uid', async () => {
    const res = await configRoute.POST(
      req('/api/admin/config', 'admin-token', { method: 'POST', body: JSON.stringify({ maintenance: { mode: true, message: 'x' } }) }),
    );
    expect(res.status).toBe(200);
    expect(written).toEqual([
      expect.objectContaining({
        path: 'system/config',
        data: expect.objectContaining({ maintenance: { mode: true, message: 'x' }, updatedBy: 'founder' }),
      }),
    ]);
  });

  it('costs: counts expenses and analytics', async () => {
    const body = await (await costsRoute.GET(req('/api/admin/costs?days=30', 'admin-token'))).json();
    expect(body.costs.firestore.collections).toEqual({ expenses: 3, analytics: 1 });
    expect(body.costs.ai.totalRequests).toBe(1);
  });

  it('users: merges Auth users with expense totals', async () => {
    const body = await (await usersRoute.GET(req('/api/admin/users', 'admin-token'))).json();
    expect(body.registeredUsers).toBe(1);
    expect(body.usersWithExpenses).toBe(2);
    expect(body.users.find((u: { userId: string }) => u.userId === 'alice')).toMatchObject({
      expenseCount: 2,
      totalAmount: 15,
    });
  });

  it('user detail: returns the user\'s stats', async () => {
    const body = await (await userRoute.GET(req('/api/admin/users/alice', 'admin-token'), ctx('alice'))).json();
    expect(body.stats).toMatchObject({ expenseCount: 2, totalAmount: 15, apiCalls: 1 });
  });

  it('delete: removes only that user\'s expenses', async () => {
    const res = await userRoute.DELETE(
      req('/api/admin/users/alice?type=expenses', 'admin-token', { method: 'DELETE' }),
      ctx('alice'),
    );
    expect(res.status).toBe(200);
    expect(deleted.sort()).toEqual(['expenses/e1', 'expenses/e2']);
    expect(col('expenses').has('e3')).toBe(true);
  });

  it('export: returns expenses newest first with YYYY-MM-DD dates', async () => {
    const body = await (
      await exportRoute.GET(req('/api/admin/users/alice/export', 'admin-token'), ctx('alice'))
    ).json();
    expect(body.data.userProfile.uid).toBe('alice');
    expect(body.data.expenses.map((e: { id: string; date: string }) => [e.id, e.date])).toEqual([
      ['e2', '2026-06-02'],
      ['e1', '2026-06-01'],
    ]);
    expect(body.data.summary.totalExpenses).toBe(2);
  });
});
