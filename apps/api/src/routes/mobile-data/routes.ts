import type { FastifyInstance, FastifyReply } from 'fastify';

import type { DataScope, MobileDataService } from '../../services/mobile-data';

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

function parseInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseScope(value: unknown): DataScope | 'all' | undefined {
  if (value === 'personal' || value === 'group' || value === 'all') return value;
  return undefined;
}

function bodyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizedData(body: Record<string, unknown>) {
  const { userId: _userId, id: _id, ...data } = body;
  return data;
}

function parseQuery(queryInput: unknown) {
  const query = bodyRecord(queryInput);
  return {
    userId: typeof query.userId === 'string' ? query.userId : undefined,
    groupId: typeof query.groupId === 'string' ? query.groupId : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
    status: typeof query.status === 'string' ? query.status : undefined,
    approvalStatus:
      typeof query.approvalStatus === 'string' ? query.approvalStatus : undefined,
    scope: parseScope(query.scope),
    limit: parseInteger(query.limit),
  };
}

function requireString(
  body: Record<string, unknown>,
  field: string,
  reply: FastifyReply,
) {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    badRequest(reply, `${field} is required`);
    return undefined;
  }
  return value.trim();
}

function requireAmount(body: Record<string, unknown>, reply: FastifyReply) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    badRequest(reply, 'amount must be a positive number');
    return undefined;
  }
  return amount;
}

function registerIncomeRoutes(
  app: FastifyInstance,
  mobileData: MobileDataService,
  scope: DataScope,
  prefix: string,
) {
  app.get(`${prefix}`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (scope === 'group' && !query.groupId) {
        return badRequest(reply, 'groupId is required');
      }

      return mobileData.listIncome({
        userId: request.user.uid,
        scope,
        groupId: query.groupId,
        status: query.status,
        limit: query.limit,
      });
    },
  });

  app.post(`${prefix}`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (scope === 'group' && typeof body.groupId !== 'string') {
        return badRequest(reply, 'groupId is required');
      }

      const result = await mobileData.createIncome({
        userId: request.user.uid,
        scope,
        groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
        data: sanitizedData(body),
      });
      return reply.status(201).send(result);
    },
  });

  app.get(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.getIncome({
        userId: request.user.uid,
        scope,
        id: params.id,
      });
    },
  });

  app.patch(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateIncome({
        userId: request.user.uid,
        scope,
        id: params.id,
        data: sanitizedData(body),
      });
    },
  });

  app.put(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateIncome({
        userId: request.user.uid,
        scope,
        id: params.id,
        data: sanitizedData(body),
      });
    },
  });

  app.delete(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.deleteIncome({
        userId: request.user.uid,
        scope,
        id: params.id,
      });
    },
  });

}

function registerSavingsRoutes(
  app: FastifyInstance,
  mobileData: MobileDataService,
  scope: DataScope,
  prefix: string,
) {
  app.get(`${prefix}`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (scope === 'group' && !query.groupId) {
        return badRequest(reply, 'groupId is required');
      }

      return mobileData.listSavings({
        userId: request.user.uid,
        scope,
        groupId: query.groupId,
        status: query.status,
        limit: query.limit,
      });
    },
  });

  app.post(`${prefix}`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (scope === 'group' && typeof body.groupId !== 'string') {
        return badRequest(reply, 'groupId is required');
      }

      const result = await mobileData.createSavings({
        userId: request.user.uid,
        scope,
        groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
        data: sanitizedData(body),
      });
      return reply.status(201).send(result);
    },
  });

  app.get(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.getSavings({
        userId: request.user.uid,
        scope,
        id: params.id,
      });
    },
  });

  app.patch(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateSavings({
        userId: request.user.uid,
        scope,
        id: params.id,
        data: sanitizedData(body),
      });
    },
  });

  app.put(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateSavings({
        userId: request.user.uid,
        scope,
        id: params.id,
        data: sanitizedData(body),
      });
    },
  });

  app.post(`${prefix}/:id/contributions`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      const amount = requireAmount(body, reply);
      if (amount === undefined) return undefined;
      return mobileData.contributeSavings({
        userId: request.user.uid,
        scope,
        id: params.id,
        amount,
      });
    },
  });

  app.delete(`${prefix}/:id`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.deleteSavings({
        userId: request.user.uid,
        scope,
        id: params.id,
      });
    },
  });
}

function registerMediaRoutes(
  app: FastifyInstance,
  mobileData: MobileDataService,
  kind: 'receipt' | 'avatar',
) {
  app.post(`/api/media/${kind}`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      const fileName = requireString(body, 'fileName', reply);
      const contentType = requireString(body, 'contentType', reply);
      const base64 = requireString(body, 'base64', reply);
      if (!fileName || !contentType || !base64) return undefined;
      return mobileData.uploadMedia({
        userId: request.user.uid,
        kind,
        fileName,
        contentType,
        base64,
      });
    },
  });

  app.delete(`/api/media/${kind}`, {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      const query = parseQuery(request.query);
      if (
        forbiddenUserMismatch(body.userId, request.user.uid) ||
        forbiddenUserMismatch(query.userId, request.user.uid)
      ) {
        return sendUserMismatch(reply);
      }
      const path = typeof body.path === 'string'
        ? body.path
        : typeof (request.query as Record<string, unknown>).path === 'string'
          ? String((request.query as Record<string, unknown>).path)
          : undefined;
      if (!path) return badRequest(reply, 'path is required');
      return mobileData.deleteMedia({ userId: request.user.uid, kind, path });
    },
  });
}

export async function registerMobileDataRoutes(
  app: FastifyInstance,
  mobileData: MobileDataService,
) {
  app.get('/api/expenses', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.listExpenses({
        userId: request.user.uid,
        scope: query.scope,
        groupId: query.groupId,
        category: query.category,
        approvalStatus: query.approvalStatus,
        limit: query.limit,
      });
    },
  });

  app.get('/api/expenses/:id', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.getExpense({ userId: request.user.uid, id: params.id });
    },
  });

  app.post('/api/expenses/duplicate-check', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      const vendor = requireString(body, 'vendor', reply);
      const amount = requireAmount(body, reply);
      const date = requireString(body, 'date', reply);
      if (!vendor || amount === undefined || !date) return undefined;
      return mobileData.duplicateExpense({
        userId: request.user.uid,
        vendor,
        amount,
        date,
        groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
      });
    },
  });

  app.post('/api/expenses/:id/approve', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.approveExpense({ userId: request.user.uid, id: params.id });
    },
  });

  app.post('/api/expenses/:id/reject', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      const body = bodyRecord(request.body);
      return mobileData.rejectExpense({
        userId: request.user.uid,
        id: params.id,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });
    },
  });

  app.get('/api/groups/:groupId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      return mobileData.getGroup({
        userId: request.user.uid,
        groupId: params.groupId,
      });
    },
  });

  app.get('/api/groups/:groupId/activities', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      const query = parseQuery(request.query);
      return mobileData.listGroupActivities({
        userId: request.user.uid,
        groupId: params.groupId,
        limit: query.limit,
      });
    },
  });

  app.get('/api/groups/:groupId/membership/me', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      return mobileData.getMyMembership({
        userId: request.user.uid,
        groupId: params.groupId,
      });
    },
  });

  app.post('/api/groups/invitations/:id/decline', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.declineInvitation({ userId: request.user.uid, id: params.id });
    },
  });

  registerIncomeRoutes(app, mobileData, 'personal', '/api/income/personal');
  registerIncomeRoutes(app, mobileData, 'group', '/api/income/group');
  registerSavingsRoutes(app, mobileData, 'personal', '/api/savings/personal');
  registerSavingsRoutes(app, mobileData, 'group', '/api/savings/group');

  app.get('/api/notifications', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.listNotifications({
        userId: request.user.uid,
        limit: query.limit,
      });
    },
  });

  app.patch('/api/notifications/:id/read', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.markNotificationRead({
        userId: request.user.uid,
        id: params.id,
      });
    },
  });

  app.post('/api/notifications/mark-all-read', {
    preHandler: app.requireUser,
    handler: async (request) =>
      mobileData.markAllNotificationsRead({ userId: request.user.uid }),
  });

  app.delete('/api/notifications/:id', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      return mobileData.deleteNotification({ userId: request.user.uid, id: params.id });
    },
  });

  app.get('/api/notification-settings', {
    preHandler: app.requireUser,
    handler: async (request) =>
      mobileData.getNotificationSettings({ userId: request.user.uid }),
  });

  app.put('/api/notification-settings', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateNotificationSettings({
        userId: request.user.uid,
        data: sanitizedData(body),
      });
    },
  });

  app.get('/api/notification-preferences', {
    preHandler: app.requireUser,
    handler: async (request) =>
      mobileData.getNotificationPreferences({ userId: request.user.uid }),
  });

  app.put('/api/notification-preferences', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateNotificationPreferences({
        userId: request.user.uid,
        data: sanitizedData(body),
      });
    },
  });

  app.put('/api/push-tokens/:deviceId', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { deviceId: string };
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      const token = requireString(body, 'token', reply);
      const platform = requireString(body, 'platform', reply);
      if (!token || !platform) return undefined;
      return mobileData.upsertPushToken({
        userId: request.user.uid,
        deviceId: params.deviceId,
        token,
        platform,
      });
    },
  });

  app.delete('/api/push-tokens/:deviceId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { deviceId: string };
      return mobileData.deletePushToken({
        userId: request.user.uid,
        deviceId: params.deviceId,
      });
    },
  });

  app.get('/api/user/profile', {
    preHandler: app.requireUser,
    handler: async (request) => mobileData.getUserProfile({ userId: request.user.uid }),
  });

  app.patch('/api/user/profile', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateUserProfile({
        userId: request.user.uid,
        data: sanitizedData(body),
      });
    },
  });

  app.get('/api/user/preferences', {
    preHandler: app.requireUser,
    handler: async (request) =>
      mobileData.getUserPreferences({ userId: request.user.uid }),
  });

  app.patch('/api/user/preferences', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = bodyRecord(request.body);
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      return mobileData.updateUserPreferences({
        userId: request.user.uid,
        data: sanitizedData(body),
      });
    },
  });

  registerMediaRoutes(app, mobileData, 'receipt');
  registerMediaRoutes(app, mobileData, 'avatar');
}
