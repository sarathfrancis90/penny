import type { FastifyInstance } from 'fastify';

import {
  CANONICAL_OTHER_EXPENSE_CATEGORY,
  isExpenseCategory,
} from '../../../../../packages/shared/src/categories';
import type { AiService, ParsedExpense } from '../../services/ai';

function normalizeParsedExpense(expense: ParsedExpense): ParsedExpense {
  return {
    ...expense,
    category: isExpenseCategory(expense.category)
      ? expense.category
      : CANONICAL_OTHER_EXPENSE_CATEGORY,
  };
}

export async function registerAiRoutes(app: FastifyInstance, ai: AiService) {
  app.post('/api/analyze-expense', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as {
        text?: string;
        imageBase64?: string;
      };

      if (!body?.text && !body?.imageBase64) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'Either text or imageBase64 must be provided',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      const result = await ai.analyzeExpense({
        userId: request.user.uid,
        text: body.text,
        imageBase64: body.imageBase64,
      });

      if (Array.isArray(result)) {
        return {
          success: true,
          multiExpense: true,
          data: result.map(normalizeParsedExpense),
        };
      }

      return {
        success: true,
        data: normalizeParsedExpense(result),
      };
    },
  });

  app.get('/api/analyze-expense', async (_request, reply) =>
    reply.status(405).send({
      error: 'Method not allowed',
      details: 'Use POST to analyze an expense',
      requestId: reply.getHeader('x-request-id'),
    }),
  );

  app.post('/api/ai-chat', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const body = request.body as {
        message?: string;
        conversationHistory?: Array<{ role: string; content: string }>;
      };

      const message = body?.message?.trim();
      if (!message) {
        return {
          success: false,
          error: 'Message is required',
        };
      }

      const response = await ai.chat({
        userId: request.user.uid,
        message,
        conversationHistory: body.conversationHistory ?? [],
      });

      return {
        success: true,
        message: response,
      };
    },
  });

  app.post('/api/conversations/:conversationId/generate-title', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { conversationId: string };
      const title = await ai.generateConversationTitle({
        userId: request.user.uid,
        conversationId: params.conversationId,
      });

      return {
        success: true,
        title,
        regenerated: true,
      };
    },
  });
}
