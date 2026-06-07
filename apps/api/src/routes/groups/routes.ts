import type { FastifyInstance } from 'fastify';

import type { GroupRole, GroupService } from '../../services/groups';

function forbiddenUserMismatch(bodyUserId: unknown, authUserId: string) {
  return typeof bodyUserId === 'string' && bodyUserId && bodyUserId !== authUserId;
}

function isGroupRole(value: unknown): value is GroupRole {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer';
}

export async function registerGroupRoutes(
  app: FastifyInstance,
  groups: GroupService,
) {
  app.get('/api/groups', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const result = await groups.listGroups({ userId: request.user.uid });
      return {
        success: true,
        groups: result,
        count: result.length,
      };
    },
  });

  app.post('/api/groups', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const userId = request.user.uid;

      if (forbiddenUserMismatch(body.userId, userId)) {
        return reply.status(403).send({
          error: 'Forbidden',
          details: 'Request userId does not match authenticated user',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      if (typeof body.name !== 'string' || body.name.trim().length < 2) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'name must be at least 2 characters',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      const result = await groups.createGroup({
        userId,
        userEmail: request.user.email,
        userName: typeof body.userName === 'string' ? body.userName : undefined,
        name: body.name,
        description:
          typeof body.description === 'string' ? body.description : undefined,
        color: typeof body.color === 'string' ? body.color : undefined,
        icon: typeof body.icon === 'string' ? body.icon : undefined,
        settings:
          body.settings && typeof body.settings === 'object'
            ? (body.settings as Record<string, unknown>)
            : undefined,
      });

      return {
        success: true,
        groupId: result.groupId,
        message: 'Group created successfully',
        group: result.group,
      };
    },
  });

  app.patch('/api/groups/:groupId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      const body = request.body as Record<string, unknown>;
      const group = await groups.updateGroup({
        groupId: params.groupId,
        userId: request.user.uid,
        updates: body,
      });
      return { success: true, group };
    },
  });

  app.put('/api/groups/:groupId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      const body = request.body as Record<string, unknown>;
      const group = await groups.updateGroup({
        groupId: params.groupId,
        userId: request.user.uid,
        updates: body,
      });
      return { success: true, group };
    },
  });

  app.delete('/api/groups/:groupId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      await groups.deleteGroup({
        groupId: params.groupId,
        userId: request.user.uid,
      });
      return { success: true, message: 'Group deleted successfully' };
    },
  });

  app.get('/api/groups/:groupId/members', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      const members = await groups.listMembers({
        groupId: params.groupId,
        userId: request.user.uid,
      });
      return { success: true, members, count: members.length };
    },
  });

  app.post('/api/groups/:groupId/members', {
    preHandler: app.requireUser,
    handler: async (request, reply) => {
      const params = request.params as { groupId: string };
      const body = request.body as Record<string, unknown>;
      const role = typeof body.role === 'string' ? body.role : 'member';
      if (role !== 'admin' && role !== 'member' && role !== 'viewer') {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'Invalid role. Must be admin, member, or viewer',
          requestId: reply.getHeader('x-request-id'),
        });
      }
      if (typeof body.email !== 'string' || !body.email.trim()) {
        return reply.status(400).send({
          error: 'Bad Request',
          details: 'email is required',
          requestId: reply.getHeader('x-request-id'),
        });
      }

      const result = await groups.inviteMember({
        groupId: params.groupId,
        userId: request.user.uid,
        email: body.email,
        role,
      });
      return {
        success: true,
        message: 'Invitation sent successfully',
        ...result,
      };
    },
  });

  app.patch('/api/groups/:groupId/members/:memberId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string; memberId: string };
      const body = request.body as Record<string, unknown>;
      if (!isGroupRole(body.newRole)) {
        throw Object.assign(new Error('Invalid role'), { statusCode: 400 });
      }
      await groups.updateMemberRole({
        groupId: params.groupId,
        requesterUserId: request.user.uid,
        memberId: params.memberId,
        newRole: body.newRole,
      });
      return { success: true, message: 'Member role updated successfully' };
    },
  });

  app.put('/api/groups/:groupId/members/:memberId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string; memberId: string };
      const body = request.body as Record<string, unknown>;
      if (!isGroupRole(body.newRole)) {
        throw Object.assign(new Error('Invalid role'), { statusCode: 400 });
      }
      await groups.updateMemberRole({
        groupId: params.groupId,
        requesterUserId: request.user.uid,
        memberId: params.memberId,
        newRole: body.newRole,
      });
      return { success: true, message: 'Member role updated successfully' };
    },
  });

  app.delete('/api/groups/:groupId/members/:memberId', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string; memberId: string };
      const query = request.query as Record<string, unknown>;
      const action = query.action === 'leave' ? 'leave' : 'remove';
      await groups.removeMember({
        groupId: params.groupId,
        requesterUserId: request.user.uid,
        memberId: params.memberId,
        action,
      });
      return {
        success: true,
        message: action === 'leave'
          ? 'Successfully left the group'
          : 'Member removed successfully',
      };
    },
  });

  app.post('/api/groups/invitations/accept', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const body = request.body as Record<string, unknown>;
      const result = await groups.acceptInvitation({
        token: String(body.token ?? ''),
        userId: request.user.uid,
        userEmail: String(body.userEmail ?? request.user.email ?? ''),
        userName: typeof body.userName === 'string' ? body.userName : undefined,
      });
      return {
        success: true,
        message: 'Successfully joined the group',
        ...result,
      };
    },
  });

  app.post('/api/groups/:groupId/archive', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      await groups.archiveGroup({ groupId: params.groupId, userId: request.user.uid });
      return { success: true, message: 'Group archived successfully' };
    },
  });

  app.post('/api/groups/:groupId/leave', {
    preHandler: app.requireUser,
    handler: async (request) => {
      const params = request.params as { groupId: string };
      await groups.leaveGroup({ groupId: params.groupId, userId: request.user.uid });
      return { success: true, message: 'You have left the group successfully' };
    },
  });
}
