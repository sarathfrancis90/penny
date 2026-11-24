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
    listMyInvitations: vi.fn(async () => []),
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

  it('accepts invitations with the verified token email, not the email in the body', async () => {
    const acceptInvitation = vi.fn(async () => ({
      groupId: 'group-1',
      groupName: 'Studio',
      role: 'member' as const,
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: {
        verifyIdToken: async () => ({ uid: 'attacker', email: 'attacker@example.com' }),
      },
      services: { groups: groupService({ acceptInvitation }) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/groups/invitations/accept',
      headers: { authorization: 'Bearer valid-token' },
      payload: { token: 'secret-token', userEmail: 'victim@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'secret-token',
        userId: 'attacker',
        userEmail: 'attacker@example.com',
      }),
    );

    await app.close();
  });

  it('falls back to the body email only when the token carries none', async () => {
    const acceptInvitation = vi.fn(async () => ({
      groupId: 'group-1',
      groupName: 'Studio',
      role: 'member' as const,
    }));
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: { groups: groupService({ acceptInvitation }) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/groups/invitations/accept',
      headers: { authorization: 'Bearer valid-token' },
      payload: { token: 'secret-token', userEmail: 'user-1@example.com' },
    });

    expect(acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: 'user-1@example.com' }),
    );

    await app.close();
  });

  it('lists pending invitations for the verified token email', async () => {
    const invitation = {
      id: 'invite-1',
      groupId: 'group-1',
      groupName: 'Studio',
      invitedBy: 'owner-1',
      invitedByName: 'Olive',
      role: 'member',
      createdAt: '2026-11-01T12:00:00.000Z',
      expiresAt: '2026-11-08T12:00:00.000Z',
    };
    const listMyInvitations = vi.fn(async () => [invitation]);
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1', email: 'Invitee@Example.com' }) },
      services: { groups: groupService({ listMyInvitations }) },
    });

    const response = await app.inject({
      method: 'GET',
      // A userEmail in the query is never used.
      url: '/api/groups/invitations?userEmail=victim@example.com',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ invitations: [invitation] });
    expect(listMyInvitations).toHaveBeenCalledWith({
      userId: 'user-1',
      userEmail: 'Invitee@Example.com',
    });
    await app.close();
  });

  it('returns an empty list when the token carries no email', async () => {
    const listMyInvitations = vi.fn(async () => []);
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1' }) },
      services: { groups: groupService({ listMyInvitations }) },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/groups/invitations',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ invitations: [] });
    expect(listMyInvitations).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires a signed-in caller', async () => {
    const app = await buildApiApp({
      readyCheck: async () => undefined,
      auth: { verifyIdToken: async () => ({ uid: 'user-1', email: 'a@example.com' }) },
      services: { groups: groupService() },
    });
    const response = await app.inject({ method: 'GET', url: '/api/groups/invitations' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
