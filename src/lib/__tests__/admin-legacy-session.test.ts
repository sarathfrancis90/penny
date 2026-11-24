// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The legacy admin-console login (username/password -> HMAC cookie) must
 * fail closed: with no configured ADMIN_USERNAME, ADMIN_PASSWORD or
 * ADMIN_SESSION_SECRET it accepts no credentials, issues no sessions and
 * honours no cookies. It must never fall back to built-in values.
 */

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
}));

const VARS = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

function configure() {
  process.env.ADMIN_USERNAME = 'test-admin-user';
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
}

async function load() {
  vi.resetModules();
  return import('../admin-auth');
}

beforeEach(() => {
  cookieJar.clear();
  for (const v of VARS) saved[v] = process.env[v];
});

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe('legacy admin login when configured', () => {
  it('accepts only the configured credentials', async () => {
    configure();
    const auth = await load();
    expect(auth.verifyAdminCredentials('test-admin-user', 'test-admin-password')).toBe(true);
    expect(auth.verifyAdminCredentials('test-admin-user', 'wrong')).toBe(false);
    expect(auth.verifyAdminCredentials('someone', 'test-admin-password')).toBe(false);
    expect(auth.verifyAdminCredentials('', '')).toBe(false);
  });

  it('issues sessions that verify, and rejects tampered ones', async () => {
    configure();
    const auth = await load();
    const token = auth.createAdminSession('test-admin-user');
    expect(auth.verifyAdminSession(token)).toBe(true);

    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    decoded.session.expiresAt += 1000;
    expect(auth.verifyAdminSession(Buffer.from(JSON.stringify(decoded)).toString('base64'))).toBe(false);
    expect(auth.verifyAdminSession('not-a-token')).toBe(false);

    await auth.setAdminSessionCookie(token);
    expect(await auth.isAdmin()).toBe(true);
  });
});

describe.each(VARS)('legacy admin login with %s unset', (missing) => {
  it('refuses every login', async () => {
    configure();
    delete process.env[missing];
    const auth = await load();
    expect(auth.verifyAdminCredentials('test-admin-user', 'test-admin-password')).toBe(false);
    expect(auth.verifyAdminCredentials('', '')).toBe(false);
  });

  it('issues no session', async () => {
    configure();
    delete process.env[missing];
    const auth = await load();
    expect(() => auth.createAdminSession('test-admin-user')).toThrow(/not configured/i);
  });

  it('honours no existing cookie, so isAdmin() is false', async () => {
    // A cookie minted while the login was configured...
    configure();
    const before = await load();
    const token = before.createAdminSession('test-admin-user');
    await before.setAdminSessionCookie(token);

    // ...is worthless once any of the settings is removed.
    delete process.env[missing];
    const after = await load();
    expect(after.verifyAdminSession(token)).toBe(false);
    expect(await after.isAdmin()).toBe(false);
  });
});

describe('legacy admin login with nothing configured', () => {
  it('fails closed', async () => {
    for (const v of VARS) delete process.env[v];
    const auth = await load();
    expect(auth.verifyAdminCredentials('admin', 'admin')).toBe(false);
    expect(() => auth.createAdminSession('admin')).toThrow(/not configured/i);
    expect(await auth.isAdmin()).toBe(false);
  });
});
