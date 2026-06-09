import type { FastifyInstance } from 'fastify';

import { isExpenseCategory } from '../../../../../packages/shared/src/categories';
import type { ExpenseService } from '../../services/expenses';

function forbiddenUserMismatch(bodyUserId: unknown, authUserId: string) {
  return typeof bodyUserId === 'string' && bodyUserId && bodyUserId !== authUserId;
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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

      if (!isValidDate(body.date)) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'date must use YYYY-MM-DD format',
          requestId: reply.getHeader('x-request-id'),
        });
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
      });

      return {
        success: true,
        id: result.id,
        message: 'Expense created successfully',
      };
    },
  });

  app.patch('/api/expenses/:id', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const result = await expenses.updateExpense({
        id: params.id,
        userId: request.user.uid,
        vendor: typeof body.vendor === 'string' ? body.vendor : undefined,
        amount: isPositiveAmount(body.amount) ? body.amount : undefined,
        date: isValidDate(body.date) ? body.date : undefined,
        category:
          typeof body.category === 'string' && isExpenseCategory(body.category)
            ? body.category
            : undefined,
        description:
          typeof body.description === 'string' ? body.description : undefined,
      });

      return { success: true, id: result.id, message: 'Expense updated' };
    },
  });

  app.put('/api/expenses/:id', {
    preHandler: app.requireUser,
    handler: async (request, reply) =>
      app.inject({
        method: 'PATCH',
        url: request.url,
        headers: request.headers as Record<string, string>,
        payload: request.body as object,
      }).then((response) =>
        reply.status(response.statusCode).headers(response.headers).send(response.body),
      ),
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
