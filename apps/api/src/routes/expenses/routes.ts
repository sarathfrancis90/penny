import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { isExpenseCategory } from '../../../../../packages/shared/src/categories';
import { isExpenseDateString, parseCalendarDate } from '../../services/dates';
import type { ExpenseService } from '../../services/expenses';

function forbiddenUserMismatch(bodyUserId: unknown, authUserId: string) {
  return typeof bodyUserId === 'string' && bodyUserId && bodyUserId !== authUserId;
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isProvided(value: unknown) {
  return value !== undefined && value !== null;
}

function isClientRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function badRequest(reply: FastifyReply, details: string) {
  return reply.status(400).send({
    error: 'Bad Request',
    details,
    requestId: reply.getHeader('x-request-id'),
  });
}

export async function registerExpenseRoutes(
  app: FastifyInstance,
  expenses: ExpenseService,
) {
  app.post('/api/expenses', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const userId = request.user.uid;

      if (forbiddenUserMismatch(body.userId, userId)) {
        return reply.status(403).send({
          error: 'Forbidden',
          details: 'Request userId does not match authenticated user',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      if (typeof body.vendor !== 'string' || body.vendor.trim().length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'vendor is required',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      if (!isPositiveAmount(body.amount)) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'amount must be a positive number',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      if (!isExpenseDateString(body.date)) {
        return badRequest(reply, 'date must be a valid YYYY-MM-DD date');
      }

      if (isProvided(body.clientRequestId) && !isClientRequestId(body.clientRequestId)) {
        return badRequest(
          reply,
          'clientRequestId must be 8-64 characters of letters, digits, "_" or "-"',
        );
      }

      if (typeof body.category !== 'string' || !isExpenseCategory(body.category)) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'category must be a canonical CRA category',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      const result = await expenses.createExpense({
        userId,
        vendor: body.vendor.trim(),
        amount: body.amount,
        date: body.date,
        category: body.category,
        description:
          typeof body.description === 'string' ? body.description : undefined,
        receiptUrl:
          typeof body.receiptUrl === 'string' ? body.receiptUrl : undefined,
        receiptPath:
          typeof body.receiptPath === 'string' ? body.receiptPath : undefined,
        groupId:
          typeof body.groupId === 'string' || body.groupId === null
            ? body.groupId
            : undefined,
        clientRequestId: isClientRequestId(body.clientRequestId)
          ? body.clientRequestId
          : undefined,
      });

      return {
        success: true,
        id: result.id,
        message: 'Expense created successfully',
      };
    },
  });

  // PATCH and PUT are the same operation; older clients use either.
  const updateExpense = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (isProvided(body.amount) && !isPositiveAmount(body.amount)) {
      return badRequest(reply, 'amount must be a positive number');
    }
    // Whether the year is plausible is checked against the stored expense,
    // so an unchanged legacy date does not block editing other fields.
    if (isProvided(body.date) && !parseCalendarDate(body.date)) {
      return badRequest(reply, 'date must be a valid YYYY-MM-DD date');
    }

    const result = await expenses.updateExpense({
      id: params.id,
      userId: request.user.uid,
      vendor: typeof body.vendor === 'string' ? body.vendor : undefined,
      amount: isPositiveAmount(body.amount) ? body.amount : undefined,
      date: typeof body.date === 'string' ? body.date : undefined,
      // Not rejected: the released app resends an expense's stored category
      // on every edit, and older expenses can hold a non-canonical one.
      category:
        typeof body.category === 'string' && isExpenseCategory(body.category)
          ? body.category
          : undefined,
      description:
        typeof body.description === 'string' ? body.description : undefined,
    });

    return { success: true, id: result.id, message: 'Expense updated' };
  };

  app.patch('/api/expenses/:id', {
    preHandler: app.requireUser,
    handler: updateExpense,
  });

  app.put('/api/expenses/:id', {
    preHandler: app.requireUser,
    handler: updateExpense,
  });

  app.delete('/api/expenses/:id', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      await expenses.deleteExpense({ id: params.id, userId: request.user.uid });
      return { success: true, message: 'Expense deleted' };
    },
  });
}
