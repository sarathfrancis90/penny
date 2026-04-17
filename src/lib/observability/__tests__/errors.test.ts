import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { reportError, classifyError } from '../errors';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })
  ),
}));

describe('observability/errors', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('classifyError', () => {
    it('returns "user" for validation code', () => {
      const err = Object.assign(new Error('bad input'), { code: 'VALIDATION' });
      expect(classifyError(err)).toBe('user');
    });

    it('returns "user" for common user error codes', () => {
      for (const code of ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'BAD_REQUEST']) {
        expect(classifyError(Object.assign(new Error('x'), { code }))).toBe('user');
      }
    });

    it('returns "system" by default', () => {
      expect(classifyError(new Error('something broke'))).toBe('system');
    });

    it('returns "system" for unknown code', () => {
      expect(classifyError(Object.assign(new Error('x'), { code: 'WEIRD' }))).toBe('system');
    });
  });

  describe('reportError', () => {
    it('calls Sentry.captureException when enabled', () => {
      process.env.OBSERVABILITY_ENABLED = 'true';
      reportError(new Error('boom'), { userId: 'u1', route: '/api/x' });
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('no-ops when disabled', () => {
      process.env.OBSERVABILITY_ENABLED = 'false';
      vi.mocked(Sentry.captureException).mockClear();
      reportError(new Error('boom'), {});
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});
