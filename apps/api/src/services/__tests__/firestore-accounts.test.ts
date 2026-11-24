import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreAccountService } from '../firestore-accounts';
import { DEFAULT_ROLE_PERMISSIONS } from '../group-permissions';

function setup(options: { deleteFiles?: (query: { prefix: string }) => Promise<void> } = {}) {
  const db = new FakeFirestore();
  db.seed('users/user-1', { email: 'user-1@example.com' });
  db.seed('expenses/e1', { userId: 'user-1' });
  db.seed('expenses/e2', { userId: 'someone-else' });
  const auth = { deleteUser: vi.fn(async () => undefined) };
  const deleteFiles = vi.fn(options.deleteFiles ?? (async () => undefined));
  const storage = { bucket: () => ({ deleteFiles }) };
  const service = createFirestoreAccountService(db as never, auth as never, storage as never);
  return { db, auth, deleteFiles, service };
}

describe('account deletion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes the user’s receipt and avatar files', async () => {
    const { db, auth, deleteFiles, service } = setup();

    await expect(service.deleteAccount({ userId: 'user-1' })).resolves.toMatchObject({
      success: true,
    });

    expect(deleteFiles.mock.calls.map(([query]) => query.prefix).sort()).toEqual([
      'avatars/user-1/',
      'receipts/user-1/',
    ]);
    expect(db.read('users/user-1')).toBeUndefined();
    expect(db.read('expenses/e1')).toBeUndefined();
    expect(db.read('expenses/e2')).toBeDefined();
    expect(auth.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('still succeeds, and logs, when storage cleanup fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { auth, service } = setup({
      deleteFiles: async () => {
        throw new Error('bucket unavailable');
      },
    });

    await expect(service.deleteAccount({ userId: 'user-1' })).resolves.toMatchObject({
      success: true,
    });
    expect(log).toHaveBeenCalledTimes(2);
    expect(auth.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('works without a storage bucket configured', async () => {
    const db = new FakeFirestore();
    const auth = { deleteUser: vi.fn(async () => undefined) };
    const service = createFirestoreAccountService(db as never, auth as never);

    await expect(service.deleteAccount({ userId: 'user-1' })).resolves.toMatchObject({
      success: true,
    });
  });

  it('treats an already-deleted sign-in as success', async () => {
    const { auth, service } = setup();
    auth.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' }),
    );

    await expect(service.deleteAccount({ userId: 'user-1' })).resolves.toMatchObject({
      success: true,
    });
  });

  it('still succeeds, and says so, when the sign-in record cannot be removed', async () => {
    const { auth, service } = setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    auth.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error('auth backend down'), { code: 'auth/internal-error' }),
    );

    await expect(service.deleteAccount({ userId: 'user-1' })).resolves.toMatchObject({
      success: true,
      signInDeleted: false,
    });
    expect(logged).toHaveBeenCalledWith(
      '[AccountService] Could not delete the sign-in record',
      expect.objectContaining({ userId: 'user-1', error: 'auth backend down' }),
    );
    logged.mockRestore();
  });
});

describe('account deletion and groups', () => {
  const t = (iso: string) => Timestamp.fromDate(new Date(iso));

  function seedMember(
    db: FakeFirestore,
    groupId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member' | 'viewer',
    joinedAt: string,
    overrides: Record<string, unknown> = {},
  ) {
    db.seed(`groupMembers/${groupId}_${userId}`, {
      groupId,
      userId,
      userName: userId,
      userEmail: `${userId}@example.com`,
      role,
      status: 'active',
      joinedAt: t(joinedAt),
      permissions: DEFAULT_ROLE_PERMISSIONS[role],
      ...overrides,
    });
  }

  function seedGroup(db: FakeFirestore, groupId: string, createdBy: string, memberCount: number) {
    db.seed(`groups/${groupId}`, {
      name: groupId,
      createdBy,
      status: 'active',
      stats: { memberCount, expenseCount: 0, totalAmount: 0 },
    });
  }

  function service(db: FakeFirestore) {
    const auth = { deleteUser: vi.fn(async () => undefined) };
    return createFirestoreAccountService(db as never, auth as never);
  }

  it('deletes notification settings and preferences', async () => {
    const db = new FakeFirestore();
    db.seed('users/user-1', { email: 'user-1@example.com' });
    db.seed('userNotificationSettings/user-1', { globalMute: true });
    db.seed('userNotificationSettings/user-2', { globalMute: false });
    db.seed('users/user-1/notificationPreferences/default', { group_invitation: { push: true } });

    await service(db).deleteAccount({ userId: 'user-1' });

    expect(db.read('userNotificationSettings/user-1')).toBeUndefined();
    expect(db.read('users/user-1/notificationPreferences/default')).toBeUndefined();
    expect(db.read('userNotificationSettings/user-2')).toBeDefined();
  });

  it('removes plain memberships and lowers each group’s member count', async () => {
    const db = new FakeFirestore();
    seedGroup(db, 'g1', 'owner-1', 3);
    seedMember(db, 'g1', 'owner-1', 'owner', '2025-01-01T00:00:00Z');
    seedMember(db, 'g1', 'user-1', 'member', '2025-02-01T00:00:00Z');
    seedMember(db, 'g1', 'other', 'member', '2025-03-01T00:00:00Z');
    seedGroup(db, 'g2', 'owner-2', 1);
    seedMember(db, 'g2', 'owner-2', 'owner', '2025-01-01T00:00:00Z');
    // A membership the user already left is not counted again.
    seedMember(db, 'g2', 'user-1', 'member', '2025-01-02T00:00:00Z', { status: 'left' });

    await service(db).deleteAccount({ userId: 'user-1' });

    expect(db.read('groupMembers/g1_user-1')).toBeUndefined();
    expect(db.read('groupMembers/g2_user-1')).toBeUndefined();
    expect(db.read('groups/g1')).toMatchObject({ stats: { memberCount: 2 } });
    expect(db.read('groups/g2')).toMatchObject({ stats: { memberCount: 1 } });
    expect(db.read('groupMembers/g1_other')).toMatchObject({ status: 'active', role: 'member' });
  });

  it('hands an owned group to the longest-standing active admin', async () => {
    const db = new FakeFirestore();
    seedGroup(db, 'g1', 'user-1', 4);
    seedMember(db, 'g1', 'user-1', 'owner', '2024-01-01T00:00:00Z');
    seedMember(db, 'g1', 'old-member', 'member', '2024-02-01T00:00:00Z');
    seedMember(db, 'g1', 'newer-admin', 'admin', '2024-06-01T00:00:00Z');
    seedMember(db, 'g1', 'older-admin', 'admin', '2024-03-01T00:00:00Z');
    seedMember(db, 'g1', 'gone-admin', 'admin', '2024-01-15T00:00:00Z', { status: 'left' });

    await service(db).deleteAccount({ userId: 'user-1' });

    expect(db.read('groups/g1')).toMatchObject({
      createdBy: 'older-admin',
      status: 'active',
      stats: { memberCount: 3 },
    });
    expect(db.read('groupMembers/g1_older-admin')).toMatchObject({
      role: 'owner',
      permissions: DEFAULT_ROLE_PERMISSIONS.owner,
    });
    expect(db.read('groupMembers/g1_newer-admin')).toMatchObject({ role: 'admin' });
    expect(db.read('groupMembers/g1_user-1')).toBeUndefined();
    const activities = db
      .paths('groupActivities')
      .map((path) => db.read(path))
      .filter((activity) => activity?.groupId === 'g1');
    expect(activities).toEqual([
      expect.objectContaining({
        userId: 'older-admin',
        action: 'member_role_changed',
        metadata: expect.objectContaining({
          targetUserId: 'older-admin',
          oldRole: 'admin',
          newRole: 'owner',
          reason: 'previous_owner_deleted_account',
        }),
      }),
    ]);
  });

  it('hands an owned group to the longest-standing member when there is no admin', async () => {
    const db = new FakeFirestore();
    seedGroup(db, 'g1', 'user-1', 3);
    seedMember(db, 'g1', 'user-1', 'owner', '2024-01-01T00:00:00Z');
    seedMember(db, 'g1', 'viewer-1', 'viewer', '2024-02-01T00:00:00Z');
    // Legacy membership: no permissions map at all.
    seedMember(db, 'g1', 'member-1', 'member', '2024-04-01T00:00:00Z', { permissions: undefined });

    await service(db).deleteAccount({ userId: 'user-1' });

    expect(db.read('groups/g1')).toMatchObject({ createdBy: 'viewer-1', stats: { memberCount: 2 } });
    expect(db.read('groupMembers/g1_viewer-1')).toMatchObject({
      role: 'owner',
      permissions: DEFAULT_ROLE_PERMISSIONS.owner,
    });
  });

  it('deletes an owned group with no other active member, and its group data', async () => {
    const db = new FakeFirestore();
    seedGroup(db, 'g1', 'user-1', 1);
    seedMember(db, 'g1', 'user-1', 'owner', '2024-01-01T00:00:00Z');
    seedMember(db, 'g1', 'ex-member', 'member', '2024-01-02T00:00:00Z', { status: 'left' });
    db.seed('groupInvitations/i1', { groupId: 'g1', invitedBy: 'ex-member', status: 'pending' });
    db.seed('groupActivities/a1', { groupId: 'g1', userId: 'ex-member', action: 'member_left' });
    db.seed('budgets_group/b1', { groupId: 'g1', category: 'Office expenses' });
    db.seed('income_sources_group/in1', { groupId: 'g1' });
    db.seed('savings_goals_group/s1', { groupId: 'g1' });
    db.seed('expenses/mine', { groupId: 'g1', userId: 'user-1', expenseType: 'group' });
    db.seed('expenses/theirs', { groupId: 'g1', userId: 'ex-member', expenseType: 'group' });
    seedGroup(db, 'g-other', 'someone', 1);
    db.seed('budgets_group/b-other', { groupId: 'g-other' });

    await service(db).deleteAccount({ userId: 'user-1' });

    expect(db.read('groups/g1')).toBeUndefined();
    expect(db.read('groupMembers/g1_ex-member')).toBeUndefined();
    expect(db.read('groupInvitations/i1')).toBeUndefined();
    expect(db.read('groupActivities/a1')).toBeUndefined();
    expect(db.read('budgets_group/b1')).toBeUndefined();
    expect(db.read('income_sources_group/in1')).toBeUndefined();
    expect(db.read('savings_goals_group/s1')).toBeUndefined();
    expect(db.read('expenses/mine')).toBeUndefined();
    // Someone else's expense is kept, as a personal expense.
    expect(db.read('expenses/theirs')).toMatchObject({
      userId: 'ex-member',
      groupId: null,
      expenseType: 'personal',
    });
    expect(db.read('groups/g-other')).toBeDefined();
    expect(db.read('budgets_group/b-other')).toBeDefined();
  });

  it('deletes pending invitations sent to the user’s email', async () => {
    const db = new FakeFirestore();
    db.seed('users/user-1', { email: 'User-1@Example.com' });
    db.seed('groupInvitations/to-me', { invitedEmail: 'user-1@example.com', invitedBy: 'x' });
    db.seed('groupInvitations/to-other', { invitedEmail: 'other@example.com', invitedBy: 'x' });

    await service(db).deleteAccount({ userId: 'user-1' });

    expect(db.read('groupInvitations/to-me')).toBeUndefined();
    expect(db.read('groupInvitations/to-other')).toBeDefined();
  });
});
