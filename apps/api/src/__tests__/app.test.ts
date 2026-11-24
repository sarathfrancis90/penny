import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app';

describe('container API foundation', () => {
  beforeAll(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_CORS_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'penny-test');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('responds to /api/healthz without touching dependencies', async () => {
    const app = await buildApiApp({ readyCheck: async () => undefined });

    const response = await app.inject({
      method: 'GET',
      url: '/api/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'penny-api',
    });

    await app.close();
  });

  it('returns 503 from /api/readyz when dependency readiness fails', async () => {
    const app = await buildApiApp({
      readyCheck: async () => {
        throw new Error('firestore unavailable');
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/readyz',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: 'Service unavailable',
      details: 'firestore unavailable',
    });

    await app.close();
  });

  it('protects authenticated routes with Firebase bearer auth', async () => {
    const verifyIdToken = vi.fn();
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken },
    });

    app.get('/api/protected-test', {
      preHandler: app.requireUser,
      handler: async (request) => ({ uid: request.user.uid }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/protected-test',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: 'Unauthorized',
      details: 'Missing bearer token',
    });
    expect(verifyIdToken).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('JSON bodies', () => {
  async function appWithEcho() {
    const app = await buildApiApp({ readyCheck: async () => undefined });
    app.patch('/api/echo-test', { handler: async (request) => ({ body: request.body ?? null }) });
    return app;
  }

  it('treats an empty body sent as application/json as {}', async () => {
    const app = await appWithEcho();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/echo-test',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: {} });
    await app.close();
  });

  it('still parses JSON and still rejects malformed or poisoned JSON', async () => {
    const app = await appWithEcho();
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/echo-test',
      headers: { 'content-type': 'application/json' },
      payload: '{"a":1}',
    });
    expect(ok.json()).toEqual({ body: { a: 1 } });

    const malformed = await app.inject({
      method: 'PATCH',
      url: '/api/echo-test',
      headers: { 'content-type': 'application/json' },
      payload: '{"a":',
    });
    expect(malformed.statusCode).toBe(400);

    const poisoned = await app.inject({
      method: 'PATCH',
      url: '/api/echo-test',
      headers: { 'content-type': 'application/json' },
      payload: '{"__proto__":{"admin":true}}',
    });
    expect(poisoned.statusCode).toBe(400);
    await app.close();
  });
});

describe('rate limiting', () => {
  beforeAll(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_RATE_LIMIT_MAX', '2');
    vi.stubEnv('API_RATE_LIMIT_WINDOW', '1 minute');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  async function buildLimitedApp() {
    const verifyIdToken = vi.fn(async (token: string) => {
      if (token.startsWith('valid-')) return { uid: token.slice('valid-'.length) };
      throw new Error('invalid token');
    });
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken },
    });
    app.get('/api/limited-test', {
      preHandler: app.requireUser,
      handler: async (request) => ({ uid: request.user.uid }),
    });
    app.get('/api/public-test', async () => ({ ok: true }));
    return { app, verifyIdToken };
  }

  it('cannot be dodged by forging X-Forwarded-For on unauthenticated requests', async () => {
    const { app } = await buildLimitedApp();
    const statuses: number[] = [];
    for (const forged of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/public-test',
        // The Google front end appends the real client address last.
        headers: { 'x-forwarded-for': `${forged}, 203.0.113.7` },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([200, 200, 429]);
    await app.close();
  });

  it('keys authenticated requests by the verified uid, not the address', async () => {
    const { app, verifyIdToken } = await buildLimitedApp();
    const call = (token: string, ip: string) =>
      app.inject({
        method: 'GET',
        url: '/api/limited-test',
        headers: {
          authorization: `Bearer ${token}`,
          'x-forwarded-for': ip,
        },
      });

    expect((await call('valid-alice', '198.51.100.1')).statusCode).toBe(200);
    expect((await call('valid-alice', '198.51.100.2')).statusCode).toBe(200);
    // A third address does not give alice a fresh bucket.
    expect((await call('valid-alice', '198.51.100.3')).statusCode).toBe(429);
    // Another user behind the same address has their own bucket.
    expect((await call('valid-bob', '198.51.100.3')).statusCode).toBe(200);
    // The token is verified once per request, even though both the limiter
    // and the route need the identity.
    expect(verifyIdToken).toHaveBeenCalledTimes(4);
    await app.close();
  });

  it('falls back to the address for an invalid token, and still answers 401', async () => {
    const { app } = await buildLimitedApp();
    const call = () =>
      app.inject({
        method: 'GET',
        url: '/api/limited-test',
        headers: { authorization: 'Bearer forged', 'x-forwarded-for': '203.0.113.9' },
      });
    expect((await call()).statusCode).toBe(401);
    expect((await call()).statusCode).toBe(401);
    expect((await call()).statusCode).toBe(429);
    await app.close();
  });

  it('never rate-limits the health and readiness probes', async () => {
    const { app } = await buildLimitedApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await app.inject({ method: 'GET', url: '/api/healthz' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/readyz' })).statusCode).toBe(200);
    }
    await app.close();
  });
});
