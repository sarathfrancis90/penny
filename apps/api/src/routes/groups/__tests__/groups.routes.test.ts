import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../../../app';
import type { GroupService } from '../../../services/groups';

function groupService(overrides: Partial<GroupService> = {}): GroupService {
  return {
    createGroup: vi.fn(),
    listGroups: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    listMembers: vi.fn(),
    inviteMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    acceptInvitation: vi.fn(),
    archiveGroup: vi.fn(),
    leaveGroup: vi.fn(),
    ...overrides,
  } as GroupService;
}

describe('group routes', () => {
  it('rejects mismatched body userId on group creation', async () => {
    const createGroup = vi.fn();
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-token' }) },
      services: {
        groups: groupService({ createGroup }),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: 'Bearer valid-token' },
      payload: { userId: 'user-body', name: 'Business' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: 'Forbidden',
      details: 'Request userId does not match authenticated user',
    });
    expect(createGroup).not.toHaveBeenCalled();

    await app.close();
  });

  it('creates groups using the authenticated user as owner', async () => {
    const createGroup = vi.fn(async () => ({
      groupId: 'group-1',
      group: {
        id: 'group-1',
        name: 'Business',
        myRole: 'owner',
      },
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1', email: 'u@example.com' }) },
      services: {
        groups: groupService({ createGroup }),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: 'Bearer valid-token' },
      payload: { name: 'Business', userName: 'User' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      groupId: 'group-1',
      message: 'Group created successfully',
      group: { id: 'group-1', name: 'Business', myRole: 'owner' },
    });
    expect(createGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        userEmail: 'u@example.com',
        name: 'Business',
      }),
    );

    await app.close();
  });

  it('deletes groups using the authenticated user', async () => {
    const deleteGroup = vi.fn(async () => undefined);
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: {
        groups: groupService({ deleteGroup }),
      },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/groups/group-1?userId=user-1',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      message: 'Group deleted successfully',
    });
    expect(deleteGroup).toHaveBeenCalledWith({
      groupId: 'group-1',
      userId: 'user-1',
    });

    await app.close();
  });
});
