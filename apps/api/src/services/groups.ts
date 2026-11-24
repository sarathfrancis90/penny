export interface CreateGroupInput {
  userId: string;
  userEmail?: string;
  userName?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  settings?: Record<string, unknown>;
}

export type GroupRole = 'owner' | 'admin' | 'member' | 'viewer';

/** A pending invitation as the invitee sees it; never carries the token. */
export interface PendingInvitationSummary {
  id: string;
  groupId: string;
  groupName: string;
  invitedBy: string;
  invitedByName: string | null;
  role: string;
  /** ISO-8601, or null when the stored value is missing. */
  createdAt: string | null;
  /** ISO-8601, or null when the invitation has no expiry. */
  expiresAt: string | null;
}

export interface GroupService {
  createGroup(input: CreateGroupInput): Promise<{
    groupId: string;
    group: Record<string, unknown>;
  }>;
  listGroups(input: { userId: string }): Promise<Record<string, unknown>[]>;
  updateGroup(input: {
    groupId: string;
    userId: string;
    updates: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  deleteGroup(input: { groupId: string; userId: string }): Promise<void>;
  listMembers(input: { groupId: string; userId: string }): Promise<Record<string, unknown>[]>;
  inviteMember(input: {
    groupId: string;
    userId: string;
    email: string;
    role: Exclude<GroupRole, 'owner'>;
  }): Promise<{ invitationId: string; token: string }>;
  updateMemberRole(input: {
    groupId: string;
    requesterUserId: string;
    memberId: string;
    newRole: GroupRole;
  }): Promise<void>;
  removeMember(input: {
    groupId: string;
    requesterUserId: string;
    memberId: string;
    action?: 'leave' | 'remove';
  }): Promise<void>;
  acceptInvitation(input: {
    token: string;
    /** Used only when there is no token (older invitation notifications). */
    invitationId?: string;
    userId: string;
    userEmail: string;
    userName?: string;
  }): Promise<{ groupId: string; groupName: string; role: GroupRole }>;
  archiveGroup(input: { groupId: string; userId: string }): Promise<void>;
  leaveGroup(input: { groupId: string; userId: string }): Promise<void>;
  /**
   * Pending, unexpired invitations to active groups addressed to the
   * caller's verified email (case-insensitive), newest first.
   */
  listMyInvitations(input: {
    userId: string;
    userEmail?: string;
  }): Promise<PendingInvitationSummary[]>;
}

export function createUnavailableGroupService(): GroupService {
  const unavailable = async () => {
    throw Object.assign(new Error('Group service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    createGroup: unavailable,
    listGroups: unavailable,
    updateGroup: unavailable,
    deleteGroup: unavailable,
    listMembers: unavailable,
    inviteMember: unavailable,
    updateMemberRole: unavailable,
    removeMember: unavailable,
    acceptInvitation: unavailable,
    archiveGroup: unavailable,
    leaveGroup: unavailable,
    listMyInvitations: unavailable,
  };
}
