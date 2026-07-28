import { describe, expect, it, vi } from 'vitest';

import { createGeminiAiService } from '../gemini-ai';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
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
});
