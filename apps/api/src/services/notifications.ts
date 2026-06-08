import {
  FieldValue,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type NotificationCategory = 'group' | 'budget' | 'system' | 'social' | 'income' | 'savings';
export type NotificationFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never';
export type NotificationRelatedType = 'expense' | 'group' | 'budget' | 'member';

export type GroupNotificationType =
  | 'group_expense_added'
  | 'group_expense_updated'
  | 'group_expense_deleted'
  | 'group_invitation'
  | 'group_member_joined'
  | 'group_member_left'
  | 'group_role_changed'
  | 'group_settings_changed';

export interface DeviceToken {
  deviceId: string;
  token: string;
  platform: 'ios' | 'android';
}

export interface NotificationTypePreference {
  inApp: boolean;
  push: boolean;
  frequency: NotificationFrequency;
}

export interface NotificationSettings {
  globalMute: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface UserSummary {
  name: string;
  avatarUrl?: string;
}

export interface GroupSummary {
  name: string;
  icon?: string;
}

export interface NotificationDocumentInput {
  userId: string;
  type: GroupNotificationType;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  icon?: string;
  actionUrl?: string;
  relatedId?: string;
  relatedType?: NotificationRelatedType;
  groupId?: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  metadata?: Record<string, unknown>;
}

export interface PushMessage {
  tokens: string[];
  notification: {
    title: string;
    body: string;
  };
  data: Record<string, string>;
  apns: {
    payload: {
      aps: Record<string, unknown>;
    };
  };
  android: {
    notification: {
      channelId: string;
      sound: string;
      priority: 'default' | 'high';
    };
  };
}

export interface PushSendResponse {
  successCount: number;
  failureCount: number;
  responses: Array<{
    success: boolean;
    error?: {
      code?: string;
      message?: string;
    };
  }>;
}

export interface NotificationDeliveryDependencies {
  createNotification(input: NotificationDocumentInput): Promise<string | null>;
  getActorSummary(userId: string): Promise<UserSummary>;
  getGroupMemberUserIds(groupId: string): Promise<string[]>;
  getGroupSummary(groupId: string): Promise<GroupSummary>;
  getNotificationPreference(
    userId: string,
    type: GroupNotificationType,
  ): Promise<NotificationTypePreference>;
  getUserSettings(userId: string): Promise<NotificationSettings>;
  getUserTokens(userId: string): Promise<DeviceToken[]>;
  isInQuietHours(startTime: string, endTime: string): boolean;
  markNotificationDelivered(notificationId: string): Promise<void>;
  removeStaleTokens(userId: string, tokens: DeviceToken[]): Promise<void>;
  sendMulticast(message: PushMessage): Promise<PushSendResponse>;
}

export interface NotifyUsersInput {
  userIds: string[];
  type: GroupNotificationType;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  icon?: string;
  actionUrl?: string;
  relatedId?: string;
  relatedType?: NotificationRelatedType;
  groupId?: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  metadata?: Record<string, unknown>;
  data?: Record<string, string>;
}

export interface NotifyGroupMembersInput {
  groupId: string;
  actorUserId: string;
  type: GroupNotificationType;
  title: string;
  bodyTemplate: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  icon?: string;
  actionUrl?: string;
  relatedId?: string;
  relatedType?: NotificationRelatedType;
  includeActor?: boolean;
  metadata?: Record<string, unknown>;
  data?: Record<string, string>;
}

export interface NotificationService {
  notifyUsers(input: NotifyUsersInput): Promise<void>;
  notifyGroupMembers(input: NotifyGroupMembersInput): Promise<void>;
}

const DEFAULT_PREFERENCE: NotificationTypePreference = {
  inApp: true,
  push: true,
  frequency: 'realtime',
};

const DEFAULT_SETTINGS: NotificationSettings = {
  globalMute: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function cleanValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanValue(item))
      .filter((item) => item !== undefined);
  }
  if (isPlainObject(value)) {
    return withoutUndefined(value);
  }
  return value;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key, cleanValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function stringData(value: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string' && entry[1].length > 0
    )),
  );
}

function isStaleTokenError(code: string | undefined): boolean {
  return code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token';
}

function buildPushMessage(
  tokens: string[],
  input: NotifyUsersInput,
  notificationId: string | null,
): PushMessage {
  return {
    tokens,
    notification: {
      title: input.title,
      body: input.body,
    },
    data: {
      ...stringData({
        notificationId: notificationId ?? undefined,
        type: input.type,
        actionUrl: input.actionUrl,
        groupId: input.groupId,
        relatedId: input.relatedId,
        relatedType: input.relatedType,
        priority: input.priority,
      }),
      ...(input.data ?? {}),
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          ...(input.priority === 'critical'
            ? { 'interruption-level': 'time-sensitive' }
            : {}),
        },
      },
    },
    android: {
      notification: {
        channelId: 'penny_default',
        sound: 'default',
        priority:
          input.priority === 'critical' || input.priority === 'high'
            ? 'high'
            : 'default',
      },
    },
  };
}

async function notifyOneUser(
  deps: NotificationDeliveryDependencies,
  userId: string,
  input: Omit<NotifyUsersInput, 'userIds'>,
): Promise<void> {
  try {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(await deps.getUserSettings(userId)),
    };
    if (settings.globalMute) return;

    const preference = {
      ...DEFAULT_PREFERENCE,
      ...(await deps.getNotificationPreference(userId, input.type)),
    };

    let notificationId: string | null = null;
    if (preference.inApp) {
      notificationId = await deps.createNotification(withoutUndefined({
        ...input,
        userId,
      }));
    }

    const quietHoursBlockPush =
      input.priority !== 'critical' &&
      deps.isInQuietHours(settings.quietHoursStart, settings.quietHoursEnd);
    const shouldPush =
      preference.push &&
      preference.frequency === 'realtime' &&
      !quietHoursBlockPush;

    if (!shouldPush) return;

    const tokens = await deps.getUserTokens(userId);
    if (tokens.length === 0) return;

    let delivered = false;
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const response = await deps.sendMulticast(
        buildPushMessage(batch.map((token) => token.token), {
          ...input,
          userIds: [userId],
        }, notificationId),
      );

      if (response.successCount > 0) {
        delivered = true;
      }

      if (response.failureCount > 0) {
        const staleTokens = response.responses
          .map((result, index) => ({ result, token: batch[index] }))
          .filter(({ result }) => !result.success && isStaleTokenError(result.error?.code))
          .map(({ token }) => token)
          .filter((token): token is DeviceToken => Boolean(token));

        if (staleTokens.length > 0) {
          await deps.removeStaleTokens(userId, staleTokens);
        }
      }
    }

    if (notificationId && delivered) {
      await deps.markNotificationDelivered(notificationId);
    }
  } catch (error) {
    console.error('[NotificationService] Failed to notify user:', {
      userId,
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

export function createNotificationService(
  deps: NotificationDeliveryDependencies,
): NotificationService {
  return {
    async notifyUsers(input) {
      const userIds = unique(input.userIds);
      await Promise.all(
        userIds.map((userId) =>
          notifyOneUser(deps, userId, {
            type: input.type,
            title: input.title,
            body: input.body,
            category: input.category,
            priority: input.priority,
            icon: input.icon,
            actionUrl: input.actionUrl,
            relatedId: input.relatedId,
            relatedType: input.relatedType,
            groupId: input.groupId,
            actorId: input.actorId,
            actorName: input.actorName,
            actorAvatar: input.actorAvatar,
            metadata: input.metadata,
            data: input.data,
          }),
        ),
      );
    },

    async notifyGroupMembers(input) {
      try {
        const [memberUserIds, actor, group] = await Promise.all([
          deps.getGroupMemberUserIds(input.groupId),
          deps.getActorSummary(input.actorUserId),
          deps.getGroupSummary(input.groupId),
        ]);
        const recipients = memberUserIds.filter(
          (userId) => input.includeActor || userId !== input.actorUserId,
        );

        await this.notifyUsers({
          userIds: recipients,
          type: input.type,
          title: input.title,
          body: renderTemplate(input.bodyTemplate, {
            actor: actor.name,
            group: group.name,
          }),
          category: input.category,
          priority: input.priority,
          icon: input.icon,
          actionUrl: input.actionUrl,
          relatedId: input.relatedId,
          relatedType: input.relatedType,
          groupId: input.groupId,
          actorId: input.actorUserId,
          actorName: actor.name,
          actorAvatar: actor.avatarUrl,
          metadata: {
            ...(input.metadata ?? {}),
            groupName: group.name,
            groupIcon: group.icon,
          },
          data: input.data,
        });
      } catch (error) {
        console.error('[NotificationService] Failed to notify group members:', {
          groupId: input.groupId,
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createNoopNotificationService(): NotificationService {
  return {
    async notifyUsers() {
      return undefined;
    },
    async notifyGroupMembers() {
      return undefined;
    },
  };
}

export function isCurrentTimeInQuietHours(
  startTime: string,
  endTime: string,
): boolean {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endHour) ||
    !Number.isInteger(endMinute)
  ) {
    return false;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function createFirestoreNotificationService(
  db: Firestore,
  messaging: Messaging,
): NotificationService {
  return createNotificationService({
    async createNotification(input) {
      const doc = await db.collection('notifications').add(withoutUndefined({
        ...input,
        read: false,
        delivered: false,
        isGrouped: false,
        createdAt: Timestamp.now(),
      }));
      return doc.id;
    },

    async getActorSummary(userId) {
      const doc = await db.collection('users').doc(userId).get();
      const data = doc.data() ?? {};
      return {
        name: String(data.displayName ?? data.email ?? 'Someone'),
        avatarUrl:
          typeof data.photoURL === 'string' ? data.photoURL : undefined,
      };
    },

    async getGroupMemberUserIds(groupId) {
      const snapshot = await db
        .collection('groupMembers')
        .where('groupId', '==', groupId)
        .where('status', '==', 'active')
        .get();
      return snapshot.docs
        .map((doc) => doc.data().userId)
        .filter((userId): userId is string => typeof userId === 'string');
    },

    async getGroupSummary(groupId) {
      const doc = await db.collection('groups').doc(groupId).get();
      const data = doc.data() ?? {};
      return {
        name: String(data.name ?? 'Group'),
        icon: typeof data.icon === 'string' ? data.icon : undefined,
      };
    },

    async getNotificationPreference(userId, type) {
      const doc = await db
        .collection('users')
        .doc(userId)
        .collection('notificationPreferences')
        .doc('default')
        .get();
      const preference = doc.data()?.[type] as Record<string, unknown> | undefined;
      return {
        inApp:
          typeof preference?.inApp === 'boolean'
            ? preference.inApp
            : DEFAULT_PREFERENCE.inApp,
        push:
          typeof preference?.push === 'boolean'
            ? preference.push
            : DEFAULT_PREFERENCE.push,
        frequency:
          typeof preference?.frequency === 'string'
            ? (preference.frequency as NotificationFrequency)
            : DEFAULT_PREFERENCE.frequency,
      };
    },

    async getUserSettings(userId) {
      const doc = await db.collection('userNotificationSettings').doc(userId).get();
      const data = doc.data() ?? {};
      return {
        globalMute:
          typeof data.globalMute === 'boolean'
            ? data.globalMute
            : DEFAULT_SETTINGS.globalMute,
        quietHoursStart:
          typeof data.quietHoursStart === 'string'
            ? data.quietHoursStart
            : DEFAULT_SETTINGS.quietHoursStart,
        quietHoursEnd:
          typeof data.quietHoursEnd === 'string'
            ? data.quietHoursEnd
            : DEFAULT_SETTINGS.quietHoursEnd,
      };
    },

    async getUserTokens(userId) {
      const doc = await db.collection('users').doc(userId).get();
      const fcmTokens = doc.data()?.fcmTokens;
      if (!fcmTokens || typeof fcmTokens !== 'object') return [];

      return Object.entries(fcmTokens)
        .map(([deviceId, value]) => {
          const tokenData = value as Record<string, unknown>;
          if (typeof tokenData.token !== 'string') return null;
          return {
            deviceId,
            token: tokenData.token,
            platform: tokenData.platform === 'android' ? 'android' : 'ios',
          } satisfies DeviceToken;
        })
        .filter((token): token is DeviceToken => token !== null);
    },

    isInQuietHours: isCurrentTimeInQuietHours,

    async markNotificationDelivered(notificationId) {
      await db.collection('notifications').doc(notificationId).update({
        delivered: true,
        deliveredAt: Timestamp.now(),
      });
    },

    async removeStaleTokens(userId, tokens) {
      const updates = Object.fromEntries(
        tokens.map((token) => [
          `fcmTokens.${token.deviceId}`,
          FieldValue.delete(),
        ]),
      );
      if (Object.keys(updates).length > 0) {
        await db.collection('users').doc(userId).update(updates);
      }
    },

    async sendMulticast(message) {
      return messaging.sendEachForMulticast(message);
    },
  });
}
