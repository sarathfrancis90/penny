import { ApiError, GoogleGenAI, Type } from '@google/genai';

import {
  CANONICAL_OTHER_EXPENSE_CATEGORY,
  expenseCategories,
  normalizeExpenseCategory,
} from '../../../../packages/shared/src/categories';
import { addDays, isExpenseDateString, resolveLocalDate } from './dates';
import type {
  AiService,
  AnalyzeExpenseInput,
  ChatInput,
  GenerateTitleInput,
  ParsedExpense,
} from './ai';
import type { SpendingSummaryProvider } from './spending-summary';

const expenseSchema = {
  type: Type.OBJECT,
  properties: {
    expenses: {
      type: Type.ARRAY,
      minItems: 1,
      maxItems: 20,
      items: {
        type: Type.OBJECT,
        properties: {
          vendor: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          date: { type: Type.STRING },
          category: { type: Type.STRING },
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

/** Long enough for a large receipt photo, short enough not to hang a request. */
export const GEMINI_TIMEOUT_MS = 45_000;

const UNREADABLE_RECEIPT_MESSAGE = 'Could not read this receipt';

/**
 * The model answered, but not with something usable (or refused the input).
 * Retrying the same request will not help, so this is a 422, not a 5xx.
 */
function aiUnreadableError(message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), {
    statusCode: 422,
    code: 'AI_UNREADABLE',
    ...extra,
  });
}

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

  throw aiUnreadableError(UNREADABLE_RECEIPT_MESSAGE);
}

function sliceBetween(text: string, startChar: string, endChar: string) {
  const start = text.indexOf(startChar);
  const end = text.lastIndexOf(endChar);
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}

/**
 * Reads an amount the model returned as text, e.g. "$1,234.56", "1 234,56"
 * or "12,50". When both separators appear the last one is the decimal point;
 * a lone comma is a decimal point only when one or two digits follow it.
 */
export function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return Number.NaN;

  let text = raw.replace(/[^\d.,-]/g, '');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    text = /^-?\d+,\d{1,2}$/.test(text)
      ? text.replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.indexOf('.') !== lastDot) {
    text = text.replace(/\./g, '');
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * `undefined` when the entry has no usable (positive) amount, unless
 * `allowMissingAmount` is set: then the amount is 0 for the user to fill in.
 */
function normalizeExpense(
  raw: Record<string, unknown>,
  today: string,
  allowMissingAmount = false,
): ParsedExpense | undefined {
  const vendor = typeof raw.vendor === 'string' ? raw.vendor : '';
  const parsedAmount = Math.round(parseAmount(raw.amount) * 100) / 100;
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  if (!hasAmount && !allowMissingAmount) return undefined;
  const amount = hasAmount ? parsedAmount : 0;
  // A date the model misread (impossible, or after tomorrow) becomes today.
  const date =
    isExpenseDateString(raw.date) && raw.date <= addDays(today, 1)
      ? raw.date
      : today;
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

function normalizeExpenseList(parsed: unknown, today: string): ParsedExpense[] {
  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.expenses)
      ? parsed.expenses
      : isRecord(parsed)
        ? [parsed]
        : [];

  const records = entries.filter(isRecord);
  const withAmounts = records
    .map((expense) => normalizeExpense(expense, today))
    .filter((expense): expense is ParsedExpense => expense !== undefined);
  if (withAmounts.length > 0) return withAmounts;

  // Nothing had a readable amount (a faded total, say). If the model still
  // recognised the vendor, hand that back with amount 0 so the user only has
  // to type the total instead of starting over.
  const named = records.find(
    (expense) => typeof expense.vendor === 'string' && expense.vendor.trim(),
  );
  const partial = named && normalizeExpense(named, today, true);
  return partial ? [partial] : [];
}

function isTimeout(error: unknown) {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Gemini rejected the call (billing/credits, quota, overload, bad key...) or
 * did not answer in time: a retryable 503 instead of an opaque 500. The one
 * exception is a 400, which means Gemini would not accept this input (for
 * example an unreadable image); retrying cannot help, so that is a 422.
 */
function toAiError(error: unknown, unreadableMessage: string): unknown {
  if (error instanceof ApiError && error.status === 400) {
    return aiUnreadableError(unreadableMessage, {
      upstreamStatus: error.status,
      cause: error,
    });
  }
  if (!(error instanceof ApiError) && !isTimeout(error)) return error;
  return Object.assign(new Error('AI service is temporarily unavailable'), {
    statusCode: 503,
    code: 'AI_UNAVAILABLE',
    upstreamStatus: error instanceof ApiError ? error.status : undefined,
    cause: error,
  });
}

/** Stable low-latency model; override per environment with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const BASE64_IMAGE_SIGNATURES: ReadonlyArray<[prefix: string, mimeType: string]> = [
  ['/9j/', 'image/jpeg'],
  ['iVBORw0KGgo', 'image/png'],
  ['UklGR', 'image/webp'],
];

/**
 * Splits an optional data-URL prefix from the image and works out its real
 * type, so a PNG or WebP is not sent to the model labelled as a JPEG.
 */
export function describeBase64Image(image: string): {
  data: string;
  mimeType: string;
} {
  const dataUrl = image.match(/^data:(image\/[\w.+-]+);base64,/);
  const data = dataUrl ? image.slice(dataUrl[0].length) : image;
  const sniffed = BASE64_IMAGE_SIGNATURES.find(([prefix]) =>
    data.startsWith(prefix),
  )?.[1];
  return { data, mimeType: sniffed ?? dataUrl?.[1] ?? 'image/jpeg' };
}

export interface GeminiAiServiceOptions {
  model?: string;
  /** The person's own spending summary, so chat answers use real figures. */
  spendingSummary?: SpendingSummaryProvider;
}

export function createGeminiAiService(
  apiKey: string,
  options: GeminiAiServiceOptions = {},
): AiService {
  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL;
  const genAI = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: GEMINI_TIMEOUT_MS },
  });
  const generateContent = async (
    params: Parameters<typeof genAI.models.generateContent>[0],
    unreadableMessage: string,
  ) => {
    try {
      return await genAI.models.generateContent(params);
    } catch (error) {
      throw toAiError(error, unreadableMessage);
    }
  };

  return {
    async analyzeExpense(input: AnalyzeExpenseInput) {
      // The user's calendar date, not the server's UTC one: on a Canadian
      // evening UTC is already tomorrow.
      const todayDate = resolveLocalDate(input.localDate);
      const contents: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [
        {
          text:
            `You are Penny, an AI expense tracking assistant for Canadian self-incorporated software professionals. ` +
            `Extract expenses as minified JSON only. Current date: ${todayDate}. ` +
            `Return {"expenses":[...]} and use the receipt total as one transaction unless the input contains multiple separate receipts or transactions. ` +
            `Dates must be YYYY-MM-DD and never later than the current date. Receipts are Canadian: read an all-numeric date such as 03/02/2025 as month/day/year unless that is impossible or in the future. ` +
            `Categories must be one of: ${expenseCategories.join(', ')}.`,
        },
      ];

      if (input.text) contents.push({ text: `User input: ${input.text}` });
      if (input.imageBase64) {
        contents.push({ inlineData: describeBase64Image(input.imageBase64) });
      }

      const result = await generateContent(
        {
          model,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: expenseSchema,
          },
        },
        UNREADABLE_RECEIPT_MESSAGE,
      );

      if (!result.text) throw aiUnreadableError(UNREADABLE_RECEIPT_MESSAGE);
      const expenses = normalizeExpenseList(
        extractJsonValue(result.text),
        todayDate,
      );
      if (expenses.length === 0) throw aiUnreadableError(UNREADABLE_RECEIPT_MESSAGE);

      return expenses.length === 1 ? expenses[0] : expenses;
    },

    async chat(input: ChatInput) {
      const history = input.conversationHistory
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');
      let summary: string | undefined;
      try {
        summary = await options.spendingSummary?.(input.userId);
      } catch (error) {
        console.error('[AI] Could not load the spending summary for chat:', error);
      }
      const dataRules = summary
        ? `Below is this user's own spending data. Answer questions about their ` +
          `spending, categories, vendors and budgets only from it. If the answer ` +
          `is not in it, say so and point them to the Dashboard or Budgets screen. ` +
          `Never invent or estimate figures that are not in the data.\n` +
          `--- USER DATA ---\n${summary}\n--- END USER DATA ---\n`
        : `You cannot see this user's expenses, budgets, income or savings right now. ` +
          `Never state or estimate their amounts, totals, vendors or trends. When ` +
          `they ask about their own numbers, say you can't look those up at the ` +
          `moment and point them to the Dashboard or Budgets screen.\n`;
      const result = await generateContent(
        {
          model,
          contents: [
            {
              text:
                `You are Penny, a concise Canadian expense tracking assistant. You ` +
                `can explain CRA T2125 categories and help categorise an expense.\n` +
                dataRules +
                `${history ? `Conversation history:\n${history}\n` : ''}` +
                `User: ${input.message}`,
            },
          ],
        },
        'Could not process this message',
      );
      return result.text ?? 'I could not generate a response.';
    },

    async generateConversationTitle(_input: GenerateTitleInput) {
      return 'Expense conversation';
    },
  };
}
