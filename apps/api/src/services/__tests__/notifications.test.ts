import { describe, expect, it, vi } from 'vitest';

import {
  createNotificationService,
  type NotificationDeliveryDependencies,
} from '../notifications';

function dependencies(
  overrides: Partial<NotificationDeliveryDependencies> = {},
): NotificationDeliveryDependencies {
  return {
    createNotification: vi.fn(async () => 'notification-1'),
    getActorSummary: vi.fn(async () => ({
      name: 'Alice',
      avatarUrl: 'https://example.com/alice.png',
    })),
    getGroupMemberUserIds: vi.fn(async () => ['actor-1', 'recipient-1']),
    getGroupSummary: vi.fn(async () => ({ name: 'Studio', icon: 'S' })),
    getNotificationPreference: vi.fn(async () => ({
      inApp: true,
      push: true,
      frequency: 'realtime' as const,
    })),
    getUserSettings: vi.fn(async () => ({
      globalMute: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    })),
    getUserTokens: vi.fn(async () => []),
    isInQuietHours: vi.fn(() => false),
    markNotificationDelivered: vi.fn(async () => undefined),
    removeStaleTokens: vi.fn(async () => undefined),
    sendMulticast: vi.fn(async () => ({
      successCount: 0,
      failureCount: 0,
      responses: [],
    })),
    ...overrides,
  };
}

describe('notification service', () => {
  it('creates in-app notification documents and sends push for realtime recipients', async () => {
    const deps = dependencies({
      getUserTokens: vi.fn(async () => [
        { deviceId: 'device-1', token: 'token-1', platform: 'ios' as const },
      ]),
      sendMulticast: vi.fn(async () => ({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      })),
    });
    const service = createNotificationService(deps);

    await service.notifyUsers({
      userIds: ['recipient-1'],
      type: 'group_expense_added',
      title: 'New expense added',
      body: 'Alice added $12.50 at Cafe',
      category: 'group',
      priority: 'medium',
      icon: 'money',
      actionUrl: '/groups/group-1',
      relatedId: 'expense-1',
      relatedType: 'expense',
      groupId: 'group-1',
      actorId: 'actor-1',
      actorName: 'Alice',
      metadata: { vendor: 'Cafe', amount: 12.5 },
    });

    expect(deps.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'recipient-1',
        type: 'group_expense_added',
        title: 'New expense added',
        body: 'Alice added $12.50 at Cafe',
        actionUrl: '/groups/group-1',
        groupId: 'group-1',
        actorName: 'Alice',
      }),
    );
    expect(deps.sendMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token-1'],
        notification: {
          title: 'New expense added',
          body: 'Alice added $12.50 at Cafe',
        },
        data: expect.objectContaining({
          notificationId: 'notification-1',
          type: 'group_expense_added',
          actionUrl: '/groups/group-1',
        }),
      }),
    );
    expect(deps.markNotificationDelivered).toHaveBeenCalledWith('notification-1');
  });

  it('honors push-disabled preferences while still creating enabled in-app notifications', async () => {
    const deps = dependencies({
      getNotificationPreference: vi.fn(async () => ({
        inApp: true,
        push: false,
        frequency: 'realtime' as const,
      })),
      getUserTokens: vi.fn(async () => [
        { deviceId: 'device-1', token: 'token-1', platform: 'android' as const },
      ]),
    });
    const service = createNotificationService(deps);

    await service.notifyUsers({
      userIds: ['recipient-1'],
      type: 'group_settings_changed',
      title: 'Group settings updated',
      body: 'Alice updated settings for Studio',
      category: 'group',
      priority: 'low',
    });

    expect(deps.createNotification).toHaveBeenCalledOnce();
    expect(deps.sendMulticast).not.toHaveBeenCalled();
  });

  it('removes stale FCM tokens without failing the notification attempt', async () => {
    const deps = dependencies({
      getUserTokens: vi.fn(async () => [
        { deviceId: 'fresh-device', token: 'fresh-token', platform: 'ios' as const },
        { deviceId: 'stale-device', token: 'stale-token', platform: 'ios' as const },
      ]),
      sendMulticast: vi.fn(async () => ({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
        ],
      })),
    });
    const service = createNotificationService(deps);

    await service.notifyUsers({
      userIds: ['recipient-1'],
      type: 'group_member_left',
      title: 'Member left',
      body: 'Bob left Studio',
      category: 'group',
      priority: 'low',
    });

    expect(deps.removeStaleTokens).toHaveBeenCalledWith('recipient-1', [
      { deviceId: 'stale-device', token: 'stale-token', platform: 'ios' },
    ]);
    expect(deps.markNotificationDelivered).toHaveBeenCalledWith('notification-1');
  });

  it('resolves group recipients, group summary, and actor summary for group notifications', async () => {
    const deps = dependencies();
    const service = createNotificationService(deps);

    await service.notifyGroupMembers({
      groupId: 'group-1',
      actorUserId: 'actor-1',
      type: 'group_member_joined',
      title: 'New member joined',
      bodyTemplate: '{actor} joined {group}',
      category: 'group',
      priority: 'low',
      actionUrl: '/groups/group-1',
      relatedId: 'actor-1',
      relatedType: 'member',
    });

    expect(deps.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'recipient-1',
        body: 'Alice joined Studio',
        actorName: 'Alice',
        actorAvatar: 'https://example.com/alice.png',
        metadata: expect.objectContaining({
          groupName: 'Studio',
          groupIcon: 'S',
        }),
      }),
    );
  });

  it('omits undefined optional group metadata before creating notification documents', async () => {
    const deps = dependencies({
      getGroupSummary: vi.fn(async () => ({ name: 'Studio' })),
    });
    const service = createNotificationService(deps);

    await service.notifyGroupMembers({
      groupId: 'group-1',
      actorUserId: 'actor-1',
      type: 'group_settings_changed',
      title: 'Group updated',
      bodyTemplate: '{actor} updated {group}',
      category: 'group',
      priority: 'low',
    });

    expect(deps.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          groupIcon: undefined,
        }),
      }),
    );
  });
});
