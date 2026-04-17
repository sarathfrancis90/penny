import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createLogger, type Logger } from './logger';
import { generateRequestId, extractRequestId, REQUEST_ID_HEADER } from './requestId';
import { reportError } from './errors';
import { isObservabilityEnabled } from './env';

export interface ObservabilityContext {
  route: string;
  logger: Logger;
  requestId: string;
  userId?: string;
}

type Handler = (
  req: NextRequest,
  ctx: ObservabilityContext,
) => Promise<Response> | Response;
type PlainHandler = (req: NextRequest) => Promise<Response> | Response;

export function withObservability(
  handler: Handler | PlainHandler,
  opts: { route: string },
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = extractRequestId(req.headers) ?? generateRequestId();
    const logger = createLogger(opts.route).child({ request_id: requestId });
    const ctx: ObservabilityContext = { route: opts.route, logger, requestId };
    const start = Date.now();

    const execute = async (): Promise<Response> => {
      try {
        logger.info({ method: req.method, url: req.url }, 'request.start');
        const res = await (handler as Handler)(req, ctx);
        const headers = new Headers(res.headers);
        headers.set(REQUEST_ID_HEADER, requestId);
        const duration_ms = Date.now() - start;
        logger.info({ status: res.status, duration_ms }, 'request.end');
        return new Response(res.body, { status: res.status, headers });
      } catch (err) {
        const duration_ms = Date.now() - start;
        logger.error({ err, duration_ms }, 'request.error');
        reportError(err, { route: opts.route, requestId, userId: ctx.userId });
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
