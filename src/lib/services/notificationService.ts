/**
 * NotificationService
 * 
 * Core service for creating and managing notifications.
 * Handles preference checking, quiet hours, and notification creation.
 */

import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Notification,
  NotificationType,
  NotificationPreferences,
  NotificationPriority,
  NotificationCategory,
  NotificationAction
} from '@/lib/types/notifications';

/**
 * Data for creating a notification
 */
export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  priority?: NotificationPriority;
  category: NotificationCategory;
  actions?: NotificationAction[];
  actionUrl?: string;
  relatedId?: string;
  relatedType?: 'expense' | 'group' | 'budget' | 'member';
  groupId?: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  metadata?: Record<string, unknown>;
}

/**
 * NotificationService class
 * 
 * Provides methods to create notifications with preference checking.
 */
export class NotificationService {
  /**
   * Create a notification
   * 
   * @param data - Notification data
   * @returns Notification ID if created, null if preferences prevented creation
   */
  static async create(data: CreateNotificationData): Promise<string | null> {
    try {
      // Check if user has preferences
      const prefsDoc = await getDoc(doc(db, 'notificationPreferences', data.userId));
      
      if (prefsDoc.exists()) {
        const prefs = prefsDoc.data() as NotificationPreferences;
        
        // Check if notifications are enabled globally
        if (!prefs.enabled) {
          console.log('[NotificationService] Notifications disabled for user:', data.userId);
          return null;
        }

        // Check if this notification type is enabled
        const typePrefs = prefs.types?.[data.type];
        if (!typePrefs || !typePrefs.inApp) {
          console.log('[NotificationService] Notification type disabled:', data.type);
          return null;
        }

        // Check quiet hours (skip for critical notifications)
        if (data.priority !== 'critical' && !this.shouldDeliverNow(data.priority, prefs)) {
          console.log('[NotificationService] In quiet hours or DND, skipping notification');
          // TODO: Queue for later delivery
          return null;
        }
      }

      // Create the notification
      const notification: Omit<Notification, 'id'> = {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        icon: data.icon,
        priority: data.priority || 'medium',
        category: data.category,
        read: false,
        delivered: false,
        isGrouped: false,
        actions: data.actions,
        actionUrl: data.actionUrl,
        relatedId: data.relatedId,
        relatedType: data.relatedType,
        groupId: data.groupId,
        actorId: data.actorId,
        actorName: data.actorName,
        actorAvatar: data.actorAvatar,
        createdAt: serverTimestamp() as Timestamp,
        metadata: data.metadata,
      };

      const docRef = await addDoc(collection(db, 'notifications'), notification);
      
      console.log('[NotificationService] Notification created:', {
        id: docRef.id,
        type: data.type,
        userId: data.userId
      });

      // TODO: Send push notification if enabled (Phase 5)
      // if (typePrefs?.push && prefs.pushEnabled) {
      //   await this.sendPush(data.userId, { ...notification, id: docRef.id });
      // }

      return docRef.id;
    } catch (error) {
      console.error('[NotificationService] Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create multiple notifications at once (batch)
   * 
   * @param notifications - Array of notification data
   * @returns Array of created notification IDs
   */
  static async createBatch(notifications: CreateNotificationData[]): Promise<(string | null)[]> {
    const promises = notifications.map(notification => this.create(notification));
    return Promise.all(promises);
  }

  /**
   * Check if notification should be delivered now based on quiet hours and DND
   * 
   * @param priority - Notification priority
   * @param prefs - User preferences
   * @returns true if should deliver now
   */
  private static shouldDeliverNow(
    priority: NotificationPriority | undefined,
    prefs: NotificationPreferences
  ): boolean {
    // Critical notifications always deliver
    if (priority === 'critical') {
      return true;
    }

    // Check DND mode
    if (prefs.dnd?.enabled) {
      if (prefs.dnd.until) {
        const now = Timestamp.now();
        if (now.toMillis() < prefs.dnd.until.toMillis()) {
          return false; // Still in DND period
        }
      }
    }

    // Check quiet hours
    if (prefs.quietHours?.enabled) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      const [startHour, startMin] = prefs.quietHours.start.split(':').map(Number);
      const [endHour, endMin] = prefs.quietHours.end.split(':').map(Number);

      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (startTime < endTime) {
        // Normal case: e.g., 22:00 to 08:00 next day
        if (currentTime >= startTime && currentTime < endTime) {
          return false; // In quiet hours
        }
      } else {
        // Spans midnight: e.g., 22:00 to 02:00
        if (currentTime >= startTime || currentTime < endTime) {
          return false; // In quiet hours
        }
      }
    }

    return true;
  }

  /**
   * Helper: Create group expense notification
   */
  static async createGroupExpenseNotification(params: {
    userId: string;
    groupId: string;
    groupName: string;
    expenseId: string;
    vendor: string;
    amount: number;
    actorId: string;
    actorName: string;
    actorAvatar?: string;
  }): Promise<string | null> {
    return this.create({
      userId: params.userId,
      type: NotificationType.GROUP_EXPENSE_ADDED,
      title: 'New expense added',
      body: `${params.actorName} added $${params.amount.toFixed(2)} at ${params.vendor}`,
      icon: '💰',
      priority: 'medium',
      category: 'group',
      actionUrl: `/groups/${params.groupId}`,
      relatedId: params.expenseId,
      relatedType: 'expense',
      groupId: params.groupId,
      actorId: params.actorId,
      actorName: params.actorName,
      actorAvatar: params.actorAvatar,
      metadata: {
        groupName: params.groupName,
        vendor: params.vendor,
        amount: params.amount,
      },
    });
  }

  /**
   * Helper: Create group invitation notification
   */
  static async createGroupInvitationNotification(params: {
    userId: string;
    groupId: string;
    groupName: string;
    groupIcon: string;
    inviterId: string;
    inviterName: string;
    inviterAvatar?: string;
  }): Promise<string | null> {
    return this.create({
      userId: params.userId,
      type: NotificationType.GROUP_INVITATION,
      title: 'Group invitation',
      body: `${params.inviterName} invited you to join ${params.groupIcon} ${params.groupName}`,
      icon: '📨',
      priority: 'high',
      category: 'group',
      actions: [
        {
          id: 'accept',
          label: 'Accept',
          variant: 'primary',
          action: 'accept_group_invitation',
        },
        {
          id: 'decline',
          label: 'Decline',
          variant: 'default',
          action: 'decline_group_invitation',
        },
      ],
      actionUrl: `/groups/${params.groupId}`,
      relatedId: params.groupId,
      relatedType: 'group',
      groupId: params.groupId,
      actorId: params.inviterId,
      actorName: params.inviterName,
      actorAvatar: params.inviterAvatar,
      metadata: {
        groupName: params.groupName,
        groupIcon: params.groupIcon,
      },
    });
  }

  /**
   * Helper: Create member joined notification
   */
  static async createMemberJoinedNotification(params: {
    userId: string;
    groupId: string;
    groupName: string;
    memberId: string;
    memberName: string;
    memberAvatar?: string;
  }): Promise<string | null> {
    return this.create({
      userId: params.userId,
      type: NotificationType.GROUP_MEMBER_JOINED,
      title: 'New member joined',
      body: `${params.memberName} joined ${params.groupName}`,
      icon: '👋',
      priority: 'low',
      category: 'group',
      actionUrl: `/groups/${params.groupId}/members`,
      relatedId: params.memberId,
      relatedType: 'member',
      groupId: params.groupId,
      actorId: params.memberId,
      actorName: params.memberName,
      actorAvatar: params.memberAvatar,
      metadata: {
        groupName: params.groupName,
      },
    });
  }

  /**
   * Helper: Create budget warning notification
   */
  static async createBudgetWarningNotification(params: {
    userId: string;
    budgetId: string;
    category: string;
    percentage: number;
    current: number;
    limit: number;
    isGroupBudget?: boolean;
    groupId?: string;
    groupName?: string;
  }): Promise<string | null> {
    const title = params.isGroupBudget
      ? `${params.groupName} budget warning`
      : 'Budget warning';

    const body = params.isGroupBudget
      ? `${params.groupName} has used ${params.percentage}% of ${params.category} budget ($${params.current}/$${params.limit})`
      : `You've used ${params.percentage}% of your ${params.category} budget ($${params.current}/$${params.limit})`;

    return this.create({
      userId: params.userId,
      type: NotificationType.BUDGET_WARNING,
      title,
      body,
      icon: '⚠️',
      priority: 'high',
      category: 'budget',
      actionUrl: '/budgets',
      relatedId: params.budgetId,
      relatedType: 'budget',
      groupId: params.groupId,
      metadata: {
        category: params.category,
        percentage: params.percentage,
        current: params.current,
        limit: params.limit,
        isGroupBudget: params.isGroupBudget,
        groupName: params.groupName,
      },
    });
  }

  /**
   * Helper: Create budget exceeded notification
   */
  static async createBudgetExceededNotification(params: {
    userId: string;
    budgetId: string;
    category: string;
    percentage: number;
    current: number;
    limit: number;
    overage: number;
    isGroupBudget?: boolean;
    groupId?: string;
    groupName?: string;
  }): Promise<string | null> {
    const title = params.isGroupBudget
      ? `${params.groupName} budget exceeded`
      : 'Budget exceeded';

    const body = params.isGroupBudget
      ? `${params.groupName} exceeded ${params.category} budget by $${params.overage} (${params.percentage}%)`
      : `You've exceeded your ${params.category} budget by $${params.overage} (${params.percentage}%)`;

    return this.create({
      userId: params.userId,
      type: NotificationType.BUDGET_EXCEEDED,
      title,
      body,
      icon: '❌',
      priority: 'critical',
      category: 'budget',
      actionUrl: '/budgets',
      relatedId: params.budgetId,
      relatedType: 'budget',
      groupId: params.groupId,
      metadata: {
        category: params.category,
        percentage: params.percentage,
        current: params.current,
        limit: params.limit,
        overage: params.overage,
        isGroupBudget: params.isGroupBudget,
        groupName: params.groupName,
      },
    });
  }
}

