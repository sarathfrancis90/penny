import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';

describe('AI routes', () => {
  it('normalizes invalid AI categories to the canonical fallback', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'user-1', email: 'user@example.com' }),
      },
      services: {
        ai: {
          analyzeExpense: vi.fn(async () => ({
            vendor: 'Acme',
            amount: 12.5,
            date: '2026-06-06',
            category: 'Other Business Expenses',
            confidence: 0.88,
          })),
          chat: vi.fn(),
          generateConversationTitle: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: { text: 'Acme receipt for $12.50' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        vendor: 'Acme',
        amount: 12.5,
        date: '2026-06-06',
        category: 'Other expenses (specify)',
      },
    });

    await app.close();
  });

  it('rejects analyze-expense requests without text or image', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'user-1' }),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Bad Request',
      details: 'Either text or imageBase64 must be provided',
    });

    await app.close();
  });

  it('returns AI chat responses in the existing mobile response shape', async () => {
    const chat = vi.fn(async () => 'I found one deductible expense.');
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'user-1' }),
      },
      services: {
        ai: {
          analyzeExpense: vi.fn(),
          chat,
          generateConversationTitle: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai-chat',
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'Can I deduct this?' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      message: 'I found one deductible expense.',
    });
    expect(chat).toHaveBeenCalledWith({
      message: 'Can I deduct this?',
      userId: 'user-1',
      conversationHistory: [],
    });

    await app.close();
  });
});
