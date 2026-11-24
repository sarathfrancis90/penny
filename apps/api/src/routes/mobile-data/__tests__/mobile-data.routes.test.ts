import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';
import { createUnavailableMobileDataService } from '../../../services/mobile-data';

describe('mobile data routes', () => {
  it('declines invitations as the verified token email, whatever the body says', async () => {
    const declineInvitation = vi.fn(async () => ({ success: true as const }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'user-1', email: 'user-1@example.com' }),
      },
      services: {
        mobileData: { ...createUnavailableMobileDataService(), declineInvitation },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/groups/invitations/invite-1/decline',
      headers: { authorization: 'Bearer valid-token' },
      payload: { userEmail: 'victim@example.com', userId: 'victim' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(declineInvitation).toHaveBeenCalledWith({
      userId: 'user-1',
      userEmail: 'user-1@example.com',
      id: 'invite-1',
    });

    await app.close();
  });
});
