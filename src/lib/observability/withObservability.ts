import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createLogger, type Logger } from './logger';
import { generateRequestId, extractRequestId, REQUEST_ID_HEADER } from './requestId';
import { reportError } from './errors';
import { isObservabilityEnabled } from './env';
import { shipToAxiom } from './axiomShip';

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { value: String(err) };
}

export interface ObservabilityContext {
  route: string;
  logger: Logger;
  requestId: string;
  userId?: string;
}

// Next.js route handlers receive an optional second argument containing route
// params (e.g. { params: Promise<{ id: string }> }). We pass it through untouched.
type RouteArgs = [req: NextRequest, ctx?: unknown];

type Handler = (...args: RouteArgs) => Promise<Response> | Response;

export function withObservability(
  handler: Handler,
  opts: { route: string },
): (...args: RouteArgs) => Promise<Response> {
  return async (req: NextRequest, routeCtx?: unknown) => {
    const requestId = extractRequestId(req.headers) ?? generateRequestId();
    const logger = createLogger(opts.route).child({ request_id: requestId });
    const obsCtx: ObservabilityContext = { route: opts.route, logger, requestId };
    const start = Date.now();

    const execute = async (): Promise<Response> => {
      try {
        logger.info({ method: req.method, url: req.url }, 'request.start');
        // Pass the route's native context (Next.js params etc.) through.
        // Handlers that don't use it can simply ignore the second argument.
        const res = await handler(req, routeCtx);
        const headers = new Headers(res.headers);
        headers.set(REQUEST_ID_HEADER, requestId);
        const duration_ms = Date.now() - start;
        logger.info({ status: res.status, duration_ms }, 'request.end');
        shipToAxiom({
          _time: new Date().toISOString(),
          level: 'info',
          msg: 'request.end',
          route: opts.route,
          request_id: requestId,
          method: req.method,
          url: req.url,
          status: res.status,
          duration_ms,
          user_id: obsCtx.userId,
        });
        return new Response(res.body, { status: res.status, headers });
      } catch (err) {
        const duration_ms = Date.now() - start;
        logger.error({ err, duration_ms }, 'request.error');
        reportError(err, { route: opts.route, requestId, userId: obsCtx.userId });
        shipToAxiom({
          _time: new Date().toISOString(),
          level: 'error',
          msg: 'request.error',
          route: opts.route,
          request_id: requestId,
          method: req.method,
          url: req.url,
          status: 500,
          duration_ms,
          user_id: obsCtx.userId,
          err: serializeError(err),
        });
        return new Response(
          JSON.stringify({ error: 'Internal server error', requestId }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              [REQUEST_ID_HEADER]: requestId,
            },
          },
        );
      }
    };

    if (!isObservabilityEnabled()) return execute();
    return Sentry.startSpan({ name: opts.route, op: 'http.server' }, () =>
      execute(),
    );
  };
}
