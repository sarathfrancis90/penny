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

function buildRequireUser(auth: AuthVerifier): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError(reply, 401, 'Unauthorized', 'Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return jsonError(reply, 401, 'Unauthorized', 'Missing bearer token');
    }

    try {
      request.user = await auth.verifyIdToken(token);
    } catch {
      return jsonError(reply, 401, 'Unauthorized', 'Invalid bearer token');
    }
  };
}

export async function buildApiApp(
  options: ApiAppOptions = {},
): Promise<FastifyInstance> {
  const app = fastify({
    trustProxy: true,
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

  app.decorateRequest('user');
  app.decorate('requireUser', buildRequireUser(auth));

  app.addHook('onRequest', async (request, reply) => {
    const requestId =
      request.headers[REQUEST_ID_HEADER]?.toString() ?? randomUUID();
    reply.header(REQUEST_ID_HEADER, requestId);
  });

  app.setErrorHandler(async (error, _request, reply) => {
    const fastifyError = error as Error & { statusCode?: number };
    const statusCode = fastifyError.statusCode && fastifyError.statusCode >= 400
      ? fastifyError.statusCode
      : 500;
    return jsonError(
      reply,
      statusCode,
      statusCode >= 500 ? 'Internal server error' : fastifyError.name,
      statusCode >= 500 ? undefined : fastifyError.message,
    );
  });

  await app.register(sensible);
  await app.register(helmet);
  await app.register(rateLimit, {
    max: Number(process.env.API_RATE_LIMIT_MAX ?? 600),
    timeWindow: process.env.API_RATE_LIMIT_WINDOW ?? '1 minute',
  });
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
