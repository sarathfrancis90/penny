import { describe, expect, it, vi } from 'vitest';

import { createGeminiAiService } from '../gemini-ai';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(options: { message: string; status: number }) {
      super(options.message);
      this.status = options.status;
    }
  },
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: mocks.generateContent,
      },
    };
  }),
  Type: {
    ARRAY: 'ARRAY',
    NUMBER: 'NUMBER',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

describe('Gemini AI service', () => {
  it('normalizes top-level expense arrays returned from receipt analysis', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          vendor: 'Milton Sobeys',
          amount: '6.29',
          date: '2026-06-18',
          category: 'Groceries',
          description: 'Potato chips',
          confidence: 0.91,
        },
        {
          vendor: 'Milton Sobeys',
          amount: '33.25',
          date: '2026-06-18',
          category: 'Groceries',
          description: 'Produce and bakery',
          confidence: 0.89,
        },
      ]),
    });

    const service = createGeminiAiService('test-key');

    await expect(
      service.analyzeExpense({
        userId: 'user-1',
        imageBase64: 'base64-receipt',
      }),
    ).resolves.toEqual([
      {
        vendor: 'Milton Sobeys',
        amount: 6.29,
        date: '2026-06-18',
        category: 'Groceries',
        description: 'Potato chips',
        confidence: 0.91,
      },
      {
        vendor: 'Milton Sobeys',
        amount: 33.25,
        date: '2026-06-18',
        category: 'Groceries',
        description: 'Produce and bakery',
        confidence: 0.89,
      },
    ]);
  });

  it('uses a broad category schema to avoid enum rejection', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        expenses: [
          {
            vendor: 'Subway',
            amount: 12.5,
            date: '2026-06-06',
            category: 'Meals and entertainment',
          },
        ],
      }),
    });

    const service = createGeminiAiService('test-key');

    await service.analyzeExpense({
      userId: 'user-1',
      text: 'I spent $12.50 at Subway',
    });

    const call = mocks.generateContent.mock.calls.at(-1)?.[0];
    expect(call?.config?.responseSchema?.properties?.expenses?.items?.properties?.category).toEqual({
      type: 'STRING',
    });
    expect(call?.config?.responseSchema?.properties?.expenses?.items?.type).toBe('OBJECT');
    expect(call?.config?.responseSchema?.properties?.expenses?.minItems).toBe(1);
  });

  it('keeps using the current production model', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ expenses: [{ vendor: 'A', amount: 1, date: '2026-06-06', category: 'Groceries' }] }),
    });
    await createGeminiAiService('test-key').analyzeExpense({ userId: 'u', text: 'A $1' });
    expect(mocks.generateContent.mock.calls.at(-1)?.[0]?.model).toBe('gemini-3-flash-preview');
  });

  it('maps Gemini provider errors (e.g. depleted credits) to a 503 AI_UNAVAILABLE error', async () => {
    const { ApiError } = await import('@google/genai');
    mocks.generateContent.mockRejectedValueOnce(
      new ApiError({ message: 'Your prepayment credits are depleted', status: 402 }),
    );

    await expect(
      createGeminiAiService('test-key').analyzeExpense({ userId: 'u', imageBase64: 'x' }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_UNAVAILABLE',
      upstreamStatus: 402,
      message: 'AI service is temporarily unavailable',
    });
  });

  it('maps Gemini provider errors in chat too', async () => {
    const { ApiError } = await import('@google/genai');
    mocks.generateContent.mockRejectedValueOnce(
      new ApiError({ message: 'quota', status: 429 }),
    );

    await expect(
      createGeminiAiService('test-key').chat({ userId: 'u', message: 'hi', conversationHistory: [] }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE', upstreamStatus: 429 });
  });

  it('leaves non-provider errors untouched', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('boom'));
    await expect(
      createGeminiAiService('test-key').analyzeExpense({ userId: 'u', text: 'x' }),
    ).rejects.toThrow('boom');
  });
});
