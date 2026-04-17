import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true }),
      }),
    }),
  },
}));

const { GET } = await import('../route');

describe('/api/healthz', () => {
  it('returns 200 with ok payload', async () => {
    const res = await GET(new NextRequest('http://localhost/api/healthz'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.firestore).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });

  it('includes x-request-id header', async () => {
    const res = await GET(new NextRequest('http://localhost/api/healthz'));
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});
