/**
 * Budget Notification Service
 * 
 * Handles budget threshold notifications (75%, 90%, 100%)
 * Tracks which thresholds have been crossed to avoid duplicate notifications
 */

import { NotificationService } from './notificationService';
import { getBudgetStatus, calculateSimpleBudgetUsage } from '../budgetCalculations';
import { adminDb } from '../firebase-admin';
import { NotificationType } from '../types/notifications';
import { Timestamp } from 'firebase-admin/firestore';

interface BudgetThreshold {
  percentage: number;
  triggered: boolean;
  triggeredAt?: Timestamp;
}

interface BudgetNotificationTracker {
  budgetId: string;
  userId: string;
  category: string;
  period: {
    month: number;
    year: number;
  };
  thresholds: {
    warning: BudgetThreshold;      // 75%
    critical: BudgetThreshold;     // 90%
    exceeded: BudgetThreshold;     // 100%
  };
  lastChecked: Timestamp;
}

export class BudgetNotificationService {
  /**
   * Check budget after expense is added and trigger notifications if needed
   */
  static async checkAndNotify(params: {
    budgetId: string;
    userId: string;
    category: string;
    totalSpent: number;
    budgetLimit: number;
    period: { month: number; year: number };
    isGroupBudget?: boolean;
    groupId?: string;
    groupName?: string;
    groupMembers?: string[]; // Array of user IDs for group budgets
  }): Promise<void> {
    try {
      const { totalSpent, budgetLimit, isGroupBudget, groupMembers } = params;

      // Calculate current usage
      const usage = calculateSimpleBudgetUsage(budgetLimit, totalSpent);
      const percentage = Math.round(usage.percentageUsed);

      // Get or create tracker
      const tracker = await this.getOrCreateTracker(params);

      // Determine which notifications to send
      const notifications: Array<'warning' | 'critical' | 'exceeded'> = [];

      // Check 75% threshold (warning)
      if (percentage >= 75 && !tracker.thresholds.warning.triggered) {
        notifications.push('warning');
      }

      // Check 90% threshold (critical)
      if (percentage >= 90 && !tracker.thresholds.critical.triggered) {
        notifications.push('critical');
      }

      // Check 100% threshold (exceeded)
      if (percentage >= 100 && !tracker.thresholds.exceeded.triggered) {
        notifications.push('exceeded');
      }

      // Send notifications
      if (notifications.length > 0) {
        console.log(`[BudgetNotifications] Triggering ${notifications.join(', ')} for budget ${params.budgetId}`);
        
        // Create usage object with budgetLimit
        const usageWithLimit = {
          ...usage,
          budgetLimit,
        };

        if (isGroupBudget && groupMembers) {
          // Send to all group members
          await this.sendToGroupMembers(
            groupMembers,
            notifications,
            params,
            usageWithLimit
          );
        } else {
          // Send to user
          await this.sendToUser(
            params.userId,
            notifications,
            params,
            usageWithLimit
          );
        }

        // Update tracker
        await this.updateTracker(params.budgetId, notifications);
      }
    } catch (error) {
      console.error('[BudgetNotifications] Error checking budget:', error);
      // Don't throw - notifications shouldn't break expense creation
    }
  }

  /**
   * Get or create budget notification tracker
   */
  private static async getOrCreateTracker(params: {
    budgetId: string;
    userId: string;
    category: string;
    period: { month: number; year: number };
  }): Promise<BudgetNotificationTracker> {
    const trackerId = `${params.budgetId}_${params.period.year}_${params.period.month}`;
    const trackerRef = adminDb.collection('budgetNotificationTrackers').doc(trackerId);
    const trackerDoc = await trackerRef.get();

    if (trackerDoc.exists) {
      return trackerDoc.data() as BudgetNotificationTracker;
    }

    // Create new tracker
    const newTracker: BudgetNotificationTracker = {
      budgetId: params.budgetId,
      userId: params.userId,
      category: params.category,
      period: params.period,
      thresholds: {
        warning: { percentage: 75, triggered: false },
        critical: { percentage: 90, triggered: false },
        exceeded: { percentage: 100, triggered: false },
      },
      lastChecked: Timestamp.now(),
    };

    await trackerRef.set(newTracker);
    return newTracker;
  }

  /**
   * Update tracker with triggered notifications
   */
  private static async updateTracker(
    budgetId: string,
    notifications: Array<'warning' | 'critical' | 'exceeded'>
  ): Promise<void> {
    const tracker = await this.getTrackerByBudgetId(budgetId);
    if (!tracker) return;

    const trackerId = `${budgetId}_${tracker.period.year}_${tracker.period.month}`;
    const trackerRef = adminDb.collection('budgetNotificationTrackers').doc(trackerId);
    
    const updates: Record<string, unknown> = {
      lastChecked: Timestamp.now(),
    };

    notifications.forEach(type => {
      updates[`thresholds.${type}.triggered`] = true;
      updates[`thresholds.${type}.triggeredAt`] = Timestamp.now();
    });

    await trackerRef.update(updates);
  }

  /**
   * Get tracker by budget ID
   */
  private static async getTrackerByBudgetId(budgetId: string): Promise<BudgetNotificationTracker | null> {
    const snapshot = await adminDb
      .collection('budgetNotificationTrackers')
      .where('budgetId', '==', budgetId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as BudgetNotificationTracker;
  }

  /**
   * Send notifications to group members
   */
  private static async sendToGroupMembers(
    memberIds: string[],
    notifications: Array<'warning' | 'critical' | 'exceeded'>,
    params: {
      budgetId: string;
      category: string;
      period: { month: number; year: number };
      isGroupBudget?: boolean;
      groupId?: string;
      groupName?: string;
    },
    usage: {
      totalSpent: number;
      budgetLimit: number;
      percentageUsed: number;
      remainingAmount: number;
    }
  ): Promise<void> {
    const percentage = Math.round(usage.percentageUsed);

    // Send to all members
    await Promise.all(
      memberIds.map(memberId =>
        this.sendToUser(
          memberId,
          notifications,
          {
            budgetId: params.budgetId,
            category: params.category,
            isGroupBudget: params.isGroupBudget,
            groupId: params.groupId,
            groupName: params.groupName,
          },
          usage
        )
      )
    );
  }

  /**
   * Send notifications to a single user
   */
  private static async sendToUser(
    userId: string,
    notifications: Array<'warning' | 'critical' | 'exceeded'>,
    params: {
      budgetId: string;
      category: string;
      isGroupBudget?: boolean;
      groupId?: string;
      groupName?: string;
    },
    usage: {
      totalSpent: number;
      budgetLimit: number;
      percentageUsed: number;
      remainingAmount: number;
    }
  ): Promise<void> {
    const percentage = Math.round(usage.percentageUsed);
    const current = usage.totalSpent;
    const limit = usage.budgetLimit;

    for (const type of notifications) {
      switch (type) {
        case 'warning':
          await NotificationService.createBudgetWarningNotification({
            userId,
            budgetId: params.budgetId,
            category: params.category,
            percentage,
            current,
            limit,
            isGroupBudget: params.isGroupBudget,
            groupId: params.groupId,
            groupName: params.groupName,
          });
          break;

        case 'critical':
          await this.createBudgetCriticalNotification({
            userId,
            budgetId: params.budgetId,
            category: params.category,
            percentage,
            current,
            limit,
            isGroupBudget: params.isGroupBudget,
            groupId: params.groupId,
            groupName: params.groupName,
          });
          break;

        case 'exceeded':
          await NotificationService.createBudgetExceededNotification({
            userId,
            budgetId: params.budgetId,
            category: params.category,
            percentage,
            current,
            limit,
            overage: current - limit,
            isGroupBudget: params.isGroupBudget,
            groupId: params.groupId,
            groupName: params.groupName,
          });
          break;
      }
    }
  }

  /**
   * Create budget critical notification (90%)
   */
  private static async createBudgetCriticalNotification(params: {
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
      ? `${params.groupName} budget critical`
      : 'Budget critical';

    const body = params.isGroupBudget
      ? `🚨 ${params.groupName} has used ${params.percentage}% of ${params.category} budget ($${params.current}/$${params.limit})`
      : `🚨 Critical: You've used ${params.percentage}% of your ${params.category} budget ($${params.current}/$${params.limit})`;

    return NotificationService.create({
      userId: params.userId,
      type: NotificationType.BUDGET_CRITICAL,
      title,
      body,
      icon: '🚨',
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
        isGroupBudget: params.isGroupBudget,
        groupName: params.groupName,
      },
    });
  }

  /**
   * Reset all budget trackers for a new month
   * Should be called on the 1st of each month via cron/cloud function
   */
  static async resetMonthlyTrackers(): Promise<void> {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      console.log(`[BudgetNotifications] Resetting trackers for ${currentYear}-${currentMonth}`);

      // Delete all trackers from previous periods
      const oldTrackers = await adminDb
        .collection('budgetNotificationTrackers')
        .where('period.year', '<', currentYear)
        .get();

      const batch = adminDb.batch();
      oldTrackers.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (oldTrackers.size > 0) {
        await batch.commit();
        console.log(`[BudgetNotifications] Deleted ${oldTrackers.size} old trackers`);
      }
    } catch (error) {
      console.error('[BudgetNotifications] Error resetting trackers:', error);
    }
  }
}

