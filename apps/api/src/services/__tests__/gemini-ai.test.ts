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
});
