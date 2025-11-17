# 🔔 Notification System - Complete Design Document

**Version:** 1.0  
**Last Updated:** November 17, 2025  
**Status:** Design Phase

---

## 📋 Table of Contents
1. [Overview & Goals](#overview--goals)
2. [Notification Types](#notification-types)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema](#database-schema)
5. [UI/UX Design](#uiux-design)
6. [Implementation Phases](#implementation-phases)
7. [User Controls & Preferences](#user-controls--preferences)
8. [PWA Push Notifications](#pwa-push-notifications)
9. [Privacy & Security](#privacy--security)
10. [Testing Strategy](#testing-strategy)
11. [Success Metrics](#success-metrics)

---

## 🎯 Overview & Goals

### Vision
Create a comprehensive, non-intrusive notification system that keeps users informed about important activities, budget alerts, and group events while respecting their preferences and avoiding notification fatigue.

### Core Principles
1. **User-Centric**: Users control what, when, and how they receive notifications
2. **Non-Breaking**: Doesn't affect any core functionality
3. **Contextual**: Notifications are relevant and actionable
4. **Grouped**: Related notifications are intelligently grouped
5. **Multi-Channel**: In-app, push, and email notifications
6. **Privacy-First**: User data and preferences are protected

### Key Features
- ✅ In-app notification center with unread badges
- ✅ PWA push notifications for mobile/desktop
- ✅ Smart notification grouping
- ✅ Granular user preferences per notification type
- ✅ Per-group notification settings
- ✅ Quiet hours and Do Not Disturb mode
- ✅ Notification history and management
- ✅ Email digests (optional)
- ✅ Real-time updates via Firestore listeners

---

## 🔔 Notification Types

### 1. Group Activity Notifications

#### 1.1 Expense Notifications
**Trigger:** When someone adds an expense to a shared group

**Data:**
- Who added the expense (user name/avatar)
- Expense details (vendor, amount, category)
- Group name
- Timestamp

**Notification Text:**
- "John Doe added $45.50 at Costco in Family Group"
- "Sarah added 3 new expenses to Office Team"

**Actions:**
- View expense details
- View group
- Dismiss

**Default Settings:**
- Real-time for high-priority groups
- Daily digest for low-priority groups
- OFF for archived groups

#### 1.2 Group Invitation
**Trigger:** When user is invited to join a group

**Data:**
- Who invited them
- Group name and icon
- Member count
- Invitation message (optional)

**Notification Text:**
- "John Doe invited you to join Family Group 👨‍👩‍👧‍👦"
- "You have a pending invitation to Office Team"

**Actions:**
- Accept invitation
- Decline invitation
- View group details

**Default Settings:**
- Always real-time (high priority)
- Push notification enabled
- Email notification enabled

#### 1.3 Member Activity
**Trigger:** Member joins, leaves, or role changes

**Data:**
- Action type (joined, left, role changed)
- User affected
- Group name
- Who made the change (for role changes)

**Notification Text:**
- "Sarah Smith joined Family Group"
- "Mike Johnson left Office Team"
- "John promoted you to Admin in Family Group"

**Actions:**
- View group members
- View group
- Dismiss

**Default Settings:**
- Real-time for admin/owner
- OFF for regular members

#### 1.4 Group Settings Changed
**Trigger:** Group name, icon, or settings updated (admins only)

**Data:**
- What changed
- Who made the change
- Group name

**Notification Text:**
- "John updated Family Group settings"
- "Office Team name was changed to Work Squad"

**Default Settings:**
- Real-time for owner
- Daily digest for admins
- OFF for members

### 2. Budget Notifications

#### 2.1 Budget Warning
**Trigger:** Budget usage reaches 75% threshold

**Data:**
- Category name
- Current usage ($xxx of $yyy)
- Percentage (75%)
- Budget type (personal/group)
- Time remaining in period

**Notification Text:**
- "⚠️ You've used 75% of your Food & Dining budget ($225/$300)"
- "⚠️ Office Team has used 80% of the Transportation budget"

**Actions:**
- View budget details
- Adjust budget
- View category expenses
- Dismiss

**Default Settings:**
- Real-time
- Push notification enabled

#### 2.2 Budget Critical
**Trigger:** Budget usage reaches 90% threshold

**Data:**
- Same as Budget Warning

**Notification Text:**
- "🚨 Critical: 90% of your Groceries budget used ($270/$300)"
- "🚨 Office Team approaching Transportation budget limit (95%)"

**Actions:**
- Same as Budget Warning

**Default Settings:**
- Real-time
- Push notification enabled
- Cannot be disabled

#### 2.3 Budget Exceeded
**Trigger:** Budget usage exceeds 100%

**Data:**
- Category name
- Overage amount
- Budget amount
- Percentage over

**Notification Text:**
- "❌ You've exceeded your Food & Dining budget by $25 (108%)"
- "❌ Family Group exceeded Groceries budget by $50"

**Actions:**
- View budget details
- Adjust budget for next month
- View overage expenses
- Dismiss

**Default Settings:**
- Real-time
- Push notification enabled
- Cannot be disabled

#### 2.4 Budget Reset
**Trigger:** New month starts, budgets reset

**Data:**
- Number of budgets reset
- Previous month summary

**Notification Text:**
- "📊 Monthly budgets reset! Last month: 4/5 budgets on track"
- "🎯 New budget period started. You saved $150 last month!"

**Actions:**
- View budget summary
- Adjust budgets
- Dismiss

**Default Settings:**
- Real-time on 1st of month
- Push notification enabled

### 3. System Notifications

#### 3.1 Weekly Summary
**Trigger:** Every Monday morning (user configurable)

**Data:**
- Total expenses last week
- Top categories
- Budget status
- Comparison to previous week

**Notification Text:**
- "📊 Your weekly summary: $245 spent across 12 expenses"
- "📈 Spending up 15% from last week. Top category: Dining"

**Actions:**
- View detailed report
- View expenses
- Dismiss

**Default Settings:**
- OFF by default
- User can enable with custom day/time

#### 3.2 Monthly Summary
**Trigger:** Last day of month (user configurable)

**Data:**
- Total expenses for month
- Budget performance
- Top categories
- Year-over-year comparison

**Notification Text:**
- "📊 November Summary: $1,245 spent, 4/5 budgets on track"
- "🎉 Great job! You stayed within budget this month"

**Actions:**
- View detailed report
- View trends
- Dismiss

**Default Settings:**
- OFF by default
- User can enable

#### 3.3 Receipts Without Categories
**Trigger:** User uploads receipt but doesn't categorize expense within 24 hours

**Notification Text:**
- "📷 You have 2 uncategorized receipts from this week"

**Default Settings:**
- OFF by default

### 4. Collaborative Notifications

#### 4.1 Comment/Discussion (Future)
**Trigger:** Someone comments on an expense

**Notification Text:**
- "John commented on your Costco expense: 'Was this for the party?'"

**Default Settings:**
- Real-time
- Push enabled

#### 4.2 Expense Split Request (Future)
**Trigger:** Someone requests to split an expense

**Notification Text:**
- "Sarah requested to split the $120 restaurant bill"

**Default Settings:**
- Real-time
- Push enabled

---

## 🏗️ Technical Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├─────────────────────────────────────────────────────────────┤
│  React Components                                            │
│  ├── NotificationBell (Header)                              │
│  ├── NotificationPanel (Dropdown)                           │
│  ├── NotificationPreferences (Settings Page)                │
│  ├── NotificationToast (Inline alerts)                      │
│  └── GroupNotificationSettings (Per-group)                  │
├─────────────────────────────────────────────────────────────┤
│  Hooks & State Management                                   │
│  ├── useNotifications() - Fetch & listen                    │
│  ├── useNotificationPreferences() - User settings           │
│  ├── useNotificationActions() - Mark read, delete, etc.     │
│  └── usePushSubscription() - PWA push management            │
├─────────────────────────────────────────────────────────────┤
│  Service Worker (PWA)                                        │
│  ├── Push notification handler                              │
│  ├── Background sync                                         │
│  └── Notification click handler                             │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Next.js)                      │
├─────────────────────────────────────────────────────────────┤
│  /api/notifications/                                         │
│  ├── GET list - Fetch user notifications                    │
│  ├── POST mark-read - Mark as read                          │
│  ├── POST mark-all-read - Mark all as read                  │
│  ├── DELETE [id] - Delete notification                      │
│  └── POST clear-all - Clear all read notifications          │
├─────────────────────────────────────────────────────────────┤
│  /api/notifications/preferences/                            │
│  ├── GET - Fetch user preferences                           │
│  ├── PUT - Update preferences                               │
│  └── POST group/[id] - Update group-specific settings       │
├─────────────────────────────────────────────────────────────┤
│  /api/notifications/push/                                    │
│  ├── POST subscribe - Register push subscription            │
│  ├── POST unsubscribe - Remove push subscription            │
│  └── POST test - Send test notification                     │
├─────────────────────────────────────────────────────────────┤
│  Background Services                                         │
│  ├── NotificationService - Create notifications             │
│  ├── PushService - Send push notifications                  │
│  ├── DigestService - Generate daily/weekly digests          │
│  └── GroupingService - Intelligent grouping                 │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                  Database Layer (Firestore)                  │
├─────────────────────────────────────────────────────────────┤
│  Collections:                                                │
│  ├── notifications/ - User notifications                    │
│  ├── notificationPreferences/ - User settings               │
│  ├── pushSubscriptions/ - PWA push tokens                   │
│  └── notificationTemplates/ - Reusable templates            │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│              External Services (Optional)                    │
├─────────────────────────────────────────────────────────────┤
│  ├── Web Push Service (VAPID)                               │
│  ├── Email Service (SendGrid/Resend) - For email digests    │
│  └── Analytics (Track engagement)                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Notification Creation Flow
```typescript
1. Event occurs (e.g., expense added)
2. Trigger function detects event
3. Check notification preferences for affected users
4. Group with similar recent notifications (if applicable)
5. Create notification document in Firestore
6. Send push notification (if enabled & subscribed)
7. Real-time listener updates UI for online users
```

#### 2. Real-Time Updates
- Use Firestore `onSnapshot` listeners
- Listen only for current user's notifications
- Efficient querying with composite indexes
- Unsubscribe when component unmounts

#### 3. Notification Grouping
**Smart Grouping Rules:**
- Same type + same source + within 1 hour → Group
- Max 10 notifications per group
- Show "John and 3 others added expenses"
- Expand to see individual notifications

**Example:**
```
Instead of:
- John added expense in Family Group
- Sarah added expense in Family Group
- Mike added expense in Family Group

Show:
- 3 new expenses in Family Group (John, Sarah, Mike)
```

---

## 💾 Database Schema

### Collection: `notifications`

**Document Path:** `/notifications/{notificationId}`

```typescript
interface Notification {
  id: string;                          // Auto-generated
  userId: string;                      // Recipient user ID
  type: NotificationType;              // See enum below
  title: string;                       // Notification title
  body: string;                        // Notification body text
  icon?: string;                       // Icon/emoji
  
  // Metadata
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'group' | 'budget' | 'system' | 'social';
  
  // Status
  read: boolean;                       // Has user read this?
  readAt?: Timestamp;                  // When was it read?
  delivered: boolean;                  // Was push delivered?
  deliveredAt?: Timestamp;             // When was push sent?
  
  // Actions
  actions?: NotificationAction[];      // Actionable buttons
  actionUrl?: string;                  // Default click action
  
  // Related data
  relatedId?: string;                  // Related expense/group/budget ID
  relatedType?: 'expense' | 'group' | 'budget' | 'member';
  groupId?: string;                    // If group-related
  
  // Grouping
  isGrouped: boolean;                  // Is this part of a group?
  groupKey?: string;                   // Grouping identifier
  groupCount?: number;                 // Number in group
  groupedNotifications?: string[];     // IDs of grouped notifications
  
  // Actor (who triggered this)
  actorId?: string;                    // User who triggered
  actorName?: string;                  // Actor's display name
  actorAvatar?: string;                // Actor's avatar URL
  
  // Timestamps
  createdAt: Timestamp;
  expiresAt?: Timestamp;               // Auto-delete after this
  
  // Metadata
  metadata?: Record<string, any>;      // Flexible extra data
}

// Notification Types Enum
enum NotificationType {
  // Group
  GROUP_EXPENSE_ADDED = 'group_expense_added',
  GROUP_INVITATION = 'group_invitation',
  GROUP_MEMBER_JOINED = 'group_member_joined',
  GROUP_MEMBER_LEFT = 'group_member_left',
  GROUP_ROLE_CHANGED = 'group_role_changed',
  GROUP_SETTINGS_CHANGED = 'group_settings_changed',
  
  // Budget
  BUDGET_WARNING = 'budget_warning',              // 75%
  BUDGET_CRITICAL = 'budget_critical',            // 90%
  BUDGET_EXCEEDED = 'budget_exceeded',            // >100%
  BUDGET_RESET = 'budget_reset',                  // Monthly reset
  
  // System
  WEEKLY_SUMMARY = 'weekly_summary',
  MONTHLY_SUMMARY = 'monthly_summary',
  RECEIPTS_UNCATEGORIZED = 'receipts_uncategorized',
  
  // Social (Future)
  COMMENT_ADDED = 'comment_added',
  EXPENSE_SPLIT_REQUEST = 'expense_split_request',
}

// Notification Actions
interface NotificationAction {
  id: string;                          // e.g., 'accept', 'decline', 'view'
  label: string;                       // Button text
  url?: string;                        // Navigation URL
  action?: string;                     // API action to call
  variant?: 'default' | 'primary' | 'danger';
}
```

**Firestore Indexes:**
```javascript
// Composite indexes needed:
1. userId + read + createdAt (desc)
2. userId + groupId + createdAt (desc)
3. userId + type + createdAt (desc)
4. userId + category + read + createdAt (desc)
5. expiresAt (for cleanup)
```

### Collection: `notificationPreferences`

**Document Path:** `/notificationPreferences/{userId}`

```typescript
interface NotificationPreferences {
  userId: string;
  
  // Global settings
  enabled: boolean;                    // Master switch
  pushEnabled: boolean;                // PWA push notifications
  emailEnabled: boolean;               // Email notifications
  
  // Quiet hours
  quietHours: {
    enabled: boolean;
    start: string;                     // "22:00" (24h format)
    end: string;                       // "08:00"
    timezone: string;                  // "America/Toronto"
  };
  
  // Do Not Disturb
  dnd: {
    enabled: boolean;
    until?: Timestamp;                 // Temporary DND
  };
  
  // Per-type preferences
  types: {
    [key in NotificationType]: {
      inApp: boolean;                  // Show in notification center
      push: boolean;                   // Send push notification
      email: boolean;                  // Include in email digest
      frequency: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'never';
      priority: 'low' | 'medium' | 'high';
    };
  };
  
  // Per-group settings
  groups: {
    [groupId: string]: {
      enabled: boolean;                // Receive notifications for this group
      frequency: 'realtime' | 'hourly' | 'daily' | 'never';
      expenseNotifications: boolean;   // New expenses
      memberNotifications: boolean;    // Member activity
      budgetNotifications: boolean;    // Budget alerts
      priority: 'low' | 'medium' | 'high';
    };
  };
  
  // Digest settings
  digests: {
    daily: {
      enabled: boolean;
      time: string;                    // "08:00"
      days: string[];                  // ["monday", "tuesday", ...]
    };
    weekly: {
      enabled: boolean;
      day: string;                     // "monday"
      time: string;                    // "09:00"
    };
    monthly: {
      enabled: boolean;
      day: number;                     // 1-28
      time: string;                    // "09:00"
    };
  };
  
  // Advanced
  groupingEnabled: boolean;            // Smart grouping
  soundEnabled: boolean;               // Notification sounds
  badgeCount: boolean;                 // Show unread count
  
  // Metadata
  lastUpdated: Timestamp;
  createdAt: Timestamp;
}
```

### Collection: `pushSubscriptions`

**Document Path:** `/pushSubscriptions/{subscriptionId}`

```typescript
interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;                    // Push service endpoint
  keys: {
    p256dh: string;                    // Public key
    auth: string;                      // Auth secret
  };
  
  // Device info
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;                     // "Chrome", "Firefox", etc.
  os: string;                          // "Windows", "Android", etc.
  
  // Status
  active: boolean;
  lastUsed: Timestamp;
  failureCount: number;                // Failed delivery attempts
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `notificationGroups` (for grouping logic)

**Document Path:** `/notificationGroups/{groupKey}`

```typescript
interface NotificationGroup {
  groupKey: string;                    // e.g., "group_expense_added_groupId_20251117"
  userId: string;
  type: NotificationType;
  relatedId: string;                   // groupId, budgetId, etc.
  
  notifications: string[];             // Array of notification IDs
  count: number;                       // Total in group
  
  // Display
  summary: string;                     // "3 new expenses in Family Group"
  actors: Array<{                      // Who triggered these
    userId: string;
    name: string;
    avatar?: string;
  }>;
  
  // Status
  read: boolean;
  
  // Timestamps
  firstAt: Timestamp;                  // First notification
  lastAt: Timestamp;                   // Most recent
  expiresAt: Timestamp;                // Auto-cleanup
}
```

---

## 🎨 UI/UX Design

### 1. Notification Bell (Header)

**Location:** App header (right side, next to profile)

**Design:**
```tsx
<Button variant="ghost" size="icon" className="relative">
  <Bell className="h-5 w-5" />
  {unreadCount > 0 && (
    <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500">
      {unreadCount > 99 ? '99+' : unreadCount}
    </Badge>
  )}
</Button>
```

**States:**
- Default: Grey bell icon
- Has unread: Red badge with count
- Animates when new notification arrives (subtle pulse)
- Opens notification panel on click

**Accessibility:**
- ARIA label: "Notifications, X unread"
- Keyboard accessible (Tab + Enter)
- Screen reader announces new notifications

### 2. Notification Panel (Dropdown)

**Design:** Dropdown panel from bell icon

**Layout:**
```
┌─────────────────────────────────────┐
│ Notifications            [⚙️] [✓]   │ ← Header with Settings & Mark All Read
├─────────────────────────────────────┤
│ 🗂️ Tabs: All | Groups | Budgets    │ ← Filter tabs
├─────────────────────────────────────┤
│                                     │
│ [Notification Item 1]               │ ← List of notifications
│ [Notification Item 2 - Grouped]     │
│ [Notification Item 3]               │
│ ...                                 │
│                                     │
├─────────────────────────────────────┤
│ View All Notifications →            │ ← Footer
└─────────────────────────────────────┘
```

**Notification Item Design:**

```tsx
<div className={cn(
  "p-4 hover:bg-accent transition-colors cursor-pointer border-b",
  !notification.read && "bg-violet-50 dark:bg-violet-950/20"
)}>
  <div className="flex gap-3">
    {/* Icon/Avatar */}
    <div className="flex-shrink-0">
      {notification.actorAvatar ? (
        <Avatar>
          <AvatarImage src={notification.actorAvatar} />
          <AvatarFallback>{notification.actorName?.[0]}</AvatarFallback>
        </Avatar>
      ) : (
        <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
          {notification.icon}
        </div>
      )}
    </div>
    
    {/* Content */}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">{notification.title}</p>
      <p className="text-xs text-muted-foreground mt-1">{notification.body}</p>
      
      {/* Actions */}
      {notification.actions && (
        <div className="flex gap-2 mt-2">
          {notification.actions.map(action => (
            <Button key={action.id} size="sm" variant={action.variant}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
      
      {/* Timestamp */}
      <p className="text-xs text-muted-foreground mt-2">
        {formatRelativeTime(notification.createdAt)}
      </p>
    </div>
    
    {/* Unread indicator */}
    {!notification.read && (
      <div className="flex-shrink-0">
        <div className="h-2 w-2 rounded-full bg-violet-600" />
      </div>
    )}
  </div>
</div>
```

**Grouped Notification Design:**

```tsx
<div className="p-4">
  <div className="flex gap-3">
    {/* Stacked avatars */}
    <div className="flex-shrink-0">
      <div className="flex -space-x-2">
        {actors.slice(0, 3).map(actor => (
          <Avatar key={actor.userId} className="border-2 border-white">
            <AvatarImage src={actor.avatar} />
            <AvatarFallback>{actor.name[0]}</AvatarFallback>
          </Avatar>
        ))}
        {actors.length > 3 && (
          <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center text-xs font-medium border-2 border-white">
            +{actors.length - 3}
          </div>
        )}
      </div>
    </div>
    
    {/* Content */}
    <div className="flex-1">
      <p className="text-sm font-medium">
        {groupCount} new expenses in {groupName}
      </p>
      <p className="text-xs text-muted-foreground">
        {actors.map(a => a.name).join(', ')}
      </p>
      <Button variant="link" size="sm" className="p-0 h-auto mt-1">
        Show all →
      </Button>
    </div>
  </div>
</div>
```

**Empty State:**
```tsx
<div className="p-12 text-center">
  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
  <p className="text-sm text-muted-foreground">No notifications yet</p>
  <p className="text-xs text-muted-foreground mt-1">
    We'll notify you when something important happens
  </p>
</div>
```

**Features:**
- Max height: 500px, scrollable
- Shows last 10 notifications
- "View All" to see full history
- Tabs to filter by category
- Inline actions (Accept/Decline invitations)
- Mark individual as read on click
- Swipe to delete (mobile)

### 3. Notification Settings Page

**Route:** `/settings/notifications`

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Settings                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   🔔 Notification Preferences                               │
│   Control how and when you receive notifications            │
│                                                              │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 🌐 Global Settings                                 │   │
│   ├────────────────────────────────────────────────────┤   │
│   │ Enable Notifications          [Toggle: ON]        │   │
│   │ Push Notifications             [Toggle: ON]        │   │
│   │ Email Notifications            [Toggle: OFF]       │   │
│   │ Notification Sounds            [Toggle: ON]        │   │
│   │ Group Similar Notifications    [Toggle: ON]        │   │
│   └────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 🌙 Quiet Hours                                     │   │
│   ├────────────────────────────────────────────────────┤   │
│   │ Pause notifications during specific hours          │   │
│   │                                                     │   │
│   │ Enable Quiet Hours             [Toggle: OFF]       │   │
│   │ From: [22:00 ▼] To: [08:00 ▼]                    │   │
│   │ Timezone: America/Toronto                          │   │
│   └────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 📊 Notification Types                              │   │
│   ├────────────────────────────────────────────────────┤   │
│   │                                                     │   │
│   │ GROUP ACTIVITY                                     │   │
│   │   New Expenses        [✓] In-App [✓] Push [Freq▼] │   │
│   │   Invitations         [✓] In-App [✓] Push [Freq▼] │   │
│   │   Member Activity     [✓] In-App [ ] Push [Freq▼] │   │
│   │   Settings Changed    [✓] In-App [ ] Push [Freq▼] │   │
│   │                                                     │   │
│   │ BUDGET ALERTS                                      │   │
│   │   Warning (75%)       [✓] In-App [✓] Push [Real]  │   │
│   │   Critical (90%)      [✓] In-App [✓] Push [Real]  │   │
│   │   Exceeded (>100%)    [✓] In-App [✓] Push [Real]  │   │
│   │   Monthly Reset       [✓] In-App [✓] Push [Real]  │   │
│   │                                                     │   │
│   │ SUMMARIES                                          │   │
│   │   Weekly Summary      [ ] In-App [ ] Push [Off]   │   │
│   │   Monthly Summary     [ ] In-App [ ] Push [Off]   │   │
│   │                                                     │   │
│   └────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 👥 Group-Specific Settings                         │   │
│   ├────────────────────────────────────────────────────┤   │
│   │                                                     │   │
│   │ 👨‍👩‍👧‍👦 Family Group                                │   │
│   │   Frequency: [Real-time ▼]                         │   │
│   │   [✓] Expenses [✓] Members [✓] Budget              │   │
│   │                                                     │   │
│   │ 💼 Office Team                                     │   │
│   │   Frequency: [Daily digest ▼]                      │   │
│   │   [✓] Expenses [ ] Members [✓] Budget              │   │
│   │                                                     │   │
│   └────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 📧 Email Digests                                   │   │
│   ├────────────────────────────────────────────────────┤   │
│   │ Daily Digest    [ ] Enable  Time: [08:00 ▼]       │   │
│   │ Weekly Digest   [ ] Enable  Day: [Monday ▼]       │   │
│   │ Monthly Digest  [ ] Enable  Day: [1 ▼]            │   │
│   └────────────────────────────────────────────────────┘   │
│                                                              │
│   [Test Notifications] [Reset to Defaults] [Save]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Frequency Options:**
- Real-time: Instant notifications
- Hourly: Grouped once per hour
- Daily: Once per day digest
- Weekly: Once per week digest
- Never: Disabled

### 4. In-Page Notification Toasts

**For immediate feedback, use Sonner toasts:**

```tsx
// New expense added
toast.success('New expense added', {
  description: 'John added $45 at Costco',
  action: {
    label: 'View',
    onClick: () => router.push('/groups/xxx')
  }
});

// Budget warning
toast.warning('Budget Warning', {
  description: "You've used 75% of your Food budget",
  action: {
    label: 'View Budget',
    onClick: () => router.push('/budgets')
  }
});

// Budget exceeded
toast.error('Budget Exceeded!', {
  description: 'Food & Dining budget exceeded by $25',
  action: {
    label: 'Details',
    onClick: () => router.push('/budgets')
  }
});
```

### 5. Group Notification Settings (in Group Settings)

**Location:** `/groups/[id]/settings` → New "Notifications" section

```tsx
<Card>
  <CardHeader>
    <CardTitle>Your Notification Preferences</CardTitle>
    <CardDescription>
      Control notifications from this group
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <Label>Enable notifications</Label>
        <p className="text-sm text-muted-foreground">
          Receive updates from this group
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={setEnabled} />
    </div>
    
    <div className="flex items-center justify-between">
      <Label>Frequency</Label>
      <Select value={frequency} onValueChange={setFrequency}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="realtime">Real-time</SelectItem>
          <SelectItem value="hourly">Hourly digest</SelectItem>
          <SelectItem value="daily">Daily digest</SelectItem>
          <SelectItem value="never">Never</SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    <div className="space-y-2">
      <Label>Notification Types</Label>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <Checkbox checked={expenses} onCheckedChange={setExpenses} />
          <span className="text-sm">New expenses</span>
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={members} onCheckedChange={setMembers} />
          <span className="text-sm">Member activity</span>
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={budget} onCheckedChange={setBudget} />
          <span className="text-sm">Budget alerts</span>
        </label>
      </div>
    </div>
    
    <div className="flex items-center justify-between">
      <div>
        <Label>Priority</Label>
        <p className="text-sm text-muted-foreground">
          High priority groups notify immediately
        </p>
      </div>
      <Select value={priority} onValueChange={setPriority}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </CardContent>
</Card>
```

### 6. Pending Invitations

**OLD (Remove from Groups page):**
- Currently shows inline in groups list

**NEW (Notification-based):**
- Shows as high-priority notification
- Badge on notification bell
- Inline actions in notification panel:
  - ✅ Accept
  - ❌ Decline
- Also accessible from new "Invitations" tab in notification center

**Dedicated Invitations View:**
```
Route: /invitations

┌─────────────────────────────────────────┐
│ 📨 Group Invitations                    │
├─────────────────────────────────────────┤
│                                         │
│ [Invitation Card 1]                     │
│   👨‍👩‍👧‍👦 Family Group                   │
│   John Doe invited you                  │
│   5 members • 12 expenses this month    │
│   [Accept] [Decline]                    │
│                                         │
│ [Invitation Card 2]                     │
│   💼 Office Team                        │
│   Sarah Smith invited you               │
│   3 members • 45 expenses this month    │
│   [Accept] [Decline]                    │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Basic notification infrastructure

**Tasks:**
1. ✅ Database schema setup
   - Create Firestore collections
   - Set up indexes
   - Create TypeScript interfaces

2. ✅ Core hooks and services
   - `useNotifications()` - Fetch and listen
   - `useNotificationActions()` - Mark read, delete
   - `NotificationService` - Create notifications

3. ✅ Basic UI components
   - NotificationBell in header
   - NotificationPanel dropdown
   - Empty and loading states

4. ✅ Testing
   - Manual notification creation
   - Real-time updates
   - Mark as read functionality

**Deliverable:** Basic in-app notification center working

### Phase 2: Notification Types (Week 3)
**Goal:** Implement all notification types

**Tasks:**
1. ✅ Group activity notifications
   - Expense added
   - Member joined/left
   - Invitation sent/accepted

2. ✅ Budget notifications
   - Warning (75%)
   - Critical (90%)
   - Exceeded (>100%)
   - Monthly reset

3. ✅ Trigger functions
   - Hook into existing expense creation
   - Hook into group member management
   - Hook into budget calculations

4. ✅ Testing
   - Test each notification type
   - Verify triggers fire correctly

**Deliverable:** All notification types generating correctly

### Phase 3: User Preferences (Week 4)
**Goal:** User control over notifications

**Tasks:**
1. ✅ Preferences data structure
   - Default preferences on user creation
   - Migration for existing users

2. ✅ Settings page UI
   - Global settings
   - Per-type preferences
   - Per-group preferences
   - Quiet hours

3. ✅ Preferences hook
   - `useNotificationPreferences()`
   - Save preferences
   - Apply preferences to notification delivery

4. ✅ Testing
   - Verify preferences are respected
   - Test quiet hours
   - Test per-group settings

**Deliverable:** Full user control over notification preferences

### Phase 4: Smart Grouping (Week 5)
**Goal:** Reduce notification noise

**Tasks:**
1. ✅ Grouping logic
   - Identify groupable notifications
   - Create notification groups
   - Display grouped notifications

2. ✅ UI for grouped notifications
   - Stacked avatars
   - Summary text
   - Expand to see all

3. ✅ Testing
   - Multiple rapid notifications group correctly
   - Grouped notifications display properly

**Deliverable:** Smart notification grouping working

### Phase 5: PWA Push Notifications (Week 6-7)
**Goal:** Push notifications for PWA

**Tasks:**
1. ✅ Service worker setup
   - Push notification handler
   - Notification click handler
   - Background sync

2. ✅ VAPID keys and push service
   - Generate VAPID keys
   - Store in environment variables
   - Push subscription management API

3. ✅ Client-side push registration
   - Request permission
   - Subscribe to push
   - Store subscription in Firestore

4. ✅ Server-side push delivery
   - Send push notifications
   - Handle failures
   - Retry logic

5. ✅ Testing
   - Push notifications on mobile
   - Push notifications on desktop
   - Notification click handling

**Deliverable:** Working PWA push notifications

### Phase 6: Polish & Optimization (Week 8)
**Goal:** Production-ready system

**Tasks:**
1. ✅ Performance optimization
   - Efficient queries
   - Pagination for notification history
   - Cleanup old notifications

2. ✅ Enhanced UX
   - Animations
   - Sound effects (optional)
   - Better loading states

3. ✅ Analytics
   - Track notification engagement
   - Delivery success rate
   - User preference patterns

4. ✅ Documentation
   - User guide
   - Developer documentation

**Deliverable:** Production-ready notification system

### Phase 7: Advanced Features (Future)
**Optional enhancements:**

1. Email digests
   - Daily summary email
   - Weekly summary email
   - Monthly summary email

2. Notification templates
   - Reusable notification templates
   - Customizable by admins

3. Advanced filtering
   - Search notifications
   - Filter by date range
   - Filter by type/group

4. Notification scheduling
   - Schedule notifications for later
   - Recurring notifications

5. Rich notifications
   - Inline images
   - Interactive elements
   - Rich media

---

## ⚙️ User Controls & Preferences

### Default Settings (for new users)

```typescript
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  // Global
  enabled: true,
  pushEnabled: true,
  emailEnabled: false,
  
  // Quiet hours
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  
  // DND
  dnd: {
    enabled: false,
  },
  
  // Type preferences
  types: {
    // Group
    group_expense_added: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'medium',
    },
    group_invitation: {
      inApp: true,
      push: true,
      email: true,
      frequency: 'realtime',
      priority: 'high',
    },
    group_member_joined: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
    group_member_left: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
    group_role_changed: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'high',
    },
    group_settings_changed: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
    
    // Budget
    budget_warning: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'high',
    },
    budget_critical: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'critical',
    },
    budget_exceeded: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'critical',
    },
    budget_reset: {
      inApp: true,
      push: true,
      email: false,
      frequency: 'realtime',
      priority: 'medium',
    },
    
    // System
    weekly_summary: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'weekly',
      priority: 'low',
    },
    monthly_summary: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'monthly',
      priority: 'low',
    },
    receipts_uncategorized: {
      inApp: true,
      push: false,
      email: false,
      frequency: 'daily',
      priority: 'low',
    },
  },
  
  // Group settings (empty initially, populated as user joins groups)
  groups: {},
  
  // Digests
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
  
  // Advanced
  groupingEnabled: true,
  soundEnabled: true,
  badgeCount: true,
};
```

### Priority-Based Delivery

**Critical (Cannot be disabled):**
- Budget critical (90%)
- Budget exceeded (>100%)

**High Priority:**
- Group invitations
- Budget warnings (75%)
- Role changes

**Medium Priority:**
- New expenses (if real-time)
- Budget resets
- Group settings changes

**Low Priority:**
- Member activity
- Summaries
- Uncategorized receipts

### Quiet Hours Logic

```typescript
function shouldDeliverNow(
  notification: Notification,
  preferences: NotificationPreferences
): boolean {
  // Critical notifications always deliver
  if (notification.priority === 'critical') {
    return true;
  }
  
  // Check DND mode
  if (preferences.dnd.enabled) {
    if (preferences.dnd.until && new Date() < preferences.dnd.until) {
      return false;
    }
  }
  
  // Check quiet hours
  if (preferences.quietHours.enabled) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    const [startHour, startMin] = preferences.quietHours.start.split(':').map(Number);
    const [endHour, endMin] = preferences.quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (startTime < endTime) {
      // Normal case: 22:00 to 08:00 next day
      if (currentTime >= startTime && currentTime < endTime) {
        return false; // In quiet hours
      }
    } else {
      // Spans midnight: 22:00 to 08:00
      if (currentTime >= startTime || currentTime < endTime) {
        return false; // In quiet hours
      }
    }
  }
  
  return true;
}
```

---

## 📱 PWA Push Notifications

### Requirements

1. **HTTPS required** (already have for PWA)
2. **User permission** (must explicitly grant)
3. **VAPID keys** (for authentication)
4. **Service Worker** (already have)

### Implementation Steps

#### Step 1: Generate VAPID Keys

```bash
# Install web-push library
npm install web-push

# Generate keys
npx web-push generate-vapid-keys

# Output:
# Public Key: BNX...
# Private Key: 5J8...
```

**Store in `.env.local`:**
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BNX...
VAPID_PRIVATE_KEY=5J8...
VAPID_SUBJECT=mailto:sarath@example.com
```

#### Step 2: Service Worker Updates

**File:** `public/sw.js`

```javascript
// Push notification handler
self.addEventListener('push', function(event) {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: {
      url: data.url,
      notificationId: data.notificationId,
    },
    actions: data.actions || [],
    tag: data.tag,
    requireInteraction: data.priority === 'critical',
    vibrate: data.priority === 'critical' ? [200, 100, 200] : [100],
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const url = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Check if app is already open
        for (let client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
```

#### Step 3: Client-Side Push Subscription

**Hook:** `src/hooks/usePushNotifications.ts`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (user && 'serviceWorker' in navigator && 'PushManager' in window) {
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking push subscription:', error);
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.error('This browser does not support notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    setPermission(permission);
    return permission === 'granted';
  };

  const subscribe = async (): Promise<boolean> => {
    if (!user) {
      console.error('User must be logged in to subscribe');
      return false;
    }

    setLoading(true);

    try {
      // Request permission if not granted
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setLoading(false);
          return false;
        }
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });

      // Send subscription to server
      const response = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceInfo: {
            type: getDeviceType(),
            browser: getBrowserName(),
            os: getOSName(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      setLoading(false);
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/notifications/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
      }

      setIsSubscribed(false);
      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      setLoading(false);
      return false;
    }
  };

  return {
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}

// Helper functions
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
}

function getOSName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS')) return 'iOS';
  return 'Unknown';
}
```

#### Step 4: Server-Side Push Delivery

**API Route:** `src/app/api/notifications/push/send/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { adminDb } from '@/lib/firebase-admin';

// Configure web-push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId, notification } = await request.json();

    // Get user's push subscriptions
    const subscriptionsSnapshot = await adminDb
      .collection('pushSubscriptions')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .get();

    if (subscriptionsSnapshot.empty) {
      return NextResponse.json({ 
        success: false, 
        message: 'No active subscriptions' 
      });
    }

    // Prepare push payload
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192x192.png',
      url: notification.actionUrl || '/',
      notificationId: notification.id,
      priority: notification.priority,
      actions: notification.actions?.map(a => ({
        action: a.id,
        title: a.label,
      })),
      tag: notification.groupKey || notification.id,
    });

    // Send to all subscriptions
    const results = await Promise.allSettled(
      subscriptionsSnapshot.docs.map(async (doc) => {
        const sub = doc.data();
        
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payload
          );

          // Update last used
          await doc.ref.update({
            lastUsed: new Date(),
            failureCount: 0,
          });

          return { success: true, subscriptionId: doc.id };
        } catch (error: any) {
          console.error('Push delivery failed:', error);

          // Handle errors
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription expired or not found
            await doc.ref.update({ active: false });
          } else {
            // Other error, increment failure count
            const failureCount = sub.failureCount || 0;
            await doc.ref.update({
              failureCount: failureCount + 1,
              active: failureCount + 1 < 5, // Deactivate after 5 failures
            });
          }

          return { success: false, subscriptionId: doc.id, error: error.message };
        }
      })
    );

    // Mark notification as delivered
    await adminDb
      .collection('notifications')
      .doc(notification.id)
      .update({
        delivered: true,
        deliveredAt: new Date(),
      });

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    return NextResponse.json({
      success: true,
      delivered: successCount,
      total: subscriptionsSnapshot.size,
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
    return NextResponse.json(
      { error: 'Failed to send push notification' },
      { status: 500 }
    );
  }
}
```

#### Step 5: Integration with Notification Service

**File:** `src/lib/notificationService.ts`

```typescript
import { adminDb } from '@/lib/firebase-admin';
import { NotificationType, Notification } from '@/lib/types';

export class NotificationService {
  /**
   * Create a notification and optionally send push
   */
  static async create(
    userId: string,
    type: NotificationType,
    data: Partial<Notification>
  ): Promise<string> {
    // Check user preferences
    const prefsDoc = await adminDb
      .collection('notificationPreferences')
      .doc(userId)
      .get();
    
    const prefs = prefsDoc.data();
    
    if (!prefs || !prefs.enabled) {
      console.log('Notifications disabled for user:', userId);
      return '';
    }

    const typePrefs = prefs.types?.[type];
    if (!typePrefs || !typePrefs.inApp) {
      console.log('Notification type disabled:', type);
      return '';
    }

    // Check quiet hours
    if (!this.shouldDeliverNow(data.priority, prefs)) {
      console.log('In quiet hours, queueing for later');
      // TODO: Queue for later delivery
      return '';
    }

    // Create notification
    const notification: Notification = {
      id: '', // Will be set by Firestore
      userId,
      type,
      title: data.title!,
      body: data.body!,
      icon: data.icon,
      priority: data.priority || 'medium',
      category: data.category!,
      read: false,
      delivered: false,
      isGrouped: false,
      createdAt: new Date() as any,
      ...data,
    };

    const docRef = await adminDb.collection('notifications').add(notification);
    notification.id = docRef.id;

    // Send push notification if enabled
    if (typePrefs.push && prefs.pushEnabled) {
      await this.sendPush(userId, notification);
    }

    return docRef.id;
  }

  /**
   * Send push notification
   */
  private static async sendPush(
    userId: string,
    notification: Notification
  ): Promise<void> {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, notification }),
      });
    } catch (error) {
      console.error('Failed to send push notification:', error);
      // Don't throw - in-app notification still created
    }
  }

  /**
   * Check if notification should be delivered now
   */
  private static shouldDeliverNow(
    priority: string | undefined,
    prefs: any
  ): boolean {
    // Critical always delivers
    if (priority === 'critical') {
      return true;
    }

    // Check DND
    if (prefs.dnd?.enabled) {
      if (prefs.dnd.until && new Date() < new Date(prefs.dnd.until)) {
        return false;
      }
    }

    // Check quiet hours
    if (prefs.quietHours?.enabled) {
      // Simplified - full logic in production
      const now = new Date();
      const currentHour = now.getHours();
      
      const [startHour] = prefs.quietHours.start.split(':').map(Number);
      const [endHour] = prefs.quietHours.end.split(':').map(Number);
      
      if (startHour < endHour) {
        if (currentHour >= startHour && currentHour < endHour) {
          return false;
        }
      } else {
        if (currentHour >= startHour || currentHour < endHour) {
          return false;
        }
      }
    }

    return true;
  }
}
```

---

## 🔒 Privacy & Security

### Data Privacy

1. **User Control:**
   - Users can disable all notifications
   - Users can delete notification history
   - Users can export notification data (GDPR)

2. **Data Retention:**
   - Notifications auto-delete after 90 days
   - Read notifications deleted after 30 days (configurable)
   - Push subscriptions expire after 6 months of inactivity

3. **Sensitive Data:**
   - No financial data in push notifications
   - Use generic text: "New expense added" vs "$500 at Strip Club"
   - Amount/vendor shown only in-app after authentication

### Security

1. **Authentication:**
   - All API endpoints require authentication
   - Users can only access their own notifications
   - Rate limiting on notification creation

2. **Push Notification Security:**
   - VAPID keys stored securely
   - Push subscriptions tied to authenticated users
   - Endpoint verification on subscription

3. **Permission Model:**
   - Only group members receive group notifications
   - Budget notifications only for budget owner
   - Admin-only notifications for settings changes

### Spam Prevention

1. **Rate Limiting:**
   - Max 100 notifications per user per day
   - Max 10 notifications per user per hour (non-critical)
   - Automatic grouping reduces volume

2. **Notification Grouping:**
   - Similar notifications grouped automatically
   - "John and 5 others" instead of 6 separate notifications

3. **User Controls:**
   - Mute specific groups
   - Digest mode (daily/weekly)
   - Quiet hours

---

## 🧪 Testing Strategy

### Unit Tests

**Test:** Notification Creation
```typescript
describe('NotificationService', () => {
  it('should create notification with correct data', async () => {
    const notificationId = await NotificationService.create(
      'user123',
      NotificationType.GROUP_EXPENSE_ADDED,
      {
        title: 'New expense added',
        body: 'John added $50 at Costco',
        category: 'group',
        priority: 'medium',
      }
    );
    
    expect(notificationId).toBeTruthy();
    
    const notification = await getNotification(notificationId);
    expect(notification.title).toBe('New expense added');
    expect(notification.read).toBe(false);
  });
});
```

**Test:** Preferences Respected
```typescript
it('should respect user preferences', async () => {
  // Disable expense notifications
  await updatePreferences('user123', {
    types: {
      group_expense_added: { inApp: false, push: false }
    }
  });
  
  const notificationId = await NotificationService.create(
    'user123',
    NotificationType.GROUP_EXPENSE_ADDED,
    { ... }
  );
  
  expect(notificationId).toBe(''); // Not created
});
```

### Integration Tests

**Test:** End-to-End Notification Flow
```typescript
it('should create notification when expense added', async () => {
  // Add expense
  await addExpense({
    userId: 'user1',
    groupId: 'group1',
    amount: 50,
    vendor: 'Costco',
  });
  
  // Check other group members received notification
  const user2Notifications = await getNotifications('user2');
  expect(user2Notifications).toHaveLength(1);
  expect(user2Notifications[0].type).toBe('group_expense_added');
});
```

### Manual Testing Checklist

- [ ] Notification bell shows unread count
- [ ] Clicking bell opens notification panel
- [ ] Notifications display correctly (all types)
- [ ] Mark as read works
- [ ] Mark all as read works
- [ ] Delete notification works
- [ ] Grouped notifications display correctly
- [ ] Clicking notification navigates to correct page
- [ ] Settings page loads preferences
- [ ] Changing preferences saves correctly
- [ ] Per-group settings work
- [ ] Quiet hours are respected
- [ ] Push permission request works
- [ ] Push notifications deliver on mobile
- [ ] Push notifications deliver on desktop
- [ ] Clicking push notification opens app
- [ ] Notification sounds play (if enabled)
- [ ] Empty state shows when no notifications
- [ ] Loading states display correctly

---

## 📊 Success Metrics

### Key Performance Indicators (KPIs)

1. **Engagement:**
   - Notification open rate: Target >40%
   - Action click rate: Target >20%
   - Time to action: Target <5 minutes

2. **User Satisfaction:**
   - Opt-in rate for push: Target >60%
   - Notification complaints: Target <5%
   - Feature usage: Target >80% of active users

3. **Technical:**
   - Push delivery success rate: Target >95%
   - Average delivery time: Target <3 seconds
   - System performance impact: Target <5% increase

### Analytics to Track

```typescript
interface NotificationAnalytics {
  // Delivery
  notificationsCreated: number;
  notificationsDelivered: number;
  notificationsFailed: number;
  
  // Engagement
  notificationsOpened: number;
  notificationsClicked: number;
  notificationsDeleted: number;
  
  // User behavior
  optInRate: number;
  optOutRate: number;
  averageResponseTime: number;
  
  // By type
  byType: {
    [key in NotificationType]: {
      created: number;
      opened: number;
      clicked: number;
      actionTaken: number;
    };
  };
}
```

### A/B Testing Opportunities

1. **Notification Copy:**
   - Test different wording
   - Emoji usage
   - Personalization level

2. **Timing:**
   - Immediate vs digest
   - Optimal send times
   - Frequency caps

3. **UI/UX:**
   - Notification panel design
   - Grouping strategies
   - Action button placement

---

## 🚦 Implementation Checklist

### Phase 1: Foundation ✅
- [ ] Database schema created
- [ ] Firestore indexes set up
- [ ] TypeScript interfaces defined
- [ ] Core hooks implemented
- [ ] Basic UI components built
- [ ] Real-time listeners working
- [ ] Manual testing successful

### Phase 2: Notification Types ✅
- [ ] Group expense notifications
- [ ] Group invitation notifications
- [ ] Member activity notifications
- [ ] Budget warning notifications
- [ ] Budget critical notifications
- [ ] Budget exceeded notifications
- [ ] Budget reset notifications
- [ ] Trigger functions integrated
- [ ] All types tested

### Phase 3: User Preferences ✅
- [ ] Preferences data structure
- [ ] Default preferences created
- [ ] Settings page UI built
- [ ] Global settings work
- [ ] Per-type settings work
- [ ] Per-group settings work
- [ ] Quiet hours implemented
- [ ] Preferences respected in delivery

### Phase 4: Smart Grouping ✅
- [ ] Grouping logic implemented
- [ ] Notification groups created
- [ ] Grouped UI designed
- [ ] Expand/collapse works
- [ ] Testing complete

### Phase 5: PWA Push ✅
- [ ] VAPID keys generated
- [ ] Service worker updated
- [ ] Push subscription hook
- [ ] Permission request flow
- [ ] Subscribe API endpoint
- [ ] Unsubscribe API endpoint
- [ ] Send push API endpoint
- [ ] Push integration in NotificationService
- [ ] Mobile testing
- [ ] Desktop testing

### Phase 6: Polish ✅
- [ ] Performance optimized
- [ ] Animations added
- [ ] Loading states polished
- [ ] Error handling complete
- [ ] Analytics integrated
- [ ] Documentation written
- [ ] User guide created

### Phase 7: Launch Prep ✅
- [ ] All tests passing
- [ ] No console errors
- [ ] Build succeeds
- [ ] Lighthouse scores good
- [ ] Security review complete
- [ ] Privacy policy updated
- [ ] User announcement prepared
- [ ] Rollout plan ready

---

## 📝 Notes & Considerations

### Technical Decisions

1. **Why Firestore for Notifications?**
   - Real-time updates via listeners
   - Scales well with user base
   - No separate notification service needed
   - Integrates with existing Firebase setup

2. **Why Web Push vs Third-Party Service?**
   - No additional cost
   - Full control over delivery
   - Privacy-friendly (no data sharing)
   - Works offline with service worker

3. **Why Not Email Initially?**
   - Email adds complexity (ESP, templates, deliverability)
   - Users prefer in-app + push for immediate actions
   - Can add later if user demand

### Future Enhancements

1. **Rich Notifications:**
   - Inline images in notifications
   - Video thumbnails
   - Charts in budget notifications

2. **Interactive Actions:**
   - Reply to comments from notification
   - Approve expenses from notification
   - Quick actions without opening app

3. **AI-Powered Insights:**
   - "You usually spend less at this time of month"
   - "This expense is 2x your usual at this vendor"
   - Spending pattern notifications

4. **Social Features:**
   - @mentions in comments
   - Reaction notifications
   - Shared expense reminders

5. **Calendar Integration:**
   - Sync notifications to calendar
   - Reminder before budget period ends
   - Schedule notifications for future

### Migration Plan for Existing Users

**Step 1:** Add notification system (no breaking changes)
**Step 2:** Create default preferences for all existing users
**Step 3:** Show one-time onboarding modal explaining notifications
**Step 4:** Encourage push notification opt-in with benefits
**Step 5:** Monitor engagement and iterate

**Onboarding Modal:**
```tsx
<Dialog open={showNotificationOnboarding}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>📬 Introducing Notifications!</DialogTitle>
      <DialogDescription>
        Stay updated on group activities, budget alerts, and more.
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="text-2xl">👥</div>
        <div>
          <p className="font-medium">Group Activity</p>
          <p className="text-sm text-muted-foreground">
            Know when expenses are added to your groups
          </p>
        </div>
      </div>
      
      <div className="flex gap-3">
        <div className="text-2xl">💰</div>
        <div>
          <p className="font-medium">Budget Alerts</p>
          <p className="text-sm text-muted-foreground">
            Get warned before you exceed your budgets
          </p>
        </div>
      </div>
      
      <div className="flex gap-3">
        <div className="text-2xl">📧</div>
        <div>
          <p className="font-medium">Invitations</p>
          <p className="text-sm text-muted-foreground">
            Never miss a group invitation
          </p>
        </div>
      </div>
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={handleSkip}>
        Skip for now
      </Button>
      <Button onClick={handleEnablePush}>
        Enable Notifications
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 🎉 Conclusion

This notification system will:

1. ✅ **Keep users engaged** with timely, relevant updates
2. ✅ **Respect user preferences** with granular controls
3. ✅ **Work offline** with PWA push notifications
4. ✅ **Scale efficiently** with smart grouping and rate limiting
5. ✅ **Maintain privacy** with secure, user-controlled data
6. ✅ **Not break anything** as it's additive, not replacing core features

The implementation is phased to allow for iterative development and user feedback. Each phase delivers value independently, so we can ship incrementally.

**Next Steps:**
1. Review and approve this design
2. Begin Phase 1 implementation
3. Set up analytics tracking
4. Create user documentation
5. Plan marketing announcement

**Questions or concerns?** Let's discuss before implementation begins!

---

**Document Version:** 1.0  
**Last Updated:** November 17, 2025  
**Status:** Ready for Implementation

