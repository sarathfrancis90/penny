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

  it('returns a clear 503 when the AI provider is unavailable', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'user-1' }),
      },
      services: {
        ai: {
          analyzeExpense: vi.fn(async () => {
            throw Object.assign(
              new Error('AI service is temporarily unavailable'),
              { statusCode: 503, code: 'AI_UNAVAILABLE' },
            );
          }),
          chat: vi.fn(),
          generateConversationTitle: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: { imageBase64: 'base64-receipt' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: 'Service unavailable',
      code: 'AI_UNAVAILABLE',
      details: 'AI service is temporarily unavailable',
    });

    await app.close();
  });

  it('keeps unexpected AI failures as generic 500s', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'user-1' }),
      },
      services: {
        ai: {
          analyzeExpense: vi.fn(async () => {
            throw new Error('secret internal detail');
          }),
          chat: vi.fn(),
          generateConversationTitle: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: { text: 'coffee $4' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Internal server error',
      requestId: expect.any(String),
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

  it('returns a non-retryable 422 with a readable message when the receipt cannot be read', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        ai: {
          analyzeExpense: vi.fn(async () => {
            throw Object.assign(new Error('Could not read this receipt'), {
              statusCode: 422,
              code: 'AI_UNREADABLE',
            });
          }),
          chat: vi.fn(),
          generateConversationTitle: vi.fn(),
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: { imageBase64: 'base64-receipt' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'Error',
      code: 'AI_UNREADABLE',
      details: 'Could not read this receipt',
      requestId: expect.any(String),
    });

    await app.close();
  });

  it('passes the optional client localDate to the AI service', async () => {
    const analyzeExpense = vi.fn(async () => ({
      vendor: 'Cafe',
      amount: 4,
      date: '2026-06-30',
      category: 'Meals and entertainment',
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        ai: { analyzeExpense, chat: vi.fn(), generateConversationTitle: vi.fn() },
      },
    });
    const analyze = (payload: object) =>
      app.inject({
        method: 'POST',
        url: '/api/analyze-expense',
        headers: { authorization: 'Bearer valid-token' },
        payload,
      });

    expect((await analyze({ text: 'coffee $4', localDate: '2026-06-30' })).statusCode).toBe(200);
    expect(analyzeExpense).toHaveBeenLastCalledWith({
      userId: 'user-1',
      text: 'coffee $4',
      imageBase64: undefined,
      localDate: '2026-06-30',
    });

    // Older apps send no localDate; a non-string one is dropped, not an error.
    expect((await analyze({ text: 'coffee $4' })).statusCode).toBe(200);
    expect(analyzeExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ localDate: undefined }),
    );
    expect((await analyze({ text: 'coffee $4', localDate: 20260630 })).statusCode).toBe(200);
    expect(analyzeExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ localDate: undefined }),
    );

    await app.close();
  });
});
