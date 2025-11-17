/**
 * Notification System Types
 * 
 * Defines all TypeScript interfaces and types for the notification system.
 * Based on NOTIFICATION_SYSTEM_DESIGN.md
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Notification Types Enum
 * Covers all possible notification types in the system
 */
export enum NotificationType {
  // Group Activity
  GROUP_EXPENSE_ADDED = 'group_expense_added',
  GROUP_INVITATION = 'group_invitation',
  GROUP_MEMBER_JOINED = 'group_member_joined',
  GROUP_MEMBER_LEFT = 'group_member_left',
  GROUP_ROLE_CHANGED = 'group_role_changed',
  GROUP_SETTINGS_CHANGED = 'group_settings_changed',
  
  // Budget Alerts
  BUDGET_WARNING = 'budget_warning',           // 75%
  BUDGET_CRITICAL = 'budget_critical',         // 90%
  BUDGET_EXCEEDED = 'budget_exceeded',         // >100%
  BUDGET_RESET = 'budget_reset',               // Monthly reset
  
  // System
  WEEKLY_SUMMARY = 'weekly_summary',
  MONTHLY_SUMMARY = 'monthly_summary',
  RECEIPTS_UNCATEGORIZED = 'receipts_uncategorized',
  
  // Social (Future)
  COMMENT_ADDED = 'comment_added',
  EXPENSE_SPLIT_REQUEST = 'expense_split_request',
}

/**
 * Priority Levels
 */
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Notification Categories
 */
export type NotificationCategory = 'group' | 'budget' | 'system' | 'social';

/**
 * Frequency Options
 */
export type NotificationFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never';

/**
 * Notification Action
 * Defines actionable buttons within a notification
 */
export interface NotificationAction {
  id: string;                                  // e.g., 'accept', 'decline', 'view'
  label: string;                               // Button text
  url?: string;                                // Navigation URL
  action?: string;                             // API action to call
  variant?: 'default' | 'primary' | 'danger'; // Button style
}

/**
 * Core Notification Interface
 * Represents a single notification in the system
 */
export interface Notification {
  id: string;                                  // Auto-generated Firestore ID
  userId: string;                              // Recipient user ID
  type: NotificationType;                      // Notification type
  title: string;                               // Notification title
  body: string;                                // Notification body text
  icon?: string;                               // Icon/emoji
  
  // Metadata
  priority: NotificationPriority;              // Priority level
  category: NotificationCategory;              // Category
  
  // Status
  read: boolean;                               // Has user read this?
  readAt?: Timestamp;                          // When was it read?
  delivered: boolean;                          // Was push delivered?
  deliveredAt?: Timestamp;                     // When was push sent?
  
  // Actions
  actions?: NotificationAction[];              // Actionable buttons
  actionUrl?: string;                          // Default click action
  
  // Related data
  relatedId?: string;                          // Related expense/group/budget ID
  relatedType?: 'expense' | 'group' | 'budget' | 'member';
  groupId?: string;                            // If group-related
  
  // Grouping
  isGrouped: boolean;                          // Is this part of a group?
  groupKey?: string;                           // Grouping identifier
  groupCount?: number;                         // Number in group
  groupedNotifications?: string[];             // IDs of grouped notifications
  
  // Actor (who triggered this)
  actorId?: string;                            // User who triggered
  actorName?: string;                          // Actor's display name
  actorAvatar?: string;                        // Actor's avatar URL
  
  // Timestamps
  createdAt: Timestamp;
  expiresAt?: Timestamp;                       // Auto-delete after this
  
  // Metadata
  metadata?: Record<string, unknown>;          // Flexible extra data
}

/**
 * Notification Type Preferences
 * User preferences for each notification type
 */
export interface NotificationTypePreference {
  inApp: boolean;                              // Show in notification center
  push: boolean;                               // Send push notification
  email: boolean;                              // Include in email digest
  frequency: NotificationFrequency;            // Delivery frequency
  priority: NotificationPriority;              // Priority level
}

/**
 * Group-Specific Notification Preferences
 */
export interface GroupNotificationPreference {
  enabled: boolean;                            // Receive notifications for this group
  frequency: NotificationFrequency;            // Delivery frequency
  expenseNotifications: boolean;               // New expenses
  memberNotifications: boolean;                // Member activity
  budgetNotifications: boolean;                // Budget alerts
  priority: NotificationPriority;              // Priority level
}

/**
 * Quiet Hours Configuration
 */
export interface QuietHours {
  enabled: boolean;
  start: string;                               // "22:00" (24h format)
  end: string;                                 // "08:00"
  timezone: string;                            // "America/Toronto"
}

/**
 * Do Not Disturb Configuration
 */
export interface DNDConfig {
  enabled: boolean;
  until?: Timestamp;                           // Temporary DND until this time
}

/**
 * Digest Settings
 */
export interface DigestSettings {
  daily: {
    enabled: boolean;
    time: string;                              // "08:00"
    days: string[];                            // ["monday", "tuesday", ...]
  };
  weekly: {
    enabled: boolean;
    day: string;                               // "monday"
    time: string;                              // "09:00"
  };
  monthly: {
    enabled: boolean;
    day: number;                               // 1-28
    time: string;                              // "09:00"
  };
}

/**
 * Complete Notification Preferences
 * User's notification settings
 */
export interface NotificationPreferences {
  userId: string;
  
  // Global settings
  enabled: boolean;                            // Master switch
  pushEnabled: boolean;                        // PWA push notifications
  emailEnabled: boolean;                       // Email notifications
  
  // Quiet hours
  quietHours: QuietHours;
  
  // Do Not Disturb
  dnd: DNDConfig;
  
  // Per-type preferences
  types: Record<NotificationType, NotificationTypePreference>;
  
  // Per-group settings
  groups: Record<string, GroupNotificationPreference>;
  
  // Digest settings
  digests: DigestSettings;
  
  // Advanced
  groupingEnabled: boolean;                    // Smart grouping
  soundEnabled: boolean;                       // Notification sounds
  badgeCount: boolean;                         // Show unread count
  
  // Metadata
  lastUpdated: Timestamp;
  createdAt: Timestamp;
}

/**
 * Push Subscription
 * PWA push notification subscription details
 */
export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;                            // Push service endpoint
  keys: {
    p256dh: string;                            // Public key
    auth: string;                              // Auth secret
  };
  
  // Device info
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;                             // "Chrome", "Firefox", etc.
  os: string;                                  // "Windows", "Android", etc.
  
  // Status
  active: boolean;
  lastUsed: Timestamp;
  failureCount: number;                        // Failed delivery attempts
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Notification Group
 * For grouping similar notifications together
 */
export interface NotificationGroup {
  groupKey: string;                            // e.g., "group_expense_added_groupId_20251117"
  userId: string;
  type: NotificationType;
  relatedId: string;                           // groupId, budgetId, etc.
  
  notifications: string[];                     // Array of notification IDs
  count: number;                               // Total in group
  
  // Display
  summary: string;                             // "3 new expenses in Family Group"
  actors: Array<{                              // Who triggered these
    userId: string;
    name: string;
    avatar?: string;
  }>;
  
  // Status
  read: boolean;
  
  // Timestamps
  firstAt: Timestamp;                          // First notification
  lastAt: Timestamp;                           // Most recent
  expiresAt: Timestamp;                        // Auto-cleanup
}

/**
 * Default Notification Preferences
 * Used when creating preferences for new users
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'userId' | 'createdAt' | 'lastUpdated'> = {
  enabled: true,
  pushEnabled: true,
  emailEnabled: false,
  
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  
  dnd: {
    enabled: false,
  },
  
  types: {
    // Group Activity
    [NotificationType.GROUP_EXPENSE_ADDED]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'medium',
    },
    [NotificationType.GROUP_INVITATION]: {
      inApp: true,
      push: true,
      email: true,
      frequency: 'realtime',
      priority: 'high',
    },
    [NotificationType.GROUP_MEMBER_JOINED]: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
    [NotificationType.GROUP_MEMBER_LEFT]: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
    [NotificationType.GROUP_ROLE_CHANGED]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'high',
    },
    [NotificationType.GROUP_SETTINGS_CHANGED]: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
    
    // Budget Alerts
    [NotificationType.BUDGET_WARNING]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'high',
    },
    [NotificationType.BUDGET_CRITICAL]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'critical',
    },
    [NotificationType.BUDGET_EXCEEDED]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'critical',
    },
    [NotificationType.BUDGET_RESET]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'medium',
    },
    
    // System
    [NotificationType.WEEKLY_SUMMARY]: {
      inApp: false,
      push: false,
      email: false,
      frequency: 'never',
      priority: 'low',
    },
    [NotificationType.MONTHLY_SUMMARY]: {
      inApp: false,
      push: false,
      email: false,
      frequency: 'never',
      priority: 'low',
    },
    [NotificationType.RECEIPTS_UNCATEGORIZED]: {
      inApp: false,
      push: false,
      email: false,
      frequency: 'never',
      priority: 'low',
    },
    
    // Social (Future)
    [NotificationType.COMMENT_ADDED]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'medium',
    },
    [NotificationType.EXPENSE_SPLIT_REQUEST]: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'high',
    },
  },
  
  groups: {},
  
  digests: {
    daily: {
      enabled: false,
      time: "08:00",
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    },
    weekly: {
      enabled: false,
      day: "monday",
      time: "09:00",
    },
    monthly: {
      enabled: false,
      day: 1,
      time: "09:00",
    },
  },
  
  groupingEnabled: true,
  soundEnabled: true,
  badgeCount: true,
};

