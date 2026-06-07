import type { FastifyInstance, FastifyReply } from 'fastify';

import type { ConversationService } from '../../services/conversations';

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

function badRequest(reply: FastifyReply, details: string) {
  return reply.status(400).send({
    error: 'Bad Request',
    details,
    requestId: reply.getHeader('x-request-id'),
  });
}

function parseQuery(queryInput: unknown) {
  const query = queryInput as Record<string, unknown>;
  const limit = Number(query.limit);
  const before = Number(query.before);
  return {
    userId: typeof query.userId === 'string' ? query.userId : undefined,
    includeArchived: query.includeArchived === 'true',
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : undefined,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
  };
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function registerConversationRoutes(
  app: FastifyInstance,
  conversations: ConversationService,
) {
  app.get('/api/conversations', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return conversations.listConversations({
        userId: request.user.uid,
        limit: query.limit,
        includeArchived: query.includeArchived,
      });
    },
  });

  app.post('/api/conversations', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        return badRequest(reply, 'Title is required');
      }
      if (
        typeof body.firstMessage !== 'string' ||
        body.firstMessage.trim().length === 0
      ) {
        return badRequest(reply, 'First message is required');
      }

      return conversations.createConversation({
        userId: request.user.uid,
        title: body.title,
        firstMessage: body.firstMessage,
        firstMessageRole:
          typeof body.firstMessageRole === 'string'
            ? body.firstMessageRole
            : undefined,
      });
    },
  });

  app.get('/api/conversations/:conversationId', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { conversationId: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return conversations.getConversation({
        userId: request.user.uid,
        conversationId: params.conversationId,
      });
    },
  });

  app.patch('/api/conversations/:conversationId', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { conversationId: string };
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return conversations.updateConversation({
        userId: request.user.uid,
        conversationId: params.conversationId,
        title: typeof body.title === 'string' ? body.title : undefined,
        summary: typeof body.summary === 'string' ? body.summary : undefined,
        isPinned: typeof body.isPinned === 'boolean' ? body.isPinned : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
      });
    },
  });

  app.delete('/api/conversations/:conversationId', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { conversationId: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return conversations.deleteConversation({
        userId: request.user.uid,
        conversationId: params.conversationId,
      });
    },
  });

  app.get('/api/conversations/:conversationId/messages', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { conversationId: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return conversations.listMessages({
        userId: request.user.uid,
        conversationId: params.conversationId,
        limit: query.limit,
        before: query.before,
      });
    },
  });

  app.post('/api/conversations/:conversationId/messages', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { conversationId: string };
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (typeof body.role !== 'string' || body.role.length === 0) {
        return badRequest(reply, 'Role is required');
      }
      if (typeof body.content !== 'string' || body.content.length === 0) {
        return badRequest(reply, 'Content is required');
      }

      return conversations.addMessage({
        userId: request.user.uid,
        conversationId: params.conversationId,
        role: body.role,
        content: body.content,
        attachments: body.attachments,
        expenseData: optionalRecord(body.expenseData),
        metadata: optionalRecord(body.metadata),
      });
    },
  });
}
