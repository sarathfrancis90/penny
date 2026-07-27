import { GoogleGenAI, Type } from '@google/genai';

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

const expenseSchema = {
  type: Type.OBJECT,
  properties: {
    expenses: {
      type: Type.ARRAY,
      minItems: '1',
      maxItems: '20',
      items: {
        type: Type.OBJECT,
        properties: {
          vendor: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          date: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: [...expenseCategories],
          },
          description: { type: Type.STRING, nullable: true },
          groupName: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER, nullable: true },
        },
        required: ['vendor', 'amount', 'date', 'category'],
      },
    },
  },
  required: ['expenses'],
};

function tryParseJson(candidate: string): unknown | undefined {
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function stripJsonFence(text: string): string | undefined {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim();
}

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fenced = stripJsonFence(trimmed);
  const candidates = [
    trimmed,
    fenced,
    sliceBetween(trimmed, '[', ']'),
    sliceBetween(trimmed, '{', '}'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed !== undefined) return parsed;
  }

  throw new Error('AI response did not contain valid JSON');
}

function sliceBetween(text: string, startChar: string, endChar: string) {
  const start = text.indexOf(startChar);
  const end = text.lastIndexOf(endChar);
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeExpenseList(parsed: unknown): ParsedExpense[] {
  if (Array.isArray(parsed)) {
    return parsed
      .filter(isRecord)
      .map((expense) => normalizeExpense(expense));
  }

  if (isRecord(parsed) && Array.isArray(parsed.expenses)) {
    return parsed.expenses
      .filter(isRecord)
      .map((expense) => normalizeExpense(expense));
  }

  if (isRecord(parsed)) return [normalizeExpense(parsed)];

  throw new Error('AI response JSON was not an expense object');
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
            `Return {"expenses":[...]} and use the receipt total as one transaction unless the input contains multiple separate receipts or transactions. ` +
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
        config: {
          responseMimeType: 'application/json',
          responseSchema: expenseSchema,
        },
      });

      if (!result.text) throw new Error('No response from AI model');
      const expenses = normalizeExpenseList(extractJsonValue(result.text));

      return expenses.length === 1 ? expenses[0] : expenses;
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
