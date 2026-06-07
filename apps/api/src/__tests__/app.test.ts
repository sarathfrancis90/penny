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
