import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreGroupService } from '../firestore-groups';
import { DEFAULT_ROLE_PERMISSIONS } from '../group-permissions';
import type { NotificationService } from '../notifications';

function notifications(): NotificationService {
  return {
    notifyGroupMembers: vi.fn(async () => undefined),
    notifyUsers: vi.fn(async () => undefined),
  };
}

function member(
  db: FakeFirestore,
  groupId: string,
  userId: string,
  role: keyof typeof DEFAULT_ROLE_PERMISSIONS,
  status = 'active',
) {
  db.seed(`groupMembers/${groupId}_${userId}`, {
    groupId,
    userId,
    userEmail: `${userId}@example.com`,
    userName: userId,
    role,
    status,
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
  });
}

function setup() {
  const db = new FakeFirestore();
  for (const groupId of ['group-a', 'group-b']) {
    db.seed(`groups/${groupId}`, {
      name: groupId,
      status: 'active',
      settings: { allowMemberInvites: true },
      stats: { memberCount: 3, expenseCount: 0, totalAmount: 0 },
    });
  }
  member(db, 'group-a', 'admin-a', 'admin');
  member(db, 'group-a', 'owner-a', 'owner');
  member(db, 'group-a', 'member-a', 'member');
  member(db, 'group-b', 'owner-b', 'owner');
  member(db, 'group-b', 'member-b', 'member');
  member(db, 'group-b', 'viewer-b', 'viewer');
  const notificationService = notifications();
  const service = createFirestoreGroupService(db as never, notificationService);
  return { db, service, notificationService };
}

function invitation(db: FakeFirestore, overrides: Record<string, unknown> = {}) {
  db.seed('groupInvitations/invite-1', {
    groupId: 'group-a',
    groupName: 'group-a',
    invitedEmail: 'invitee@example.com',
    invitedBy: 'owner-a',
    role: 'member',
    status: 'pending',
    token: 'secret-token',
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 60_000)),
    createdAt: Timestamp.now(),
    ...overrides,
  });
}

describe('inviting someone who already has a pending invitation', () => {
  const invite = (service: ReturnType<typeof setup>['service'], email: string) =>
    service.inviteMember({ groupId: 'group-a', userId: 'owner-a', email, role: 'member' });

  it('refuses a second invite to the same address, ignoring case', async () => {
    const { db, service } = setup();
    invitation(db);
    await expect(invite(service, 'Invitee@Example.com')).rejects.toMatchObject({
      statusCode: 400,
      message: 'User is already invited',
    });
  });

  it('allows a new invite once the old one has expired or was declined', async () => {
    const { db, service } = setup();
    invitation(db, { expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)) });
    await expect(invite(service, 'invitee@example.com')).resolves.toMatchObject({
      invitationId: expect.any(String),
    });
    db.seed('groupInvitations/invite-2', {
      groupId: 'group-a',
      invitedEmail: 'other@example.com',
      status: 'declined',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 60_000)),
    });
    await expect(invite(service, 'other@example.com')).resolves.toMatchObject({
      invitationId: expect.any(String),
    });
  });

  it('does not count a pending invite to the same address in another group', async () => {
    const { db, service } = setup();
    invitation(db, { groupId: 'group-b' });
    await expect(invite(service, 'invitee@example.com')).resolves.toMatchObject({
      invitationId: expect.any(String),
    });
  });
});

describe('member lookups are scoped to the route group', () => {
  it('does not let an admin of one group change roles in another group', async () => {
    const { db, service } = setup();

    await expect(
      service.updateMemberRole({
        groupId: 'group-a',
        requesterUserId: 'admin-a',
        memberId: 'group-b_member-b',
        newRole: 'viewer',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(db.read('groupMembers/group-b_member-b')?.role).toBe('member');
  });

  it('does not let an admin of one group remove a member of another group', async () => {
    const { db, service } = setup();

    await expect(
      service.removeMember({
        groupId: 'group-a',
        requesterUserId: 'admin-a',
        memberId: 'group-b_member-b',
        action: 'remove',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(db.read('groupMembers/group-b_member-b')?.status).toBe('active');
    expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 3 });
    expect(db.read('groups/group-b')?.stats).toMatchObject({ memberCount: 3 });
  });

  it('still resolves members by user id and by document id within the group', async () => {
    const { db, service } = setup();

    await service.updateMemberRole({
      groupId: 'group-a',
      requesterUserId: 'owner-a',
      memberId: 'member-a',
      newRole: 'viewer',
    });
    expect(db.read('groupMembers/group-a_member-a')?.role).toBe('viewer');

    await service.updateMemberRole({
      groupId: 'group-a',
      requesterUserId: 'owner-a',
      memberId: 'group-a_member-a',
      newRole: 'member',
    });
    expect(db.read('groupMembers/group-a_member-a')?.role).toBe('member');
  });
});

describe('member count', () => {
  it('decrements once when a member is removed twice', async () => {
    const { db, service } = setup();
    const remove = () =>
      service.removeMember({
        groupId: 'group-a',
        requesterUserId: 'owner-a',
        memberId: 'member-a',
        action: 'remove',
      });

    await remove();
    await remove();

    expect(db.read('groupMembers/group-a_member-a')?.status).toBe('removed');
    expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 2 });
    expect(db.paths('groupActivities')).toHaveLength(1);
  });

  it('decrements once when a member leaves twice, through either route', async () => {
    const { db, service } = setup();

    await service.leaveGroup({ groupId: 'group-a', userId: 'member-a' });
    await service.leaveGroup({ groupId: 'group-a', userId: 'member-a' });
    await service.removeMember({
      groupId: 'group-a',
      requesterUserId: 'member-a',
      memberId: 'member-a',
      action: 'leave',
    });

    expect(db.read('groupMembers/group-a_member-a')?.status).toBe('left');
    expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 2 });
  });

  it('removes a still-invited member without touching the count', async () => {
    const { db, service } = setup();
    member(db, 'group-a', 'pending-a', 'member', 'invited');

    await service.removeMember({
      groupId: 'group-a',
      requesterUserId: 'owner-a',
      memberId: 'pending-a',
      action: 'remove',
    });

    expect(db.read('groupMembers/group-a_pending-a')?.status).toBe('removed');
    expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 3 });
  });

  it('uses atomic increments so concurrent joins and removals are not lost', async () => {
    const { db, service } = setup();
    invitation(db);
    const groupRef = db.collection('groups').doc('group-a');
    const update = vi.spyOn(db, 'applyUpdate');

    await service.acceptInvitation({
      token: 'secret-token',
      userId: 'invitee',
      userEmail: 'invitee@example.com',
    });
    await service.removeMember({
      groupId: 'group-a',
      requesterUserId: 'owner-a',
      memberId: 'member-a',
      action: 'remove',
    });

    const memberCountWrites = update.mock.calls
      .filter(([path]) => path === groupRef.path)
      .map(([, data]) => data['stats.memberCount']);
    expect(memberCountWrites).toHaveLength(2);
    for (const write of memberCountWrites) expect(typeof write).not.toBe('number');
    expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 3 });
  });
});

describe('inviting someone', () => {
  const invite = (service: ReturnType<typeof setup>['service']) =>
    service.inviteMember({
      groupId: 'group-a',
      userId: 'owner-a',
      email: 'Invitee@Example.com',
      role: 'member',
    });

  it('gives the invited user everything the app needs to accept', async () => {
    const { db, service, notificationService } = setup();
    db.seed('users/invitee', { email: 'invitee@example.com' });

    const result = await invite(service);

    expect(notificationService.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['invitee'],
        type: 'group_invitation',
        metadata: expect.objectContaining({
          invitationId: result.invitationId,
          invitationToken: result.token,
          groupId: 'group-a',
        }),
      }),
    );
  });

  it('names the inviter by email when they joined without a display name', async () => {
    const { db, service, notificationService } = setup();
    db.seed('users/invitee', { email: 'invitee@example.com' });
    db.seed('groupMembers/group-a_owner-a', {
      groupId: 'group-a',
      userId: 'owner-a',
      userEmail: 'owner-a@example.com',
      userName: '',
      role: 'owner',
      status: 'active',
      permissions: DEFAULT_ROLE_PERMISSIONS.owner,
    });

    await invite(service);

    const call = vi.mocked(notificationService.notifyUsers).mock.calls[0][0] as {
      body: string;
    };
    expect(call.body).toBe('owner-a@example.com invited you to join group-a');
  });

  it('finds the invited user through sign-in records when their profile has no email', async () => {
    const db = new FakeFirestore();
    db.seed('groups/group-a', { name: 'group-a', status: 'active', settings: {}, stats: {} });
    member(db, 'group-a', 'owner-a', 'owner');
    const notificationService = notifications();
    const auth = { getUserByEmail: vi.fn(async () => ({ uid: 'invitee' })) };
    const service = createFirestoreGroupService(db as never, notificationService, auth);

    await invite(service);

    expect(auth.getUserByEmail).toHaveBeenCalledWith('invitee@example.com');
    expect(notificationService.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['invitee'] }),
    );
  });

  it('falls back to the profile email when the sign-in lookup fails', async () => {
    const db = new FakeFirestore();
    db.seed('groups/group-a', { name: 'group-a', status: 'active', settings: {}, stats: {} });
    member(db, 'group-a', 'owner-a', 'owner');
    db.seed('users/invitee', { email: 'invitee@example.com' });
    const notificationService = notifications();
    const auth = {
      getUserByEmail: vi.fn(async () => {
        throw new Error('identity service unavailable');
      }),
    };
    const service = createFirestoreGroupService(db as never, notificationService, auth);

    await invite(service);

    expect(notificationService.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['invitee'] }),
    );
  });

  it('never tells other members the invitation token', async () => {
    const { db, service } = setup();
    db.seed('users/invitee', { email: 'invitee@example.com' });

    const result = await invite(service);

    const activities = db.paths('groupActivities').map((path) => db.read(path));
    expect(activities.length).toBeGreaterThan(0);
    expect(JSON.stringify(activities)).not.toContain(result.token);
  });
});

describe('accepting invitations', () => {
  it('accepts by invitation id when the app has no token (older notifications)', async () => {
    const { db, service } = setup();
    invitation(db);

    const result = await service.acceptInvitation({
      token: '',
      invitationId: 'invite-1',
      userId: 'invitee',
      userEmail: 'invitee@example.com',
    });

    expect(result).toMatchObject({ groupId: 'group-a', role: 'member' });
    expect(db.read('groupMembers/group-a_invitee')).toMatchObject({ status: 'active' });
    expect(db.read('groupInvitations/invite-1')?.status).toBe('accepted');
  });

  it('still checks the email when accepting by invitation id', async () => {
    const { db, service } = setup();
    invitation(db);

    await expect(
      service.acceptInvitation({
        token: '',
        invitationId: 'invite-1',
        userId: 'attacker',
        userEmail: 'attacker@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.read('groupMembers/group-a_attacker')).toBeUndefined();
  });

  it('rejects an unknown or already-used invitation id', async () => {
    const { db, service } = setup();
    invitation(db, { status: 'accepted' });

    for (const invitationId of ['invite-1', 'no-such-invite']) {
      await expect(
        service.acceptInvitation({
          token: '',
          invitationId,
          userId: 'invitee',
          userEmail: 'invitee@example.com',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    }
  });

  it('rejects a caller whose email is not the invited one', async () => {
    const { db, service } = setup();
    invitation(db);

    await expect(
      service.acceptInvitation({
        token: 'secret-token',
        userId: 'attacker',
        userEmail: 'attacker@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.read('groupMembers/group-a_attacker')).toBeUndefined();
    expect(db.read('groupInvitations/invite-1')?.status).toBe('pending');
  });

  it('refuses to join a group that was deleted or archived', async () => {
    for (const status of ['deleted', 'archived']) {
      const { db, service } = setup();
      invitation(db);
      db.seed('groups/group-a', { name: 'group-a', status, stats: { memberCount: 3 } });

      await expect(
        service.acceptInvitation({
          token: 'secret-token',
          userId: 'invitee',
          userEmail: 'invitee@example.com',
        }),
      ).rejects.toMatchObject({ statusCode: 410 });
      expect(db.read('groupMembers/group-a_invitee')).toBeUndefined();
      expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 3 });
    }
  });

  it('refuses to join a group that no longer exists', async () => {
    const { db, service } = setup();
    invitation(db, { groupId: 'group-gone' });

    await expect(
      service.acceptInvitation({
        token: 'secret-token',
        userId: 'invitee',
        userEmail: 'invitee@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.read('groupMembers/group-gone_invitee')).toBeUndefined();
  });

  it('joins an active group for the invited email', async () => {
    const { db, service } = setup();
    invitation(db);

    const result = await service.acceptInvitation({
      token: 'secret-token',
      userId: 'invitee',
      userEmail: 'Invitee@Example.com',
    });

    expect(result).toEqual({ groupId: 'group-a', groupName: 'group-a', role: 'member' });
    expect(db.read('groupMembers/group-a_invitee')).toMatchObject({
      status: 'active',
      role: 'member',
      userEmail: 'invitee@example.com',
    });
    expect(db.read('groups/group-a')?.stats).toMatchObject({ memberCount: 4 });
  });
});

describe('deleting a large group', () => {
  function largeGroup() {
    const context = setup();
    for (let index = 0; index < 620; index += 1) {
      context.db.seed(`expenses/expense-${index}`, {
        userId: 'member-a',
        groupId: 'group-a',
        expenseType: 'group',
        amount: 1,
      });
    }
    for (let index = 0; index < 510; index += 1) {
      member(context.db, 'group-a', `bulk-${index}`, 'member');
    }
    return context;
  }

  it('splits member and expense updates into batches under the 500-write limit', async () => {
    const { db, service } = largeGroup();

    await service.deleteGroup({ groupId: 'group-a', userId: 'owner-a' });

    expect(Math.max(...db.batchSizes)).toBeLessThanOrEqual(450);
    expect(db.batchSizes.reduce((sum, size) => sum + size, 0)).toBe(513 + 620);
    expect(db.read('groups/group-a')?.status).toBe('deleted');
    expect(db.read('expenses/expense-619')).toMatchObject({ groupId: null, expenseType: 'personal' });
    expect(db.read('groupMembers/group-a_bulk-509')?.status).toBe('removed');
    expect(db.read('groupMembers/group-b_member-b')?.status).toBe('active');
  });

  it('marks the group deleted last so a failed run can be retried', async () => {
    const { db, service } = largeGroup();
    db.failCommitAt = 2;

    await expect(
      service.deleteGroup({ groupId: 'group-a', userId: 'owner-a' }),
    ).rejects.toThrow('simulated batch commit failure');
    expect(db.read('groups/group-a')?.status).toBe('active');

    await service.deleteGroup({ groupId: 'group-a', userId: 'owner-a' });
    expect(db.read('groups/group-a')?.status).toBe('deleted');
    expect(
      db.paths('expenses').filter((path) => db.read(path)?.groupId === 'group-a'),
    ).toHaveLength(0);
  });
});

describe('legacy memberships without a permissions map', () => {
  function legacy(db: FakeFirestore, groupId: string, userId: string, role: string) {
    db.seed(`groupMembers/${groupId}_${userId}`, {
      groupId,
      userId,
      userEmail: `${userId}@example.com`,
      userName: userId,
      role,
      status: 'active',
    });
  }

  it('lets a legacy owner change settings and a legacy admin invite and remove', async () => {
    const { db, service } = setup();
    legacy(db, 'group-a', 'owner-a', 'owner');
    legacy(db, 'group-a', 'admin-a', 'admin');

    await expect(
      service.updateGroup({
        groupId: 'group-a',
        userId: 'owner-a',
        updates: { settings: { requireApproval: true } },
      }),
    ).resolves.toMatchObject({ settings: { requireApproval: true } });

    await expect(
      service.inviteMember({
        groupId: 'group-a',
        userId: 'admin-a',
        email: 'new@example.com',
        role: 'member',
      }),
    ).resolves.toMatchObject({ invitationId: expect.any(String) });

    await expect(
      service.removeMember({
        groupId: 'group-a',
        requesterUserId: 'admin-a',
        memberId: 'member-a',
        action: 'remove',
      }),
    ).resolves.toBeUndefined();
    expect(db.read('groupMembers/group-a_member-a')).toMatchObject({ status: 'removed' });
  });

  it('still refuses a legacy member those actions', async () => {
    const { db, service } = setup();
    legacy(db, 'group-a', 'member-a', 'member');

    await expect(
      service.inviteMember({
        groupId: 'group-a',
        userId: 'member-a',
        email: 'new@example.com',
        role: 'member',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lists the role defaults as my permissions', async () => {
    const { db, service } = setup();
    legacy(db, 'group-b', 'member-b', 'member');

    const groups = await service.listGroups({ userId: 'member-b' });
    expect(groups).toEqual([
      expect.objectContaining({ id: 'group-b', myPermissions: DEFAULT_ROLE_PERMISSIONS.member }),
    ]);
  });
});

describe('listing my pending invitations', () => {
  const later = () => Timestamp.fromDate(new Date(Date.now() + 86_400_000));
  const earlier = () => Timestamp.fromDate(new Date(Date.now() - 86_400_000));

  function seedInvitation(db: FakeFirestore, id: string, overrides: Record<string, unknown>) {
    db.seed(`groupInvitations/${id}`, {
      groupId: 'group-a',
      groupName: 'Old name',
      invitedEmail: 'invitee@example.com',
      invitedBy: 'owner-a',
      invitedByName: 'Olive',
      role: 'member',
      status: 'pending',
      token: `token-${id}`,
      createdAt: Timestamp.fromDate(new Date('2026-11-01T12:00:00Z')),
      expiresAt: later(),
      ...overrides,
    });
  }

  it('returns only pending, unexpired invitations for the email to active groups', async () => {
    const { db, service } = setup();
    db.seed('groups/group-archived', { name: 'Archived', status: 'archived' });
    seedInvitation(db, 'ok', {});
    seedInvitation(db, 'ok-b', {
      groupId: 'group-b',
      groupName: 'group-b',
      role: 'viewer',
      invitedByName: undefined,
      createdAt: Timestamp.fromDate(new Date('2026-11-05T12:00:00Z')),
    });
    seedInvitation(db, 'expired', { expiresAt: earlier() });
    seedInvitation(db, 'accepted', { status: 'accepted' });
    seedInvitation(db, 'someone-else', { invitedEmail: 'other@example.com' });
    seedInvitation(db, 'archived-group', { groupId: 'group-archived' });
    seedInvitation(db, 'missing-group', { groupId: 'group-gone' });

    const invitations = await service.listMyInvitations({
      userId: 'invitee-uid',
      userEmail: 'Invitee@Example.COM',
    });

    expect(invitations).toEqual([
      {
        id: 'ok-b',
        groupId: 'group-b',
        groupName: 'group-b',
        invitedBy: 'owner-a',
        invitedByName: null,
        role: 'viewer',
        createdAt: '2026-11-05T12:00:00.000Z',
        expiresAt: expect.any(String),
      },
      {
        id: 'ok',
        groupId: 'group-a',
        // The group's current name wins over the one saved at invite time.
        groupName: 'group-a',
        invitedBy: 'owner-a',
        invitedByName: 'Olive',
        role: 'member',
        createdAt: '2026-11-01T12:00:00.000Z',
        expiresAt: expect.any(String),
      },
    ]);
    for (const invitation of invitations) {
      expect(invitation).not.toHaveProperty('token');
      expect(Number.isNaN(Date.parse(String(invitation.expiresAt)))).toBe(false);
    }
  });

  it('leaves out groups the caller already belongs to', async () => {
    const { db, service } = setup();
    seedInvitation(db, 'ok', {});
    member(db, 'group-a', 'invitee-uid', 'member');

    await expect(
      service.listMyInvitations({ userId: 'invitee-uid', userEmail: 'invitee@example.com' }),
    ).resolves.toEqual([]);
  });

  it('returns nothing for a caller without an email', async () => {
    const { db, service } = setup();
    seedInvitation(db, 'blank', { invitedEmail: '' });

    await expect(
      service.listMyInvitations({ userId: 'invitee-uid', userEmail: '' }),
    ).resolves.toEqual([]);
    await expect(
      service.listMyInvitations({ userId: 'invitee-uid', userEmail: undefined }),
    ).resolves.toEqual([]);
  });

  it('can then be accepted by id even if the invitation has no expiry', async () => {
    const { db, service } = setup();
    seedInvitation(db, 'no-expiry', { expiresAt: undefined });

    const [listed] = await service.listMyInvitations({
      userId: 'invitee-uid',
      userEmail: 'invitee@example.com',
    });
    expect(listed).toMatchObject({ id: 'no-expiry', expiresAt: null });

    await expect(
      service.acceptInvitation({
        token: '',
        invitationId: 'no-expiry',
        userId: 'invitee-uid',
        userEmail: 'invitee@example.com',
      }),
    ).resolves.toMatchObject({ groupId: 'group-a', role: 'member' });
  });
});
