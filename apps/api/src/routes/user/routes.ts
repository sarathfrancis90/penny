import type { FastifyInstance, FastifyReply } from 'fastify';

import type { AccountService } from '../../services/accounts';
import type { UserPreferenceService } from '../../services/user-preferences';

function forbiddenUserMismatch(value: unknown, authUserId: string) {
  return typeof value === 'string' && value.length > 0 && value !== authUserId;
}

function sendUserMismatch(reply: FastifyReply) {
  return reply.status(403).send({
    error: 'Forbidden',
    details: 'Request userId does not match authenticated user',
    requestId: reply.getHeader('x-request-id'),
  });
}

function parseQuery(queryInput: unknown) {
  const query = queryInput as Record<string, unknown>;
  return {
    userId: typeof query.userId === 'string' ? query.userId : undefined,
  };
}

export async function registerUserRoutes(
  app: FastifyInstance,
  userPreferences: UserPreferenceService,
  accounts: AccountService,
) {
  app.get('/api/user/default-group', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return userPreferences.getDefaultGroup({ userId: request.user.uid });
    },
  });

  app.post('/api/user/default-group', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return userPreferences.setDefaultGroup({
        userId: request.user.uid,
        groupId: typeof body.groupId === 'string' ? body.groupId : null,
      });
    },
  });

  app.delete('/api/user/default-group', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return userPreferences.clearDefaultGroup({ userId: request.user.uid });
    },
  });

  app.delete('/api/account/delete', {
    preHandler: app.requireUser,
    handler: async (request) =>
      accounts.deleteAccount({ userId: request.user.uid }),
  });
}
