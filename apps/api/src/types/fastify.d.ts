import type { preHandlerHookHandler } from 'fastify';

import type { AuthenticatedUser } from '../app';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }

  interface FastifyInstance {
    requireUser: preHandlerHookHandler;
  }
}
