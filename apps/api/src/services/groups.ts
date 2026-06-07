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
    userId: string;
    userEmail: string;
    userName?: string;
  }): Promise<{ groupId: string; groupName: string; role: GroupRole }>;
  archiveGroup(input: { groupId: string; userId: string }): Promise<void>;
  leaveGroup(input: { groupId: string; userId: string }): Promise<void>;
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
  };
}
