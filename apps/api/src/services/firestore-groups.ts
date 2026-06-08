import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

import type { CreateGroupInput, GroupRole, GroupService } from './groups';
import {
  createNoopNotificationService,
  type NotificationService,
} from './notifications';

const DEFAULT_ROLE_PERMISSIONS = {
  owner: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: true,
  },
  admin: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: false,
  },
  member: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
  viewer: {
    canAddExpenses: false,
    canEditOwnExpenses: false,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
};

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function gone(message: string) {
  return Object.assign(new Error(message), { statusCode: 410 });
}

function isRole(value: unknown): value is GroupRole {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer';
}

export function createFirestoreGroupService(
  db: Firestore,
  notifications: NotificationService = createNoopNotificationService(),
): GroupService {
  async function getActiveMembership(groupId: string, userId: string) {
    const doc = await db.collection('groupMembers').doc(`${groupId}_${userId}`).get();
    if (!doc.exists || doc.data()?.status !== 'active') {
      throw forbidden('Not a member of this group');
    }
    return doc;
  }

  async function getMemberDoc(groupId: string, memberIdOrUserId: string) {
    const direct = await db.collection('groupMembers').doc(memberIdOrUserId).get();
    if (direct.exists) return direct;

    const byUserId = await db
      .collection('groupMembers')
      .doc(`${groupId}_${memberIdOrUserId}`)
      .get();
    if (byUserId.exists) return byUserId;

    throw notFound('Member not found');
  }

  async function decrementMemberCount(groupId: string) {
    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    const currentMemberCount = groupDoc.data()?.stats?.memberCount ?? 0;
    await groupRef.update({
      'stats.memberCount': Math.max(0, Number(currentMemberCount) - 1),
      'stats.lastActivityAt': Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  return {
    async createGroup(input: CreateGroupInput) {
      const now = Timestamp.now();
      const groupRef = db.collection('groups').doc();
      const groupId = groupRef.id;
      const membershipId = `${groupId}_${input.userId}`;

      const groupData = {
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        color: input.color ?? '#8B5CF6',
        icon: input.icon ?? '👥',
        createdBy: input.userId,
        createdAt: now,
        updatedAt: now,
        settings: {
          budgetPeriod: 'monthly',
          requireApproval: false,
          allowMemberInvites: true,
          currency: 'CAD',
          ...input.settings,
        },
        status: 'active',
        stats: {
          memberCount: 1,
          expenseCount: 0,
          totalAmount: 0,
          lastActivityAt: now,
        },
      };

      const batch = db.batch();
      batch.set(groupRef, groupData);
      batch.set(db.collection('groupMembers').doc(membershipId), {
        groupId,
        userId: input.userId,
        userEmail: input.userEmail ?? '',
        userName: input.userName ?? '',
        role: 'owner',
        status: 'active',
        invitedAt: now,
        invitedBy: input.userId,
        joinedAt: now,
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
        lastActivityAt: now,
      });
      batch.set(db.collection('groupActivities').doc(), {
        groupId,
        userId: input.userId,
        userName: input.userName ?? 'User',
        action: 'group_created',
        details: `Created group "${input.name.trim()}"`,
        metadata: { groupName: input.name.trim() },
        createdAt: now,
      });
      await batch.commit();

      return {
        groupId,
        group: {
          ...groupData,
          id: groupId,
          myRole: 'owner',
          myPermissions: DEFAULT_ROLE_PERMISSIONS.owner,
        },
      };
    },

    async listGroups(input) {
      const memberships = await db
        .collection('groupMembers')
        .where('userId', '==', input.userId)
        .where('status', '==', 'active')
        .get();
      return Promise.all(
        memberships.docs.map(async (memberDoc) => {
          const member = memberDoc.data();
          const groupDoc = await db.collection('groups').doc(member.groupId).get();
          return {
            ...(groupDoc.data() ?? {}),
            id: groupDoc.id,
            myRole: member.role,
            myPermissions: member.permissions,
          };
        }),
      );
    },

    async updateGroup(input) {
      const membership = await getActiveMembership(input.groupId, input.userId);
      const membershipData = membership.data() ?? {};
      const isOwner = membershipData.role === 'owner';
      const isAdmin = membershipData.role === 'admin' || isOwner;
      if (!isAdmin) {
        throw forbidden('Only owners and admins can update group details');
      }

      const now = Timestamp.now();
      const groupRef = db.collection('groups').doc(input.groupId);
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) throw notFound('Group not found');
      const currentGroup = groupDoc.data() ?? {};
      const updateData: Record<string, unknown> = { updatedAt: now };
      const changes: string[] = [];

      if (input.updates.name !== undefined) {
        if (
          typeof input.updates.name !== 'string' ||
          input.updates.name.trim().length < 2 ||
          input.updates.name.trim().length > 100
        ) {
          throw badRequest('Name must be between 2 and 100 characters');
        }
        updateData.name = input.updates.name.trim();
        changes.push('name');
      }
      if (input.updates.description !== undefined) {
        updateData.description =
          typeof input.updates.description === 'string'
            ? input.updates.description.trim()
            : '';
        changes.push('description');
      }
      if (input.updates.color !== undefined) {
        updateData.color = input.updates.color;
        changes.push('color');
      }
      if (input.updates.icon !== undefined) {
        updateData.icon = input.updates.icon;
        changes.push('icon');
      }
      if (input.updates.settings !== undefined) {
        if (!membershipData.permissions?.canManageSettings) {
          throw forbidden('No permission to update group settings');
        }
        if (
          !input.updates.settings ||
          typeof input.updates.settings !== 'object' ||
          Array.isArray(input.updates.settings)
        ) {
          throw badRequest('settings must be an object');
        }
        const cleanedSettings = Object.fromEntries(
          Object.entries(input.updates.settings as Record<string, unknown>)
            .filter(([, value]) => value !== undefined),
        );
        updateData.settings = {
          ...(currentGroup.settings ?? {}),
          ...cleanedSettings,
        };
        changes.push('settings');
      }

      if (changes.length === 0) {
        throw badRequest('No valid group updates provided');
      }

      await groupRef.update(updateData);
      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.userId,
        userName:
          membershipData.userName ?? membershipData.userEmail ?? 'Admin',
        action: 'group_updated',
        details: 'Updated group details',
        metadata: { changes },
        createdAt: now,
      });

      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.userId,
        type: 'group_settings_changed',
        title: 'Group updated',
        bodyTemplate: '{actor} updated {group}',
        category: 'group',
        priority: 'low',
        icon: 'settings',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: input.groupId,
        relatedType: 'group',
        metadata: { changes },
      });

      const updated = await groupRef.get();
      return { ...(updated.data() ?? {}), id: updated.id };
    },

    async deleteGroup(input) {
      const now = Timestamp.now();
      const membership = await db
        .collection('groupMembers')
        .doc(`${input.groupId}_${input.userId}`)
        .get();

      if (!membership.exists) {
        throw forbidden('Not a member of this group');
      }

      const membershipData = membership.data();
      if (membershipData?.role !== 'owner') {
        throw forbidden('Only owners can delete groups');
      }

      await db.collection('groups').doc(input.groupId).update({
        status: 'deleted',
        updatedAt: now,
        deletedAt: now,
        deletedBy: input.userId,
      });

      const members = await db
        .collection('groupMembers')
        .where('groupId', '==', input.groupId)
        .get();
      const memberBatch = db.batch();
      for (const doc of members.docs) {
        memberBatch.update(doc.ref, {
          status: 'removed',
          leftAt: now,
          lastActivityAt: now,
        });
      }
      if (!members.empty) await memberBatch.commit();

      const expenses = await db
        .collection('expenses')
        .where('groupId', '==', input.groupId)
        .get();
      const expenseBatch = db.batch();
      for (const doc of expenses.docs) {
        expenseBatch.update(doc.ref, {
          groupId: null,
          expenseType: 'personal',
          updatedAt: now,
        });
      }
      if (!expenses.empty) await expenseBatch.commit();

      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.userId,
        userName:
          membershipData.userName ?? membershipData.userEmail ?? 'Unknown User',
        action: 'group_deleted',
        details: `Group deleted by ${
          membershipData.userName ?? membershipData.userEmail ?? 'Unknown User'
        }`,
        createdAt: now,
      });

      const recipients = members.docs
        .map((doc) => doc.data().userId)
        .filter((userId): userId is string => (
          typeof userId === 'string' && userId !== input.userId
        ));
      await notifications.notifyUsers({
        userIds: recipients,
        type: 'group_settings_changed',
        title: 'Group deleted',
        body: `${membershipData.userName ?? membershipData.userEmail ?? 'Someone'} deleted the group`,
        category: 'group',
        priority: 'high',
        icon: 'delete',
        relatedId: input.groupId,
        relatedType: 'group',
        groupId: input.groupId,
        actorId: input.userId,
        actorName:
          membershipData.userName ?? membershipData.userEmail ?? 'Someone',
      });
    },

    async listMembers(input) {
      await getActiveMembership(input.groupId, input.userId);
      const members = await db
        .collection('groupMembers')
        .where('groupId', '==', input.groupId)
        .where('status', 'in', ['active', 'invited'])
        .get();

      return members.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },

    async inviteMember(input) {
      const now = Timestamp.now();
      const email = input.email.trim().toLowerCase();
      if (!email) throw badRequest('email is required');
      if (!['admin', 'member', 'viewer'].includes(input.role)) {
        throw badRequest('Invalid role. Must be admin, member, or viewer');
      }

      const inviter = await getActiveMembership(input.groupId, input.userId);
      const inviterData = inviter.data() ?? {};
      if (!inviterData.permissions?.canInviteMembers) {
        throw forbidden('No permission to invite members');
      }

      const groupDoc = await db.collection('groups').doc(input.groupId).get();
      const groupData = groupDoc.data();
      if (!groupDoc.exists || !groupData) throw notFound('Group not found');
      if (!groupData.settings?.allowMemberInvites && inviterData.role !== 'owner') {
        throw forbidden('Member invitations are disabled for this group');
      }

      const existingMembers = await db
        .collection('groupMembers')
        .where('groupId', '==', input.groupId)
        .where('userEmail', '==', email)
        .get();
      const existing = existingMembers.docs[0]?.data();
      if (existing?.status === 'active') throw badRequest('User is already a member');
      if (existing?.status === 'invited') throw badRequest('User is already invited');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const token = randomBytes(32).toString('hex');
      const invitation = {
        groupId: input.groupId,
        groupName: groupData.name,
        invitedEmail: email,
        invitedBy: input.userId,
        invitedByName: inviterData.userName ?? 'A team member',
        role: input.role,
        status: 'pending',
        token,
        expiresAt: Timestamp.fromDate(expiresAt),
        createdAt: now,
        metadata: { emailSent: false },
      };

      const invitationRef = await db.collection('groupInvitations').add(invitation);
      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.userId,
        userName: inviterData.userName ?? 'User',
        action: 'member_invited',
        details: `Invited ${email} as ${input.role}`,
        metadata: { email, role: input.role, invitationId: invitationRef.id },
        createdAt: now,
      });

      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.userId,
        type: 'group_settings_changed',
        title: 'Member invited',
        bodyTemplate: `{actor} invited ${email} to {group}`,
        category: 'group',
        priority: 'low',
        icon: 'member',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: invitationRef.id,
        relatedType: 'member',
        metadata: { email, role: input.role, invitationId: invitationRef.id },
      });

      const invitedUsers = await db
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      const invitedUserId = invitedUsers.docs[0]?.id;
      if (invitedUserId && invitedUserId !== input.userId) {
        await notifications.notifyUsers({
          userIds: [invitedUserId],
          type: 'group_invitation',
          title: 'Group invitation',
          body: `${inviterData.userName ?? inviterData.userEmail ?? 'Someone'} invited you to join ${groupData.name}`,
          category: 'group',
          priority: 'high',
          icon: 'invite',
          actionUrl: `/groups/${input.groupId}`,
          relatedId: input.groupId,
          relatedType: 'group',
          groupId: input.groupId,
          actorId: input.userId,
          actorName: inviterData.userName ?? inviterData.userEmail ?? 'Someone',
          metadata: {
            groupName: groupData.name,
            groupIcon: groupData.icon,
            invitationId: invitationRef.id,
            role: input.role,
          },
        });
      }

      return { invitationId: invitationRef.id, token };
    },

    async updateMemberRole(input) {
      if (!isRole(input.newRole)) throw badRequest('Invalid role');
      const requester = await getActiveMembership(input.groupId, input.requesterUserId);
      const requesterData = requester.data() ?? {};
      const requesterIsOwner = requesterData.role === 'owner';
      const requesterIsAdmin = requesterData.role === 'admin';
      if (!requesterIsOwner && !requesterIsAdmin) {
        throw forbidden('Only owners and admins can change member roles');
      }

      const target = await getMemberDoc(input.groupId, input.memberId);
      const targetData = target.data() ?? {};
      if (targetData.role === 'owner' && (!requesterIsOwner || input.newRole !== 'owner')) {
        throw badRequest('Cannot demote the owner. Transfer ownership first.');
      }
      if (input.newRole === 'owner' && !requesterIsOwner) {
        throw forbidden('Only owners can promote members to owner');
      }
      if (targetData.role === 'admin' && !requesterIsOwner) {
        throw forbidden('Only owners can modify admin roles');
      }

      await target.ref.update({
        role: input.newRole,
        permissions: DEFAULT_ROLE_PERMISSIONS[input.newRole],
        lastActivityAt: Timestamp.now(),
      });
      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.requesterUserId,
        userName: requesterData.userName ?? requesterData.userEmail ?? 'Admin',
        action: 'member_role_changed',
        details: `Changed ${targetData.userEmail}'s role from ${targetData.role} to ${input.newRole}`,
        metadata: {
          targetUserId: targetData.userId,
          targetEmail: targetData.userEmail,
          oldRole: targetData.role,
          newRole: input.newRole,
        },
        createdAt: Timestamp.now(),
      });

      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.requesterUserId,
        type: 'group_role_changed',
        title: 'Member role updated',
        bodyTemplate: `{actor} changed ${targetData.userEmail ?? 'a member'} from ${targetData.role} to ${input.newRole}`,
        category: 'group',
        priority: 'medium',
        icon: 'role',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: targetData.userId ?? target.id,
        relatedType: 'member',
        metadata: {
          targetUserId: targetData.userId,
          targetEmail: targetData.userEmail,
          oldRole: targetData.role,
          newRole: input.newRole,
        },
      });
    },

    async removeMember(input) {
      const target = await getMemberDoc(input.groupId, input.memberId);
      const targetData = target.data() ?? {};
      const now = Timestamp.now();

      if (input.action === 'leave' && targetData.userId === input.requesterUserId) {
        if (targetData.role === 'owner') {
          throw badRequest('Owners cannot leave the group. Transfer ownership first or delete the group.');
        }
        await target.ref.update({ status: 'left', leftAt: now, lastActivityAt: now });
        await decrementMemberCount(input.groupId);
        await db.collection('groupActivities').doc().set({
          groupId: input.groupId,
          userId: input.requesterUserId,
          userName: targetData.userName ?? targetData.userEmail ?? 'Member',
          action: 'member_left',
          details: `${targetData.userEmail} left the group`,
          metadata: { userId: targetData.userId, email: targetData.userEmail },
          createdAt: now,
        });
        await notifications.notifyGroupMembers({
          groupId: input.groupId,
          actorUserId: input.requesterUserId,
          type: 'group_member_left',
          title: 'Member left',
          bodyTemplate: '{actor} left {group}',
          category: 'group',
          priority: 'low',
          icon: 'member',
          actionUrl: `/groups/${input.groupId}`,
          relatedId: targetData.userId,
          relatedType: 'member',
          metadata: { userId: targetData.userId, email: targetData.userEmail },
        });
        return;
      }

      const requester = await getActiveMembership(input.groupId, input.requesterUserId);
      const requesterData = requester.data() ?? {};
      if (!requesterData.permissions?.canRemoveMembers) {
        throw forbidden('No permission to remove members');
      }
      if (targetData.role === 'owner') throw badRequest('Cannot remove the owner');
      if (targetData.role === 'admin' && requesterData.role !== 'owner') {
        throw forbidden('Only owners can remove admins');
      }

      await target.ref.update({
        status: 'removed',
        removedBy: input.requesterUserId,
        leftAt: now,
        lastActivityAt: now,
      });
      await decrementMemberCount(input.groupId);
      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.requesterUserId,
        userName: requesterData.userName ?? requesterData.userEmail ?? 'Admin',
        action: 'member_removed',
        details: `Removed ${targetData.userEmail} from the group`,
        metadata: {
          removedUserId: targetData.userId,
          removedEmail: targetData.userEmail,
        },
        createdAt: now,
      });

      if (typeof targetData.userId === 'string') {
        await notifications.notifyUsers({
          userIds: [targetData.userId],
          type: 'group_member_left',
          title: 'Removed from group',
          body: `You were removed from the group by ${requesterData.userName ?? requesterData.userEmail ?? 'an admin'}`,
          category: 'group',
          priority: 'medium',
          icon: 'member',
          relatedId: targetData.userId,
          relatedType: 'member',
          groupId: input.groupId,
          actorId: input.requesterUserId,
          actorName: requesterData.userName ?? requesterData.userEmail ?? 'Admin',
          metadata: {
            removedUserId: targetData.userId,
            removedEmail: targetData.userEmail,
          },
        });
      }
      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.requesterUserId,
        type: 'group_member_left',
        title: 'Member removed',
        bodyTemplate: `${targetData.userEmail ?? 'A member'} was removed from {group}`,
        category: 'group',
        priority: 'low',
        icon: 'member',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: targetData.userId,
        relatedType: 'member',
        metadata: {
          removedUserId: targetData.userId,
          removedEmail: targetData.userEmail,
        },
      });
    },

    async acceptInvitation(input) {
      const invitations = await db
        .collection('groupInvitations')
        .where('token', '==', input.token)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (invitations.empty) throw notFound('Invalid or expired invitation');

      const invitationDoc = invitations.docs[0];
      const invitation = invitationDoc.data();
      if (invitation.invitedEmail?.toLowerCase() !== input.userEmail.toLowerCase()) {
        throw forbidden('This invitation is for a different email address');
      }
      if (new Date() > invitation.expiresAt.toDate()) {
        await invitationDoc.ref.update({ status: 'expired' });
        throw gone('This invitation has expired');
      }
      if (!isRole(invitation.role)) throw badRequest('Invalid invitation role');

      const membershipId = `${invitation.groupId}_${input.userId}`;
      const membership = await db.collection('groupMembers').doc(membershipId).get();
      if (membership.exists && membership.data()?.status === 'active') {
        throw badRequest('Already a member of this group');
      }

      const now = Timestamp.now();
      await db.collection('groupMembers').doc(membershipId).set({
        groupId: invitation.groupId,
        userId: input.userId,
        userEmail: input.userEmail.toLowerCase(),
        userName: input.userName ?? '',
        role: invitation.role,
        status: 'active',
        invitedAt: invitation.createdAt,
        invitedBy: invitation.invitedBy,
        joinedAt: now,
        permissions: DEFAULT_ROLE_PERMISSIONS[invitation.role],
        lastActivityAt: now,
      });
      await invitationDoc.ref.update({ status: 'accepted', respondedAt: now });

      const groupRef = db.collection('groups').doc(invitation.groupId);
      const groupDoc = await groupRef.get();
      const currentMemberCount = groupDoc.data()?.stats?.memberCount ?? 0;
      await groupRef.update({
        'stats.memberCount': Number(currentMemberCount) + 1,
        'stats.lastActivityAt': now,
        updatedAt: now,
      });

      await db.collection('groupActivities').doc().set({
        groupId: invitation.groupId,
        userId: input.userId,
        userName: input.userName ?? 'New member',
        action: 'member_joined',
        details: `${input.userEmail} joined the group`,
        metadata: { email: input.userEmail, role: invitation.role },
        createdAt: now,
      });

      await notifications.notifyGroupMembers({
        groupId: invitation.groupId,
        actorUserId: input.userId,
        type: 'group_member_joined',
        title: 'New member joined',
        bodyTemplate: '{actor} joined {group}',
        category: 'group',
        priority: 'low',
        icon: 'member',
        actionUrl: `/groups/${invitation.groupId}`,
        relatedId: input.userId,
        relatedType: 'member',
        metadata: { email: input.userEmail, role: invitation.role },
      });

      return {
        groupId: invitation.groupId,
        groupName: invitation.groupName,
        role: invitation.role,
      };
    },

    async archiveGroup(input) {
      const membership = await getActiveMembership(input.groupId, input.userId);
      const data = membership.data() ?? {};
      if (data.role !== 'owner' && data.role !== 'admin') {
        throw forbidden('Only owners and admins can archive groups');
      }
      await db.collection('groups').doc(input.groupId).update({
        status: 'archived',
        archivedAt: Timestamp.now(),
        archivedBy: input.userId,
        updatedAt: Timestamp.now(),
      });
      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.userId,
        userName: data.userName ?? data.userEmail ?? 'Admin',
        action: 'group_archived',
        details: 'Archived group',
        createdAt: Timestamp.now(),
      });
      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.userId,
        type: 'group_settings_changed',
        title: 'Group archived',
        bodyTemplate: '{actor} archived {group}',
        category: 'group',
        priority: 'medium',
        icon: 'archive',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: input.groupId,
        relatedType: 'group',
      });
    },

    async leaveGroup(input) {
      const target = await getMemberDoc(input.groupId, input.userId);
      const targetData = target.data() ?? {};
      if (targetData.role === 'owner') {
        throw badRequest('Owners cannot leave the group. Transfer ownership first or delete the group.');
      }
      await target.ref.update({
        status: 'left',
        leftAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
      });
      await decrementMemberCount(input.groupId);
      await db.collection('groupActivities').doc().set({
        groupId: input.groupId,
        userId: input.userId,
        userName: targetData.userName ?? targetData.userEmail ?? 'Member',
        action: 'member_left',
        details: `${targetData.userEmail} left the group`,
        metadata: { userId: targetData.userId, email: targetData.userEmail },
        createdAt: Timestamp.now(),
      });
      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.userId,
        type: 'group_member_left',
        title: 'Member left',
        bodyTemplate: '{actor} left {group}',
        category: 'group',
        priority: 'low',
        icon: 'member',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: targetData.userId,
        relatedType: 'member',
        metadata: { userId: targetData.userId, email: targetData.userEmail },
      });
    },
  };
}
