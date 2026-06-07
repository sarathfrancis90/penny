import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';

function conversationService(overrides: Record<string, unknown> = {}) {
  return {
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    listMessages: vi.fn(),
    addMessage: vi.fn(),
    ...overrides,
  };
}

describe('conversation routes', () => {
  it('creates conversations using the authenticated user', async () => {
    const createConversation = vi.fn(async () => ({
      success: true,
      conversationId: 'conversation-1',
      messageId: 'message-1',
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        conversations: conversationService({ createConversation }),
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        title: 'Receipt help',
        firstMessage: 'Can I deduct this?',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', title: 'Receipt help' }),
    );

    await app.close();
  });

  it('adds messages using the authenticated user', async () => {
    const addMessage = vi.fn(async () => ({
      success: true,
      messageId: 'message-2',
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        conversations: conversationService({ addMessage }),
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations/conversation-1/messages',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        role: 'user',
        content: 'Add lunch expense',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      messageId: 'message-2',
    });
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        conversationId: 'conversation-1',
        role: 'user',
      }),
    );

    await app.close();
  });
});
