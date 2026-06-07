import { GoogleGenAI } from '@google/genai';

import {
  CANONICAL_OTHER_EXPENSE_CATEGORY,
  expenseCategories,
  normalizeExpenseCategory,
} from '../../../../packages/shared/src/categories';
import type {
  AiService,
  AnalyzeExpenseInput,
  ChatInput,
  GenerateTitleInput,
  ParsedExpense,
} from './ai';

function extractJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI response did not contain JSON');
  return JSON.parse(match[0]);
}

function normalizeExpense(raw: Record<string, unknown>): ParsedExpense {
  const vendor = typeof raw.vendor === 'string' ? raw.vendor : '';
  const amount = typeof raw.amount === 'number'
    ? raw.amount
    : Number.parseFloat(String(raw.amount ?? '0'));
  const date = typeof raw.date === 'string'
    ? raw.date
    : new Date().toISOString().slice(0, 10);
  const category = typeof raw.category === 'string'
    ? normalizeExpenseCategory(raw.category)
    : CANONICAL_OTHER_EXPENSE_CATEGORY;

  return {
    vendor,
    amount,
    date,
    category,
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    groupName:
      typeof raw.groupName === 'string' || raw.groupName === null
        ? raw.groupName
        : undefined,
    confidence:
      typeof raw.confidence === 'number' ? raw.confidence : undefined,
  };
}

export function createGeminiAiService(apiKey: string): AiService {
  const genAI = new GoogleGenAI({ apiKey });

  return {
    async analyzeExpense(input: AnalyzeExpenseInput) {
      const todayDate = new Date().toISOString().slice(0, 10);
      const contents: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [
        {
          text:
            `You are Penny, an AI expense tracking assistant for Canadian self-incorporated software professionals. ` +
            `Extract expenses as minified JSON only. Current date: ${todayDate}. ` +
            `Categories must be one of: ${expenseCategories.join(', ')}.`,
        },
      ];

      if (input.text) contents.push({ text: `User input: ${input.text}` });
      if (input.imageBase64) {
        contents.push({
          inlineData: {
            data: input.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: 'image/jpeg',
          },
        });
      }

      const result = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
      });

      if (!result.text) throw new Error('No response from AI model');
      const parsed = extractJsonObject(result.text) as Record<string, unknown>;

      if (Array.isArray(parsed.expenses)) {
        return parsed.expenses.map((expense) =>
          normalizeExpense(expense as Record<string, unknown>),
        );
      }

      return normalizeExpense(parsed);
    },

    async chat(input: ChatInput) {
      const history = input.conversationHistory
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');
      const result = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            text:
              `You are Penny, a concise Canadian expense tracking assistant.\n` +
              `${history ? `Conversation history:\n${history}\n` : ''}` +
              `User: ${input.message}`,
          },
        ],
      });
      return result.text ?? 'I could not generate a response.';
    },

    async generateConversationTitle(_input: GenerateTitleInput) {
      return 'Expense conversation';
    },
  };
}
