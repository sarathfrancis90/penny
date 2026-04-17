import * as Sentry from '@sentry/nextjs';
import { isObservabilityEnabled } from './env';

export type ErrorClass = 'user' | 'system';

export interface ErrorContext {
  userId?: string;
  route?: string;
  requestId?: string;
  extra?: Record<string, unknown>;
}

const USER_ERROR_CODES = new Set([
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'BAD_REQUEST',
]);

export function classifyError(err: unknown): ErrorClass {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    if (USER_ERROR_CODES.has(code)) return 'user';
  }
  return 'system';
}

export function reportError(err: unknown, ctx: ErrorContext): void {
  if (!isObservabilityEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTag('error.class', classifyError(err));
    if (ctx.route) scope.setTag('route', ctx.route);
    if (ctx.requestId) scope.setTag('request_id', ctx.requestId);
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.extra) scope.setContext('extra', ctx.extra);
    Sentry.captureException(err);
  });
}
