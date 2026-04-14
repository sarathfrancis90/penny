/**
 * PushService
 *
 * Handles sending FCM push notifications to user devices.
 * Looks up FCM tokens from Firestore and sends via Admin SDK.
 * Automatically cleans up stale tokens on delivery failure.
 */

import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface DeviceToken {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
}

interface PushPayload {
  title: string;
  body: string;
  actionUrl?: string;
  icon?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, string>;
}

/**
 * PushService - sends FCM push notifications
 */
export class PushService {
  /**
   * Send a push notification to all devices of a user.
   * Silently fails — callers should not depend on push success.
   */
  static async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      const tokens = await this.getUserTokens(userId);
      if (tokens.length === 0) return;

      const fcmTokens = tokens.map(t => t.token);

      // Build FCM message
      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          ...(payload.actionUrl ? { actionUrl: payload.actionUrl } : {}),
          ...(payload.icon ? { icon: payload.icon } : {}),
          ...(payload.priority ? { priority: payload.priority } : {}),
          ...payload.data,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              ...(payload.priority === 'critical' ? { 'interruption-level': 'time-sensitive' } : {}),
            },
          },
        },
        android: {
          notification: {
            channelId: 'penny_default',
            sound: 'default',
            priority: (payload.priority === 'critical' || payload.priority === 'high')
              ? 'high' as const
              : 'default' as const,
          },
        },
      };

      // Send to all tokens (up to 500 per batch)
      const batchSize = 500;
      for (let i = 0; i < fcmTokens.length; i += batchSize) {
        const batch = fcmTokens.slice(i, i + batchSize);
        const response = await adminMessaging.sendEachForMulticast({
          tokens: batch,
          ...message,
        });

        // Clean up stale tokens
        if (response.failureCount > 0) {
          const staleTokens: string[] = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code;
              if (
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/invalid-registration-token'
              ) {
                staleTokens.push(batch[idx]);
              } else {
                console.warn('[PushService] FCM send error:', resp.error?.message);
              }
            }
          });

          if (staleTokens.length > 0) {
            await this.removeStaleTokens(userId, tokens, staleTokens);
          }
        }

        if (response.successCount > 0) {
          console.log(`[PushService] Sent ${response.successCount} push(es) to user ${userId}`);
        }
      }
    } catch (error) {
      // Push failures should never break the calling operation
      console.error('[PushService] Error sending push:', error);
    }
  }

  /**
   * Send push to multiple users (e.g., all group members).
   * Runs concurrently for all users.
   */
  static async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(userIds.map(id => this.sendToUser(id, payload)));
  }

  /**
   * Read FCM tokens from the user's Firestore document.
   * Tokens are stored at users/{userId}.fcmTokens.{deviceId}.token
   */
  private static async getUserTokens(userId: string): Promise<DeviceToken[]> {
    try {
      const userDoc = await adminDb.collection('users').doc(userId).get();
      if (!userDoc.exists) return [];

      const fcmTokens = userDoc.data()?.fcmTokens;
      if (!fcmTokens || typeof fcmTokens !== 'object') return [];

      const tokens: DeviceToken[] = [];
      for (const [deviceId, data] of Object.entries(fcmTokens)) {
        const tokenData = data as Record<string, unknown>;
        if (tokenData?.token && typeof tokenData.token === 'string') {
          tokens.push({
            token: tokenData.token,
            platform: (tokenData.platform as 'ios' | 'android') || 'ios',
            deviceId,
          });
        }
      }
      return tokens;
    } catch (error) {
      console.error('[PushService] Error reading tokens:', error);
      return [];
    }
  }

  /**
   * Remove stale FCM tokens from the user's document.
   */
  private static async removeStaleTokens(
    userId: string,
    allTokens: DeviceToken[],
    staleTokenValues: string[]
  ): Promise<void> {
    try {
      const staleSet = new Set(staleTokenValues);
      const updates: Record<string, unknown> = {};

      for (const t of allTokens) {
        if (staleSet.has(t.token)) {
          updates[`fcmTokens.${t.deviceId}`] = FieldValue.delete();
        }
      }

      if (Object.keys(updates).length > 0) {
        await adminDb.collection('users').doc(userId).update(updates);
        console.log(`[PushService] Removed ${Object.keys(updates).length} stale token(s) for user ${userId}`);
      }
    } catch (error) {
      console.error('[PushService] Error removing stale tokens:', error);
    }
  }
}
