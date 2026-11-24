import { describe, expect, it, vi } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import {
  createNotificationService,
  isCurrentTimeInQuietHours,
  readFirestoreNotificationSettings,
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

describe('quiet hours', () => {
  // 2026-07-15 03:30 UTC is 23:30 the evening before in Toronto (EDT, UTC-4).
  const lateEveningToronto = new Date('2026-07-15T03:30:00Z');
  // 2026-07-15 14:00 UTC is 10:00 in Toronto and 07:00 in Vancouver.
  const morning = new Date('2026-07-15T14:00:00Z');

  it('evaluates the window in the user’s time zone, not UTC', () => {
    expect(
      isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', lateEveningToronto),
    ).toBe(true);
    // 14:00 UTC is outside 22:00–08:00, but in Vancouver it is 07:00 (inside).
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Vancouver', morning)).toBe(true);
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', morning)).toBe(false);
  });

  it('defaults to America/Toronto when no zone is stored or the zone is invalid', () => {
    // 23:00 UTC is 19:00 in Toronto: outside 22:00–08:00, though UTC says inside.
    const evening = new Date('2026-07-15T23:00:00Z');
    expect(isCurrentTimeInQuietHours('22:00', '08:00', undefined, evening)).toBe(false);
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'Not/AZone', evening)).toBe(false);
    expect(isCurrentTimeInQuietHours('18:00', '20:00', undefined, evening)).toBe(true);
  });

  it('handles windows that cross midnight and same-day windows', () => {
    const at = (hhmm: string) => new Date(`2026-01-15T${hhmm}:00-05:00`); // Toronto EST
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', at('22:00'))).toBe(true);
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', at('00:15'))).toBe(true);
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', at('07:59'))).toBe(true);
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', at('08:00'))).toBe(false);
    expect(isCurrentTimeInQuietHours('22:00', '08:00', 'America/Toronto', at('12:00'))).toBe(false);
    expect(isCurrentTimeInQuietHours('13:00', '14:00', 'America/Toronto', at('13:30'))).toBe(true);
    expect(isCurrentTimeInQuietHours('13:00', '14:00', 'America/Toronto', at('14:30'))).toBe(false);
    expect(isCurrentTimeInQuietHours('09:00', '09:00', 'America/Toronto', at('09:00'))).toBe(false);
    expect(isCurrentTimeInQuietHours('bad', '08:00', 'America/Toronto', at('23:00'))).toBe(false);
  });

  it('passes the user’s stored time zone to the quiet-hours check', async () => {
    const isInQuietHours = vi.fn(() => true);
    const deps = dependencies({
      getUserSettings: vi.fn(async () => ({
        globalMute: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        timeZone: 'America/Vancouver',
      })),
      getUserTokens: vi.fn(async () => [
        { deviceId: 'device-1', token: 'token-1', platform: 'ios' as const },
      ]),
      isInQuietHours,
    });

    await createNotificationService(deps).notifyUsers({
      userIds: ['recipient-1'],
      type: 'group_expense_added',
      title: 'New expense',
      body: 'x',
      category: 'group',
      priority: 'medium',
    });

    expect(isInQuietHours).toHaveBeenCalledWith('22:00', '08:00', 'America/Vancouver');
    expect(deps.sendMulticast).not.toHaveBeenCalled();
    expect(deps.createNotification).toHaveBeenCalledOnce();
  });

  it('reads the zone from notification settings, then user preferences, else Toronto', async () => {
    const db = new FakeFirestore();
    db.seed('userNotificationSettings/u1', {
      quietHoursStart: '21:00',
      quietHoursEnd: '07:00',
      timezone: 'America/Halifax',
    });
    db.seed('userNotificationSettings/u2', { quietHoursStart: '21:00' });
    db.seed('users/u2', { preferences: { timezone: 'America/Edmonton' } });
    db.seed('userNotificationSettings/u3', { timezone: 'Not/AZone' });
    const settings = await Promise.all(
      ['u1', 'u2', 'u3', 'u4'].map((userId) =>
        readFirestoreNotificationSettings(db as never, userId),
      ),
    );
    expect(settings.map((entry) => entry.timeZone)).toEqual([
      'America/Halifax',
      'America/Edmonton',
      'America/Toronto',
      'America/Toronto',
    ]);
    expect(settings[0]).toMatchObject({ quietHoursStart: '21:00', quietHoursEnd: '07:00' });
  });
});

describe('push delivery failures', () => {
  it('logs the error code and does not throw when FCM rejects the send', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deps = dependencies({
      getUserTokens: vi.fn(async () => [
        { deviceId: 'device-1', token: 'token-1', platform: 'ios' as const },
      ]),
      sendMulticast: vi.fn(async () => {
        throw Object.assign(new Error('Identity Toolkit API has not been used'), {
          code: 'messaging/third-party-auth-error',
        });
      }),
    });

    await expect(
      createNotificationService(deps).notifyUsers({
        userIds: ['recipient-1'],
        type: 'group_expense_added',
        title: 'New expense',
        body: 'x',
        category: 'group',
        priority: 'medium',
      }),
    ).resolves.toBeUndefined();

    expect(deps.createNotification).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      '[NotificationService] Failed to notify user:',
      expect.objectContaining({ code: 'messaging/third-party-auth-error' }),
    );
    log.mockRestore();
  });
});
