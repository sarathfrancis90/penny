import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../app';
import { createUnavailableMobileDataService } from '../../services/mobile-data';
import { PHOTO_UPLOAD_BODY_LIMIT } from '../upload-limits';

// Sizes seen in production: phone camera receipts are ~1.05-1.3 MB once
// base64-encoded, just over Fastify's 1 MiB default body limit.
const CAMERA_PHOTO_BASE64 = 'A'.repeat(1_300_000);

async function buildApp() {
  const analyzeExpense = vi.fn(async () => ({
    vendor: 'Acme',
    amount: 12.5,
    date: '2026-06-06',
    category: 'Groceries',
    confidence: 0.9,
  }));
  const uploadMedia = vi.fn(async () => ({ url: 'https://example.test/r.jpg', path: 'r.jpg' }));
  const verifyIdToken = vi.fn(async () => ({ uid: 'user-1' }));
  const app = await buildApiApp({
    readyCheck: async () => undefined,
    auth: { verifyIdToken },
    services: {
      ai: { analyzeExpense, chat: vi.fn(), generateConversationTitle: vi.fn() },
      mobileData: {
        ...createUnavailableMobileDataService(),
        uploadMedia,
      } as never,
    },
  });
  return { app, analyzeExpense, uploadMedia, verifyIdToken };
}

describe('photo upload size limits', () => {
  it('accepts a phone camera receipt on analyze-expense', async () => {
    const { app, analyzeExpense } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: { imageBase64: CAMERA_PHOTO_BASE64 },
    });
    expect(response.statusCode).toBe(200);
    expect(analyzeExpense).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', imageBase64: CAMERA_PHOTO_BASE64 }),
    );
    await app.close();
  });

  it.each(['receipt', 'avatar'])('accepts a phone camera photo on media/%s', async (kind) => {
    const { app, uploadMedia } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/media/${kind}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { fileName: 'r.jpg', contentType: 'image/jpeg', base64: CAMERA_PHOTO_BASE64 },
    });
    expect(response.statusCode).toBe(200);
    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', kind, base64: CAMERA_PHOTO_BASE64 }),
    );
    await app.close();
  });

  it('still rejects payloads above the photo limit', async () => {
    const { app, analyzeExpense } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analyze-expense',
      headers: { authorization: 'Bearer valid-token' },
      payload: { imageBase64: 'A'.repeat(PHOTO_UPLOAD_BODY_LIMIT + 1) },
    });
    expect(response.statusCode).toBe(413);
    expect(analyzeExpense).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unauthenticated photo uploads before reading the body', async () => {
    const { app, analyzeExpense, uploadMedia } = await buildApp();
    for (const [url, payload] of [
      ['/api/analyze-expense', { imageBase64: CAMERA_PHOTO_BASE64 }],
      ['/api/media/receipt', { fileName: 'r.jpg', contentType: 'image/jpeg', base64: CAMERA_PHOTO_BASE64 }],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, payload });
      expect(response.statusCode).toBe(401);
    }
    expect(analyzeExpense).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps the 1 MiB default on routes that do not carry photos', async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai-chat',
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'A'.repeat(1_300_000) },
    });
    expect(response.statusCode).toBe(413);
    await app.close();
  });
});
