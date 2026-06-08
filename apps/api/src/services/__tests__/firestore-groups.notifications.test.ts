import { describe, expect, it, vi } from 'vitest';

import { createFirestoreGroupService } from '../firestore-groups';
import type { NotificationService } from '../notifications';

interface GroupFirestoreOptions {
  requesterRole?: string;
  requesterPermissions?: Record<string, boolean>;
}

function snapshot(data: Record<string, unknown> | null, ref?: unknown) {
  return {
    exists: data !== null,
    data: () => data ?? undefined,
    ref,
  };
}

function firestore(options: GroupFirestoreOptions = {}) {
  const update = vi.fn(async () => undefined);
  const set = vi.fn(async () => undefined);
  const requesterData = {
    groupId: 'group-1',
    userId: 'owner-1',
    userEmail: 'owner@example.com',
    userName: 'Owner',
    role: options.requesterRole ?? 'owner',
    status: 'active',
    permissions: {
      canInviteMembers: true,
      canRemoveMembers: true,
      canManageSettings: true,
      ...(options.requesterPermissions ?? {}),
    },
  };
  const targetRef = { update };
  const groupRef = {
    id: 'group-1',
    update,
    get: async () => snapshot({
      name: 'Studio',
      icon: 'S',
      settings: {
        requireApproval: false,
        allowMemberInvites: true,
        currency: 'CAD',
      },
    }, groupRef),
  };
  const refs = new Map<string, unknown>([
    ['groups/group-1', groupRef],
    [
      'groupMembers/group-1_owner-1',
      {
        id: 'group-1_owner-1',
        get: async () => snapshot(requesterData),
      },
    ],
    [
      'groupMembers/group-1_member-1',
      {
        id: 'group-1_member-1',
        get: async () => snapshot({
          groupId: 'group-1',
          userId: 'member-1',
          userEmail: 'member@example.com',
          userName: 'Member',
          role: 'member',
          status: 'active',
        }, targetRef),
      },
    ],
    [
      'groupMembers/member-1',
      {
        id: 'member-1',
        get: async () => snapshot(null),
      },
    ],
  ]);

  const db = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id?: string) => {
        const docId = id ?? `${name}-generated`;
        const path = `${name}/${docId}`;
        const existing = refs.get(path);
        if (existing) return existing;
        return {
          id: docId,
          set,
          update,
          get: async () => snapshot(null),
        };
      }),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
      })),
    })),
  };
  return { db, set, update };
}

function notifications(): NotificationService {
  return {
    notifyGroupMembers: vi.fn(async () => undefined),
    notifyUsers: vi.fn(async () => undefined),
  };
}

describe('firestore group notifications', () => {
  it('rejects group updates from active non-admin members', async () => {
    const { db } = firestore({
      requesterRole: 'member',
      requesterPermissions: { canManageSettings: false },
    });
    const service = createFirestoreGroupService(db as never, notifications());

    await expect(
      service.updateGroup({
        groupId: 'group-1',
        userId: 'owner-1',
        updates: { name: 'New Studio' },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('notifies group members after an owner updates group settings', async () => {
    const { db } = firestore();
    const notificationService = notifications();
    const service = createFirestoreGroupService(db as never, notificationService);

    await service.updateGroup({
      groupId: 'group-1',
      userId: 'owner-1',
      updates: {
        name: 'New Studio',
        settings: { requireApproval: true },
      },
    });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'owner-1',
        type: 'group_settings_changed',
        title: 'Group updated',
        relatedId: 'group-1',
        relatedType: 'group',
        metadata: expect.objectContaining({
          changes: ['name', 'settings'],
        }),
      }),
    );
  });

  it('notifies group members after a role change', async () => {
    const { db } = firestore();
    const notificationService = notifications();
    const service = createFirestoreGroupService(db as never, notificationService);

    await service.updateMemberRole({
      groupId: 'group-1',
      requesterUserId: 'owner-1',
      memberId: 'member-1',
      newRole: 'admin',
    });

    expect(notificationService.notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        actorUserId: 'owner-1',
        type: 'group_role_changed',
        title: 'Member role updated',
        relatedId: 'member-1',
        relatedType: 'member',
        metadata: expect.objectContaining({
          targetUserId: 'member-1',
          oldRole: 'member',
          newRole: 'admin',
        }),
      }),
    );
  });
});
