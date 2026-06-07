import type { FastifyInstance, FastifyReply } from 'fastify';

import { isExpenseCategory } from '../../../../../packages/shared/src/categories';
import type { BudgetPeriod, BudgetService } from '../../services/budgets';

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
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parsePeriod(value: unknown): BudgetPeriod | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const month = parseInteger(record.month);
  const year = parseInteger(record.year);
  if (!month || !year || month < 1 || month > 12 || year < 2020) {
    return undefined;
  }
  return { month, year };
}

function parseQuery(requestQuery: unknown) {
  const query = requestQuery as Record<string, unknown>;
  return {
    userId: typeof query.userId === 'string' ? query.userId : undefined,
    groupId: typeof query.groupId === 'string' ? query.groupId : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
    month: parseInteger(query.month),
    year: parseInteger(query.year),
    limit: parseInteger(query.limit),
  };
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function objectSettings(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validateBudgetCreateBody(
  body: Record<string, unknown>,
  reply: FastifyReply,
): { category: string; monthlyLimit: number; period: BudgetPeriod } | undefined {
  if (typeof body.category !== 'string' || !isExpenseCategory(body.category)) {
    badRequest(reply, 'category must be a canonical CRA category');
    return undefined;
  }

  if (!isPositiveAmount(body.monthlyLimit)) {
    badRequest(reply, 'monthlyLimit must be greater than 0');
    return undefined;
  }

  const period = parsePeriod(body.period);
  if (!period) {
    badRequest(reply, 'period must include a valid month and year');
    return undefined;
  }

  return {
    category: body.category,
    monthlyLimit: body.monthlyLimit,
    period,
  };
}

export async function registerBudgetRoutes(
  app: FastifyInstance,
  budgets: BudgetService,
) {
  app.get('/api/budgets/personal', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      const budgetList = await budgets.listPersonalBudgets({
        userId: request.user.uid,
        category: query.category,
        month: query.month,
        year: query.year,
      });
      return { budgets: budgetList };
    },
  });

  app.post('/api/budgets/personal', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      const parsed = validateBudgetCreateBody(body, reply);
      if (!parsed) return undefined;

      const budget = await budgets.createPersonalBudget({
        userId: request.user.uid,
        ...parsed,
        settings: objectSettings(body.settings),
      });

      return reply.status(201).send(budget);
    },
  });

  app.get('/api/budgets/personal/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return budgets.getPersonalBudget({
        id: params.id,
        userId: request.user.uid,
      });
    },
  });

  app.put('/api/budgets/personal/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (body.monthlyLimit !== undefined && !isPositiveAmount(body.monthlyLimit)) {
        return badRequest(reply, 'monthlyLimit must be greater than 0');
      }

      return budgets.updatePersonalBudget({
        id: params.id,
        userId: request.user.uid,
        monthlyLimit: body.monthlyLimit,
        settings: objectSettings(body.settings),
      });
    },
  });

  app.delete('/api/budgets/personal/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      await budgets.deletePersonalBudget({
        id: params.id,
        userId: request.user.uid,
      });
      return { message: 'Budget deleted successfully' };
    },
  });

  app.get('/api/budgets/group', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (!query.groupId) {
        return badRequest(reply, 'Group ID is required');
      }

      const budgetList = await budgets.listGroupBudgets({
        userId: request.user.uid,
        groupId: query.groupId,
        category: query.category,
        month: query.month,
        year: query.year,
      });
      return { budgets: budgetList };
    },
  });

  app.post('/api/budgets/group', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (typeof body.groupId !== 'string' || body.groupId.length === 0) {
        return badRequest(reply, 'Group ID is required');
      }

      const parsed = validateBudgetCreateBody(body, reply);
      if (!parsed) return undefined;

      const budget = await budgets.createGroupBudget({
        userId: request.user.uid,
        groupId: body.groupId,
        ...parsed,
        settings: objectSettings(body.settings),
      });

      return reply.status(201).send(budget);
    },
  });

  app.get('/api/budgets/group/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      return budgets.getGroupBudget({
        id: params.id,
        userId: request.user.uid,
      });
    },
  });

  app.put('/api/budgets/group/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      if (forbiddenUserMismatch(body.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }
      if (body.monthlyLimit !== undefined && !isPositiveAmount(body.monthlyLimit)) {
        return badRequest(reply, 'monthlyLimit must be greater than 0');
      }

      return budgets.updateGroupBudget({
        id: params.id,
        userId: request.user.uid,
        monthlyLimit: body.monthlyLimit,
        settings: objectSettings(body.settings),
      });
    },
  });

  app.delete('/api/budgets/group/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      await budgets.deleteGroupBudget({
        id: params.id,
        userId: request.user.uid,
      });
      return { message: 'Budget deleted successfully' };
    },
  });

  app.get('/api/budgets/usage/personal', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      const usage = await budgets.getPersonalBudgetUsage({
        userId: request.user.uid,
        month: query.month,
        year: query.year,
      });
      return { usage };
    },
  });

  app.get('/api/budgets/usage/group/:groupId', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { groupId: string };
      const query = parseQuery(request.query);
      if (forbiddenUserMismatch(query.userId, request.user.uid)) {
        return sendUserMismatch(reply);
      }

      const usage = await budgets.getGroupBudgetUsage({
        userId: request.user.uid,
        groupId: params.groupId,
        month: query.month,
        year: query.year,
      });
      return { usage };
    },
  });
}
