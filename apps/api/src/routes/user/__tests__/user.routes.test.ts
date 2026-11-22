import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';

describe('user preference and account routes', () => {
  it('sets the default group using the authenticated user', async () => {
    const setDefaultGroup = vi.fn(async () => ({
      success: true,
      defaultGroupId: 'group-1',
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        userPreferences: {
          getDefaultGroup: vi.fn(),
          setDefaultGroup,
          clearDefaultGroup: vi.fn(),
        },
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/user/default-group',
      headers: { authorization: 'Bearer valid-token' },
      payload: { userId: 'user-1', groupId: 'group-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      defaultGroupId: 'group-1',
    });
    expect(setDefaultGroup).toHaveBeenCalledWith({
      userId: 'user-1',
      groupId: 'group-1',
    });

    await app.close();
  });

  it.each([['group-1'], [null]])(
    'returns the default group (%s) under both field names',
    async (defaultGroupId) => {
      const getDefaultGroup = vi.fn(async () => ({ defaultGroupId }));
      const app = await buildApiApp({
        readyCheck: async () => undefined,
        auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
        services: {
          userPreferences: {
            getDefaultGroup,
            setDefaultGroup: vi.fn(),
            clearDefaultGroup: vi.fn(),
          },
        } as never,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/default-group?userId=user-1',
        headers: { authorization: 'Bearer valid-token' },
      });

      expect(response.statusCode).toBe(200);
      // `groupId` is what released mobile builds read.
      expect(response.json()).toEqual({ defaultGroupId, groupId: defaultGroupId });
      expect(getDefaultGroup).toHaveBeenCalledWith({ userId: 'user-1' });

      await app.close();
    },
  );

  it('deletes the authenticated account through the account service', async () => {
    const deleteAccount = vi.fn(async () => ({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        accounts: { deleteAccount },
      } as never,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/account/delete',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
    });
    expect(deleteAccount).toHaveBeenCalledWith({ userId: 'user-1' });

    await app.close();
  });
});
