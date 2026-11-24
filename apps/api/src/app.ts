import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type preHandlerHookHandler,
} from 'fastify';
import { randomUUID } from 'node:crypto';

import { registerAiRoutes } from './routes/ai/routes';
import { registerBudgetRoutes } from './routes/budgets/routes';
import { registerCompatibilityRoutes } from './routes/compat/routes';
import { registerConversationRoutes } from './routes/conversations/routes';
import { registerExpenseRoutes } from './routes/expenses/routes';
import { registerGroupRoutes } from './routes/groups/routes';
import { registerMobileDataRoutes } from './routes/mobile-data/routes';
import { registerUserRoutes } from './routes/user/routes';
import { createDefaultServices, type ApiServices } from './services';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  claims?: Record<string, unknown>;
}

export interface AuthVerifier {
  verifyIdToken(token: string): Promise<AuthenticatedUser>;
}

export interface ApiAppOptions {
  readyCheck?: () => Promise<void>;
  auth?: AuthVerifier;
  services?: Partial<ApiServices>;
}

const REQUEST_ID_HEADER = 'x-request-id';

function parseOrigins(value: string | undefined): string[] {
  if (!value) return ['http://localhost:3000'];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function jsonError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  details?: string,
) {
  return reply.status(statusCode).send({
    error,
    ...(details ? { details } : {}),
    requestId: reply.getHeader(REQUEST_ID_HEADER),
  });
}

/** Routes the platform probes; they are never rate-limited. */
const PROBE_PATHS = new Set(['/api/healthz', '/api/readyz']);

/**
 * How many proxies in front of the API to trust when reading the client
 * address from X-Forwarded-For. Cloud Run has exactly one (the Google front
 * end), which appends the real address last; trusting every hop would let a
 * client pick its own address by sending a forged header.
 */
export function parseTrustProxyHops(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 1;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
}

/**
 * proxy-addr's hop-count trust, as a function (Fastify's types do not take
 * a number): the socket peer and the next `hops - 1` X-Forwarded-For
 * entries, counted from the right, are trusted proxies.
 */
function trustNearestHops(hops: number) {
  return (_address: string, hop: number) => hop < hops;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || undefined;
}

/**
 * Verifies the request's bearer token at most once. The rate limiter needs
 * the verified uid before the route runs, and `requireUser` needs it again.
 */
function createIdentityResolver(auth: AuthVerifier) {
  const results = new WeakMap<FastifyRequest, Promise<AuthenticatedUser | null>>();
  return (request: FastifyRequest): Promise<AuthenticatedUser | null> => {
    let result = results.get(request);
    if (!result) {
      const token = bearerToken(request);
      result = token
        ? auth.verifyIdToken(token).catch(() => null)
        : Promise.resolve(null);
      results.set(request, result);
    }
    return result;
  };
}

function buildRequireUser(
  resolveIdentity: (request: FastifyRequest) => Promise<AuthenticatedUser | null>,
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!bearerToken(request)) {
      return jsonError(reply, 401, 'Unauthorized', 'Missing bearer token');
    }

    const user = await resolveIdentity(request);
    if (!user) {
      return jsonError(reply, 401, 'Unauthorized', 'Invalid bearer token');
    }
    request.user = user;
  };
}

export async function buildApiApp(
  options: ApiAppOptions = {},
): Promise<FastifyInstance> {
  const app = fastify({
    trustProxy: trustNearestHops(parseTrustProxyHops(process.env.API_TRUST_PROXY_HOPS)),
    logger:
      process.env.NODE_ENV === 'test'
        ? false
        : {
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              '*.token',
              '*.secret',
              '*.password',
              '*.receiptData',
              '*.imageBase64',
              '*.vendor',
              '*.amount',
            ],
          },
  });

  // The mobile app's HTTP client sends `Content-Type: application/json` on
  // every request, including body-less ones such as "mark notification read"
  // and "decline invitation". Fastify rejects an empty JSON body with 400, so
  // treat an empty body as `{}` and parse everything else with Fastify's own
  // (prototype-poisoning-safe) JSON parser.
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      if (typeof body === 'string' && body.trim() === '') {
        done(null, {});
        return;
      }
      defaultJsonParser(request, body.toString(), done);
    },
  );

  const auth =
    options.auth ??
    ({
      async verifyIdToken() {
        throw new Error('Firebase auth verifier has not been configured');
      },
    } satisfies AuthVerifier);
  const services: ApiServices = {
    ...createDefaultServices(),
    ...options.services,
  };

  const resolveIdentity = createIdentityResolver(auth);
  app.decorateRequest('user');
  app.decorate('requireUser', buildRequireUser(resolveIdentity));

  app.addHook('onRequest', async (request, reply) => {
    const requestId =
      request.headers[REQUEST_ID_HEADER]?.toString() ?? randomUUID();
    reply.header(REQUEST_ID_HEADER, requestId);
  });

  app.setErrorHandler(async (error, request, reply) => {
    const fastifyError = error as Error & {
      statusCode?: number;
      code?: string;
      upstreamStatus?: number;
    };
    const statusCode = fastifyError.statusCode && fastifyError.statusCode >= 400
      ? fastifyError.statusCode
      : 500;

    if (statusCode >= 500) {
      request.log.error(
        { err: error, upstreamStatus: fastifyError.upstreamStatus },
        'request failed',
      );
    }

    if (statusCode === 503) {
      return reply.status(503).send({
        error: 'Service unavailable',
        ...(fastifyError.code ? { code: fastifyError.code } : {}),
        details: fastifyError.message,
        requestId: reply.getHeader(REQUEST_ID_HEADER),
      });
    }

    if (statusCode >= 500) {
      return jsonError(reply, statusCode, 'Internal server error');
    }

    // Our own machine-readable codes (e.g. AI_UNREADABLE) go to the client;
    // Fastify's internal FST_* codes stay out of the response as before.
    const code =
      typeof fastifyError.code === 'string' && !fastifyError.code.startsWith('FST_')
        ? fastifyError.code
        : undefined;
    return reply.status(statusCode).send({
      error: fastifyError.name,
      ...(code ? { code } : {}),
      ...(fastifyError.message ? { details: fastifyError.message } : {}),
      requestId: reply.getHeader(REQUEST_ID_HEADER),
    });
  });

  await app.register(sensible);
  await app.register(helmet);
  // Not attached per route (`global: false`): the limiter runs as an
  // instance-wide onRequest hook so it always runs before any route's own
  // auth hook, rejected requests included, and before the body is read.
  await app.register(rateLimit, {
    global: false,
    max: Number(process.env.API_RATE_LIMIT_MAX ?? 600),
    timeWindow: process.env.API_RATE_LIMIT_WINDOW ?? '1 minute',
    // A signed-in caller is limited by their verified uid wherever they
    // connect from; everyone else by the address the front end saw.
    keyGenerator: async (request) => {
      const user = await resolveIdentity(request);
      return user ? `uid:${user.uid}` : `ip:${request.ip}`;
    },
    allowList: (request) => PROBE_PATHS.has(request.url.split('?')[0]),
  });
  app.addHook('onRequest', app.rateLimit());
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = parseOrigins(process.env.API_CORS_ORIGINS);
      callback(null, allowedOrigins.includes(origin));
    },
  });

  app.get('/api/healthz', async () => ({
    status: 'ok',
    service: 'penny-api',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/readyz', async (_request, reply) => {
    try {
      await options.readyCheck?.();
      return {
        status: 'ready',
        service: 'penny-api',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return jsonError(
        reply,
        503,
        'Service unavailable',
        error instanceof Error ? error.message : 'readiness check failed',
      );
    }
  });

  await registerAiRoutes(app, services.ai);
  await registerBudgetRoutes(app, services.budgets);
  await registerConversationRoutes(app, services.conversations);
  await registerExpenseRoutes(app, services.expenses);
  await registerGroupRoutes(app, services.groups);
  await registerMobileDataRoutes(app, services.mobileData);
  await registerUserRoutes(app, services.userPreferences, services.accounts);
  await registerCompatibilityRoutes(app);

  return app;
}
