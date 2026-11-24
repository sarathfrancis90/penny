/**
 * Notification Grouping Service
 * 
 * Handles intelligent grouping of similar notifications to reduce noise.
 * Groups notifications by type, source (group), and time window.
 *
 * SERVER-ONLY: used by NotificationService with the Admin SDK.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import type { Notification, NotificationType } from '@/lib/types/notifications';

/**
 * Firestore rejects undefined field values (the Admin SDK throws unless
 * ignoreUndefinedProperties is set), and optional notification fields are often undefined,
 * including inside nested maps such as `metadata`. Plain objects are cleaned
 * recursively; Timestamps, FieldValues and arrays are left as they are.
 */
export function withoutUndefined<T extends object>(data: T): T {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
          ? withoutUndefined(value as object)
          : value,
      ])
  ) as T;
}

/**
 * Configuration for grouping behavior
 */
const GROUPING_CONFIG = {
  TIME_WINDOW_MINUTES: 60, // Group notifications within 1 hour
  MAX_GROUP_SIZE: 10, // Maximum notifications per group
  GROUPABLE_TYPES: [
    'group_expense_added',
    'group_member_joined',
  ] as NotificationType[],
};

/**
 * Check if a notification type is groupable
 */
export function isGroupable(type: NotificationType): boolean {
  return GROUPING_CONFIG.GROUPABLE_TYPES.includes(type);
}

/**
 * Generate a group key for similar notifications
 * Format: type_groupId_userId
 */
export function generateGroupKey(
  type: NotificationType,
  groupId?: string,
  userId?: string
): string {
  return `${type}_${groupId || 'none'}_${userId}`;
}

/**
 * Find existing group for a notification
 * Returns the group notification if found, null otherwise
 */
export async function findExistingGroup(
  userId: string,
  type: NotificationType,
  groupId?: string
): Promise<Notification | null> {
  if (!isGroupable(type)) {
    return null;
  }

  const groupKey = generateGroupKey(type, groupId, userId);
  const timeThreshold = new Date(Date.now() - GROUPING_CONFIG.TIME_WINDOW_MINUTES * 60 * 1000);

  try {
    const snapshot = await adminDb
      .collection('notifications')
      .where('userId', '==', userId)
      .where('type', '==', type)
      .where('groupKey', '==', groupKey)
      .where('isGrouped', '==', true)
      .where('createdAt', '>=', Timestamp.fromDate(timeThreshold))
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const groupDoc = snapshot.docs[0];
      return {
        id: groupDoc.id,
        ...groupDoc.data(),
      } as Notification;
    }

    return null;
  } catch (error) {
    console.error('[NotificationGrouping] Error finding existing group:', error);
    return null;
  }
}

/**
 * Add notification to existing group
 */
export async function addToGroup(
  groupNotificationId: string,
  groupData: Notification,
  newNotification: Omit<Notification, 'id'>
): Promise<void> {
  try {
    const groupDocRef = adminDb.collection('notifications').doc(groupNotificationId);
    const currentCount = groupData.groupCount || 1;
    const groupedActors = groupData.groupedNotifications || [];

    // Check if we've reached max group size
    if (currentCount >= GROUPING_CONFIG.MAX_GROUP_SIZE) {
      console.log('[NotificationGrouping] Group is full, cannot add more');
      return;
    }

    // Update group notification
    await groupDocRef.update({
      groupCount: currentCount + 1,
      groupedNotifications: [...groupedActors, newNotification.actorId || 'unknown'],
      updatedAt: FieldValue.serverTimestamp(),
      read: false, // Mark as unread when new notification added
      // Update title/body to reflect multiple actors
      title: generateGroupTitle(newNotification.type, currentCount + 1),
      body: generateGroupBody(
        newNotification.type,
        [...groupedActors, newNotification.actorName || 'Someone'],
        currentCount + 1,
        groupData.metadata
      ),
    });

    console.log('[NotificationGrouping] Added to group:', {
      groupId: groupNotificationId,
      newCount: currentCount + 1,
    });
  } catch (error) {
    console.error('[NotificationGrouping] Error adding to group:', error);
    throw error;
  }
}

/**
 * Create a new group notification
 */
export async function createGroupNotification(
  notification: Omit<Notification, 'id'>
): Promise<string> {
  try {
    const groupKey = generateGroupKey(
      notification.type,
      notification.groupId,
      notification.userId
    );

    const groupNotification = {
      ...notification,
      isGrouped: true,
      groupKey,
      groupCount: 1,
      groupedNotifications: [notification.actorId || 'unknown'],
      createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb
      .collection('notifications')
      .add(withoutUndefined(groupNotification));
    
    console.log('[NotificationGrouping] Created group notification:', {
      id: docRef.id,
      type: notification.type,
    });

    return docRef.id;
  } catch (error) {
    console.error('[NotificationGrouping] Error creating group:', error);
    throw error;
  }
}

/**
 * Generate title for grouped notification
 */
function generateGroupTitle(type: NotificationType, count: number): string {
  switch (type) {
    case 'group_expense_added':
      return count === 1 ? 'New expense added' : `${count} new expenses added`;
    case 'group_member_joined':
      return count === 1 ? 'New member joined' : `${count} new members joined`;
    default:
      return count === 1 ? 'New notification' : `${count} new notifications`;
  }
}

/**
 * Generate body text for grouped notification
 */
function generateGroupBody(
  type: NotificationType,
  actors: string[],
  count: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  metadata?: Record<string, unknown>
): string {
  const uniqueActors = [...new Set(actors)].slice(-3); // Last 3 unique actors
  
  if (count === 1) {
    // Single notification
    return `${uniqueActors[0]} added an expense`;
  }

  if (uniqueActors.length === 1) {
    // All from same actor
    return `${uniqueActors[0]} added ${count} expenses`;
  }

  // Multiple actors
  const othersCount = count - uniqueActors.length;
  const actorsList = uniqueActors.slice(0, 2).join(', ');
  
  if (othersCount > 0) {
    return `${actorsList} and ${othersCount} other${othersCount > 1 ? 's' : ''} added expenses`;
  }

  return `${actorsList} and ${uniqueActors[uniqueActors.length - 1]} added expenses`;
}

/**
 * Process notification for grouping
 * Returns notification ID if created, null if grouped into existing
 */
export async function processNotificationGrouping(
  notification: Omit<Notification, 'id'>
): Promise<string | null> {
  // Check if this type should be grouped
  if (!isGroupable(notification.type)) {
    return null; // Let caller create normal notification
  }

  // Find existing group
  const existingGroup = await findExistingGroup(
    notification.userId,
    notification.type,
    notification.groupId
  );

  if (existingGroup) {
    // Add to existing group
    await addToGroup(existingGroup.id!, existingGroup, notification);
    return null; // No new notification created
  }

  // Create new group
  return await createGroupNotification(notification);
}

