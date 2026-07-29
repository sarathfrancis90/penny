import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {},
}));

vi.mock('@/lib/auth-middleware', () => ({
  getAuthenticatedUserId: vi.fn(async () => 'test-user'),
}));

vi.mock('@/lib/services/budgetNotificationService', () => ({
  BudgetNotificationService: {
    checkAndNotify: vi.fn(async () => undefined),
  },
}));

vi.mock('@/lib/services/pushService', () => ({
  PushService: {
    sendToUsers: vi.fn(async () => undefined),
  },
}));

const { POST } = await import('../route');

describe('/api/expenses', () => {
  it('returns 400 for invalid JSON bodies', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON body');
    expect(body.details).toBe('Request body must be valid JSON');
  });
});
