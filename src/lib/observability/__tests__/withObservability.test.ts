import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withObservability } from '../withObservability';

vi.mock('@sentry/nextjs', () => ({
  startSpan: vi.fn((_opts: unknown, cb: (span: unknown) => unknown) =>
    cb({ setAttribute: vi.fn() })
  ),
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })
  ),
}));

const mkReq = () => new NextRequest('http://localhost/api/x');

describe('withObservability', () => {
  beforeEach(() => {
    process.env.OBSERVABILITY_ENABLED = 'false';
    vi.clearAllMocks();
  });

  it('returns handler result unchanged on success', async () => {
    const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    const wrapped = withObservability(handler, { route: '/api/x' });
    const res = await wrapped(mkReq());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('adds x-request-id response header', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withObservability(handler, { route: '/api/x' });
    const res = await wrapped(mkReq());
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('preserves x-request-id from incoming request', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withObservability(handler, { route: '/api/x' });
    const req = new NextRequest('http://localhost/api/x', {
      headers: { 'x-request-id': 'abc-123' },
    });
    const res = await wrapped(req);
    expect(res.headers.get('x-request-id')).toBe('abc-123');
  });

  it('captures thrown errors and returns 500 JSON', async () => {
    const handler = vi.fn(async () => { throw new Error('boom'); });
    const wrapped = withObservability(handler, { route: '/api/x' });
    const res = await wrapped(mkReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(body.requestId).toBeTruthy();
  });

  it('wraps in Sentry span when enabled', async () => {
    process.env.OBSERVABILITY_ENABLED = 'true';
    const Sentry = await import('@sentry/nextjs');
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withObservability(handler, { route: '/api/x' });
    await wrapped(mkReq());
    expect(Sentry.startSpan).toHaveBeenCalled();
  });
});
