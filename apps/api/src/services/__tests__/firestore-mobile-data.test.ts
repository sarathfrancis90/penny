import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreMobileDataService } from '../firestore-mobile-data';
import { DEFAULT_ROLE_PERMISSIONS } from '../group-permissions';

function member(
  db: FakeFirestore,
  groupId: string,
  userId: string,
  role: keyof typeof DEFAULT_ROLE_PERMISSIONS,
  overrides: Record<string, unknown> = {},
) {
  db.seed(`groupMembers/${groupId}_${userId}`, {
    groupId,
    userId,
    role,
    status: 'active',
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
    ...overrides,
  });
}

function setup() {
  const db = new FakeFirestore();
  member(db, 'group-a', 'admin-a', 'admin');
  member(db, 'group-a', 'member-a', 'member');
  member(db, 'group-a', 'viewer-a', 'viewer');
  member(db, 'group-b', 'owner-b', 'owner');
  const auth = { updateUser: vi.fn(async () => undefined) };
  const service = createFirestoreMobileDataService(db as never, auth as never);
  return { db, service, auth };
}

describe('income and savings updates cannot reassign ownership', () => {
  it('ignores groupId and audit fields when a group admin patches a record', async () => {
    const { db, service } = setup();
    const createdAt = Timestamp.fromDate(new Date('2026-01-01T12:00:00Z'));
    db.seed('income_sources_group/income-1', {
      groupId: 'group-a',
      addedBy: 'member-a',
      createdBy: 'member-a',
      createdAt,
      name: 'Retainer',
      amount: 100,
    });

    const result = await service.updateIncome({
      userId: 'admin-a',
      scope: 'group',
      id: 'income-1',
      data: {
        groupId: 'group-b',
        'groupId.nested': 'group-b',
        userId: 'owner-b',
        id: 'other',
        addedBy: 'admin-a',
        createdBy: 'admin-a',
        createdAt: 'yesterday',
        name: 'Retainer (updated)',
        amount: 250,
        category: 'consulting',
        frequency: 'monthly',
        isRecurring: true,
        taxable: true,
      },
    });

    const stored = db.read('income_sources_group/income-1');
    expect(stored).toMatchObject({
      groupId: 'group-a',
      addedBy: 'member-a',
      createdBy: 'member-a',
      name: 'Retainer (updated)',
      amount: 250,
      category: 'consulting',
      frequency: 'monthly',
      isRecurring: true,
      taxable: true,
    });
    expect(stored?.createdAt).toEqual(createdAt);
    expect(stored).not.toHaveProperty('userId');
    expect(stored).not.toHaveProperty('id');
    expect(result.incomeSource.groupId).toBe('group-a');
  });

  it('ignores userId when a personal savings goal is patched, and keeps app fields', async () => {
    const { db, service } = setup();
    db.seed('savings_goals_personal/goal-1', {
      userId: 'member-a',
      name: 'Laptop',
      targetAmount: 1000,
      currentAmount: 100,
    });

    await service.updateSavings({
      userId: 'member-a',
      scope: 'personal',
      id: 'goal-1',
      data: {
        userId: 'owner-b',
        groupId: 'group-b',
        name: 'New laptop',
        targetAmount: 2000,
        monthlyContribution: 150,
        priority: 'high',
        progressPercentage: 5,
      },
    });

    const stored = db.read('savings_goals_personal/goal-1');
    expect(stored).toMatchObject({
      userId: 'member-a',
      name: 'New laptop',
      targetAmount: 2000,
      monthlyContribution: 150,
      priority: 'high',
      progressPercentage: 5,
    });
    expect(stored).not.toHaveProperty('groupId');
  });
});

describe('profile updates', () => {
  it('does not let the body set identity, push-token or role fields', async () => {
    const { db, service, auth } = setup();
    db.seed('users/member-a', {
      email: 'member-a@example.com',
      fcmTokens: { phone: { token: 'real-token' } },
    });

    await service.updateUserProfile({
      userId: 'member-a',
      data: {
        email: 'victim@example.com',
        emailVerified: true,
        uid: 'owner-b',
        fcmTokens: { phone: { token: 'attacker-token' } },
        pushTokens: { phone: 'attacker-token' },
        role: 'admin',
        roles: ['admin'],
        isAdmin: true,
        admin: true,
        customClaims: { admin: true },
        createdAt: 'yesterday',
        displayName: 'Member A',
        photoURL: 'https://example.com/a.jpg',
        photoPath: 'avatars/member-a/a.jpg',
        currency: 'CAD',
      },
    });

    expect(db.read('users/member-a')).toEqual({
      email: 'member-a@example.com',
      fcmTokens: { phone: { token: 'real-token' } },
      displayName: 'Member A',
      photoURL: 'https://example.com/a.jpg',
      photoPath: 'avatars/member-a/a.jpg',
      currency: 'CAD',
      updatedAt: expect.any(Timestamp),
    });
    expect(auth.updateUser).toHaveBeenCalledWith('member-a', {
      displayName: 'Member A',
      photoURL: 'https://example.com/a.jpg',
    });
  });

  it('still clears the avatar the way the app does', async () => {
    const { db, service, auth } = setup();
    db.seed('users/member-a', { photoURL: 'x', photoPath: 'avatars/member-a/a.jpg' });

    await service.updateUserProfile({
      userId: 'member-a',
      data: { photoURL: null, photoPath: null },
    });

    expect(db.read('users/member-a')).toMatchObject({ photoURL: null, photoPath: null });
    expect(auth.updateUser).toHaveBeenCalledWith('member-a', { photoURL: null });
  });

  it('saves the profile and reports it, logging the code, when the sign-in sync fails', async () => {
    const { db, service, auth } = setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    auth.updateUser.mockRejectedValueOnce(
      Object.assign(
        new Error('Identity Toolkit API has not been used in project 123 before or it is disabled.'),
        { code: 'auth/internal-error' },
      ),
    );

    const result = await service.updateUserProfile({
      userId: 'member-a',
      data: { displayName: 'New Name' },
    });

    expect(result).toMatchObject({
      profile: { id: 'member-a', displayName: 'New Name' },
      authSynced: false,
    });
    expect(db.read('users/member-a')).toMatchObject({ displayName: 'New Name' });
    expect(log).toHaveBeenCalledWith(
      '[MobileDataService] Could not sync the profile to the sign-in record',
      expect.objectContaining({ userId: 'member-a', code: 'auth/internal-error' }),
    );
    log.mockRestore();
  });

  it('reports a successful sign-in sync, and clears instead of sending empty strings', async () => {
    const { service, auth } = setup();

    await expect(
      service.updateUserProfile({ userId: 'member-a', data: { displayName: '', photoURL: '' } }),
    ).resolves.toMatchObject({ authSynced: true });
    // Firebase Auth rejects empty strings; null removes the value.
    expect(auth.updateUser).toHaveBeenCalledWith('member-a', {
      displayName: null,
      photoURL: null,
    });
  });
});

describe('savings contributions', () => {
  function goals(db: FakeFirestore) {
    db.seed('savings_goals_group/goal-g', {
      groupId: 'group-a',
      targetAmount: 1000,
      currentAmount: 100,
    });
    db.seed('savings_goals_personal/goal-p', {
      userId: 'member-a',
      targetAmount: 1000,
      currentAmount: 100,
    });
  }

  it('rejects a viewer contributing to a group goal', async () => {
    const { db, service } = setup();
    goals(db);

    await expect(
      service.contributeSavings({ userId: 'viewer-a', scope: 'group', id: 'goal-g', amount: 50 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.read('savings_goals_group/goal-g')?.currentAmount).toBe(100);
  });

  it('lets a member contribute to a group goal, including a legacy member without permissions', async () => {
    const { db, service } = setup();
    goals(db);

    await service.contributeSavings({ userId: 'member-a', scope: 'group', id: 'goal-g', amount: 50 });
    expect(db.read('savings_goals_group/goal-g')?.currentAmount).toBe(150);

    db.seed('groupMembers/group-a_member-a', {
      groupId: 'group-a',
      userId: 'member-a',
      role: 'member',
      status: 'active',
    });
    await service.contributeSavings({ userId: 'member-a', scope: 'group', id: 'goal-g', amount: 50 });
    expect(db.read('savings_goals_group/goal-g')?.currentAmount).toBe(200);
  });

  it('rejects non-finite, non-positive and absurd amounts', async () => {
    const { db, service } = setup();
    goals(db);

    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 10_000_000.01]) {
      await expect(
        service.contributeSavings({ userId: 'member-a', scope: 'personal', id: 'goal-p', amount }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(db.read('savings_goals_personal/goal-p')?.currentAmount).toBe(100);

    await service.contributeSavings({
      userId: 'member-a',
      scope: 'personal',
      id: 'goal-p',
      amount: 10_000_000,
    });
    expect(db.read('savings_goals_personal/goal-p')?.currentAmount).toBe(10_000_100);
  });
});

describe('declining invitations', () => {
  function invitation(db: FakeFirestore, overrides: Record<string, unknown> = {}) {
    db.seed('groupInvitations/invite-1', {
      groupId: 'group-a',
      invitedEmail: 'invitee@example.com',
      status: 'pending',
      ...overrides,
    });
  }

  it('rejects a caller who is not the invitee', async () => {
    const { db, service } = setup();
    invitation(db);

    await expect(
      service.declineInvitation({ userId: 'stranger', userEmail: 'stranger@example.com', id: 'invite-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.declineInvitation({ userId: 'stranger', id: 'invite-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.read('groupInvitations/invite-1')?.status).toBe('pending');
  });

  it('lets the invitee decline, matching the email case-insensitively', async () => {
    const { db, service } = setup();
    invitation(db, { invitedEmail: 'Invitee@Example.com' });

    await expect(
      service.declineInvitation({ userId: 'invitee', userEmail: 'invitee@example.COM', id: 'invite-1' }),
    ).resolves.toEqual({ success: true });
    expect(db.read('groupInvitations/invite-1')).toMatchObject({
      status: 'rejected',
      respondedBy: 'invitee',
    });
  });

  it('does not overwrite an invitation that is no longer pending', async () => {
    const { db, service } = setup();
    invitation(db, { status: 'accepted' });

    await expect(
      service.declineInvitation({ userId: 'invitee', userEmail: 'invitee@example.com', id: 'invite-1' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.read('groupInvitations/invite-1')?.status).toBe('accepted');

    // Declining twice (a double tap) stays a success.
    invitation(db, { status: 'rejected', respondedBy: 'invitee' });
    await expect(
      service.declineInvitation({ userId: 'invitee', userEmail: 'invitee@example.com', id: 'invite-1' }),
    ).resolves.toEqual({ success: true });
  });
});

describe('listing expenses', () => {
  it('ignores approvalStatus without a groupId, which would need a missing index', async () => {
    const { db, service } = setup();
    db.seed('expenses/e1', {
      userId: 'member-a',
      expenseType: 'personal',
      date: Timestamp.fromDate(new Date('2026-06-01T12:00:00Z')),
    });

    const result = await service.listExpenses({
      userId: 'member-a',
      scope: 'personal',
      approvalStatus: 'pending',
    });

    expect(result.expenses).toHaveLength(1);
    expect(db.queries.at(-1)?.filters).not.toContain('groupMetadata.approvalStatus');
  });

  it('still filters by approvalStatus within a group', async () => {
    const { db, service } = setup();
    const date = Timestamp.fromDate(new Date('2026-06-01T12:00:00Z'));
    db.seed('expenses/pending', {
      userId: 'member-a',
      groupId: 'group-a',
      date,
      groupMetadata: { approvalStatus: 'pending' },
    });
    db.seed('expenses/approved', {
      userId: 'member-a',
      groupId: 'group-a',
      date,
      groupMetadata: { approvalStatus: 'approved' },
    });

    const result = await service.listExpenses({
      userId: 'member-a',
      scope: 'group',
      groupId: 'group-a',
      approvalStatus: 'pending',
    });

    expect(result.expenses.map((expense) => expense.id)).toEqual(['pending']);
  });
});

describe('duplicate check dates', () => {
  it('rejects impossible dates instead of rolling them over', async () => {
    const { service } = setup();
    for (const date of ['2025-02-31', '2025-13-01', '2025-00-10', 'not-a-date']) {
      await expect(
        service.duplicateExpense({ userId: 'member-a', vendor: 'Cafe', amount: 5, date }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('finds a same-day duplicate for a valid date', async () => {
    const { db, service } = setup();
    db.seed('expenses/e1', {
      userId: 'member-a',
      vendor: 'Cafe',
      amount: 5,
      date: Timestamp.fromDate(new Date(2026, 5, 8, 12, 0, 0)),
    });

    const result = await service.duplicateExpense({
      userId: 'member-a',
      vendor: 'Cafe',
      amount: 5,
      date: '2026-06-08',
    });
    expect(result.duplicate).toMatchObject({ id: 'e1' });
  });
});

describe('notifications', () => {
  it('marks more than 500 notifications read in batches under the limit', async () => {
    const { db, service } = setup();
    for (let index = 0; index < 1100; index += 1) {
      db.seed(`notifications/n-${index}`, { userId: 'member-a', read: false });
    }
    db.seed('notifications/other', { userId: 'owner-b', read: false });

    await expect(
      service.markAllNotificationsRead({ userId: 'member-a' }),
    ).resolves.toEqual({ success: true });

    expect(db.batchSizes).toEqual([450, 450, 200]);
    expect(db.read('notifications/n-1099')?.read).toBe(true);
    expect(db.read('notifications/other')?.read).toBe(false);
  });
});

describe('push tokens', () => {
  it('records the verified email so the user can be found for invitations', async () => {
    const { db, service } = setup();

    await service.upsertPushToken({
      userId: 'new-user',
      deviceId: 'device-1',
      token: 'tok',
      platform: 'ios',
      email: 'New.User@Example.com',
    });
    expect(db.read('users/new-user')).toMatchObject({
      email: 'new.user@example.com',
      fcmTokens: { 'device-1': { token: 'tok', platform: 'ios' } },
    });

    await service.upsertPushToken({ userId: 'no-email', deviceId: 'd', token: 't', platform: 'ios' });
    expect(db.read('users/no-email')).not.toHaveProperty('email');
  });

  it('treats removing a token for a user with no document as a success', async () => {
    const { db, service } = setup();

    await expect(
      service.deletePushToken({ userId: 'no-such-user', deviceId: 'device-1' }),
    ).resolves.toEqual({ success: true });
    expect(db.read('users/no-such-user')).toBeUndefined();
  });

  it('removes only the given device token', async () => {
    const { db, service } = setup();
    db.seed('users/member-a', {
      fcmTokens: { 'device-1': { token: 'a' }, 'device-2': { token: 'b' } },
    });

    await service.deletePushToken({ userId: 'member-a', deviceId: 'device-1' });
    expect(db.read('users/member-a')?.fcmTokens).toEqual({ 'device-2': { token: 'b' } });
  });

  it('still surfaces unexpected Firestore failures', async () => {
    const { db, service } = setup();
    db.seed('users/member-a', {});
    vi.spyOn(db, 'applyUpdate').mockImplementation(() => {
      throw Object.assign(new Error('unavailable'), { code: 14 });
    });

    await expect(
      service.deletePushToken({ userId: 'member-a', deviceId: 'device-1' }),
    ).rejects.toThrow('unavailable');
  });
});

describe('approving and rejecting group expenses', () => {
  function legacyMember(db: FakeFirestore, userId: string, role: string) {
    // Older membership documents have no permissions map.
    db.seed(`groupMembers/group-a_${userId}`, {
      groupId: 'group-a',
      userId,
      role,
      status: 'active',
    });
  }

  function pendingExpense(db: FakeFirestore) {
    db.seed('expenses/exp-1', {
      groupId: 'group-a',
      userId: 'member-a',
      groupMetadata: { approvalStatus: 'pending' },
    });
  }

  it('lets a legacy admin without a permissions map approve and reject', async () => {
    const { db, service } = setup();
    legacyMember(db, 'legacy-admin', 'admin');
    pendingExpense(db);

    await expect(
      service.approveExpense({ userId: 'legacy-admin', id: 'exp-1' }),
    ).resolves.toEqual({ success: true });
    expect(db.read('expenses/exp-1')).toMatchObject({
      groupMetadata: { approvalStatus: 'approved', approvedBy: 'legacy-admin' },
    });

    await expect(
      service.rejectExpense({ userId: 'legacy-admin', id: 'exp-1', reason: 'dup' }),
    ).resolves.toEqual({ success: true });
    expect(db.read('expenses/exp-1')).toMatchObject({
      groupMetadata: { approvalStatus: 'rejected' },
    });
  });

  it('still refuses a legacy member, whose role cannot approve', async () => {
    const { db, service } = setup();
    legacyMember(db, 'legacy-member', 'member');
    pendingExpense(db);

    await expect(
      service.approveExpense({ userId: 'legacy-member', id: 'exp-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.rejectExpense({ userId: 'legacy-member', id: 'exp-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.read('expenses/exp-1')).toMatchObject({
      groupMetadata: { approvalStatus: 'pending' },
    });
  });

  it('honours an explicit permissions map that turns approval off', async () => {
    const { db, service } = setup();
    db.seed('groupMembers/group-a_admin-a', {
      groupId: 'group-a',
      userId: 'admin-a',
      role: 'admin',
      status: 'active',
      permissions: { ...DEFAULT_ROLE_PERMISSIONS.admin, canApproveExpenses: false },
    });
    pendingExpense(db);

    await expect(
      service.approveExpense({ userId: 'admin-a', id: 'exp-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('creating income and savings records', () => {
  it('keeps only known income fields and sets the owner and timestamps itself', async () => {
    const { db, service } = setup();

    const { id } = await service.createIncome({
      userId: 'member-a',
      scope: 'personal',
      data: {
        name: 'Retainer',
        category: 'consulting',
        amount: 1200,
        frequency: 'monthly',
        isRecurring: true,
        taxable: true,
        description: 'Client A',
        currency: 'CAD',
        startDate: '2026-01-01T12:00:00.000Z',
        endDate: null,
        // Not the caller's to set:
        createdAt: 'yesterday',
        updatedAt: 'yesterday',
        groupId: 'group-b',
        addedBy: 'owner-b',
        isAdmin: true,
        __proto__polluted: { x: 1 },
      },
    });

    const stored = db.read(`income_sources_personal/${id}`) ?? {};
    expect(stored).toMatchObject({
      userId: 'member-a',
      name: 'Retainer',
      category: 'consulting',
      amount: 1200,
      frequency: 'monthly',
      isRecurring: true,
      taxable: true,
      description: 'Client A',
      currency: 'CAD',
      isActive: true,
    });
    expect(stored.createdAt).toBeInstanceOf(Timestamp);
    expect(stored.updatedAt).toBeInstanceOf(Timestamp);
    for (const key of ['groupId', 'addedBy', 'isAdmin', '__proto__polluted']) {
      expect(stored).not.toHaveProperty(key);
    }
  });

  it('starts a new savings goal at zero, whatever the body says', async () => {
    const { db, service } = setup();

    const { id } = await service.createSavings({
      userId: 'admin-a',
      scope: 'group',
      groupId: 'group-a',
      data: {
        name: 'Laptop fund',
        category: 'equipment',
        targetAmount: 3000,
        monthlyContribution: 250,
        priority: 'high',
        targetDate: '2026-12-31',
        contributionType: 'manual',
        currency: 'CAD',
        // Server-owned progress and audit fields:
        currentAmount: 999_999,
        progressPercentage: 100,
        status: 'achieved',
        lastContributionAt: 'now',
        createdBy: 'owner-b',
        userId: 'owner-b',
      },
    });

    const stored = db.read(`savings_goals_group/${id}`) ?? {};
    expect(stored).toMatchObject({
      groupId: 'group-a',
      createdBy: 'admin-a',
      addedBy: 'admin-a',
      name: 'Laptop fund',
      targetAmount: 3000,
      monthlyContribution: 250,
      priority: 'high',
      contributionType: 'manual',
      currentAmount: 0,
      progressPercentage: 0,
      status: 'active',
    });
    expect(stored).not.toHaveProperty('userId');
    expect(stored).not.toHaveProperty('lastContributionAt');
  });
});

describe('preference endpoints only store known keys', () => {
  it('strips unknown keys from notification settings, preferences and user preferences', async () => {
    const { db, service } = setup();

    await service.updateNotificationSettings({
      userId: 'member-a',
      data: { globalMute: true, quietHoursStart: '23:00', isAdmin: true },
    });
    await service.updateNotificationPreferences({
      userId: 'member-a',
      data: { group_invitation: { push: false }, injected: { push: true } },
    });
    await service.updateUserPreferences({
      userId: 'member-a',
      data: { currency: 'USD', defaultGroupId: 'group-b', admin: true },
    });

    expect(db.read('userNotificationSettings/member-a')).toEqual({
      globalMute: true,
      quietHoursStart: '23:00',
      updatedAt: expect.any(Timestamp),
    });
    const preferences = db.read('users/member-a/notificationPreferences/default') ?? {};
    expect(preferences).toMatchObject({ group_invitation: { push: false } });
    expect(preferences).not.toHaveProperty('injected');
    expect(db.read('users/member-a')?.preferences).toEqual({ currency: 'USD' });
  });

  it('rejects a malformed quiet-hours time with 400 and writes nothing', async () => {
    const { db, service } = setup();
    await expect(
      service.updateNotificationSettings({
        userId: 'member-a',
        data: { quietHoursStart: 'late' },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(db.read('userNotificationSettings/member-a')).toBeUndefined();
  });
});
