# 🗄️ Database Schema - Penny Expense Tracker

**Version**: 1.0  
**Last Updated**: November 17, 2025  
**Database**: Cloud Firestore  
**Status**: ✅ Production  

---

## 📊 Schema Overview

### Collections Hierarchy

```
penny (Firestore Database)
├── users/
├── expenses/
├── groups/
├── groupMembers/
├── groupInvitations/
├── groupActivities/
├── conversations/
│   └── {conversationId}/messages/
├── budgets_personal/
├── budgets_group/
├── budget_usage_cache/
├── budget_alerts/
├── notifications/
├── userNotificationSettings/
├── notificationPreferences/
├── pushSubscriptions/
├── budgetNotificationTrackers/
├── notificationGroups/
├── passkeys/
└── challenges/
```

---

## 📁 Collection Schemas

### 1. `users/`
**Purpose**: User profile and settings

```typescript
interface User {
  id: string;                    // Auto ID
  email: string;                 // Unique
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  preferences: {
    currency: string;            // "USD", "CAD", etc.
    theme: "light" | "dark";
    language: string;
  };
  stats: {
    totalExpenses: number;
    totalGroups: number;
    totalConversations: number;
  };
}
```

**Indexes**: None (accessed by document ID)

---

### 2. `expenses/`
**Purpose**: All expenses (personal and group)

```typescript
interface Expense {
  id: string;
  userId: string;                // Owner
  expenseType: "personal" | "group";
  vendor: string;
  amount: number;
  date: Timestamp;
  category: string;
  description?: string;
  groupId?: string;              // Only for group expenses
  receiptUrl?: string;           // Firebase Storage URL
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Group metadata (if group expense)
  groupMetadata?: {
    approvalStatus: "pending" | "approved" | "rejected";
    approvedBy?: string;
    approvedAt?: Timestamp;
  };
}
```

**Indexes Required**:
1. `userId + date (DESC)`
2. `userId + category + date (DESC)`
3. `groupId + date (DESC)`
4. `groupId + category + date (DESC)`

---

### 3. `groups/`
**Purpose**: Shared expense groups

```typescript
interface Group {
  id: string;
  name: string;
  description?: string;
  icon?: string;                 // Emoji
  createdBy: string;             // User ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: "active" | "archived";
  
  settings: {
    currency: string;
    requireApproval: boolean;
    allowMemberInvites: boolean;
  };
  
  stats: {
    memberCount: number;
    expenseCount: number;
    totalAmount: number;
    lastActivityAt: Timestamp;
  };
}
```

**Indexes**: None (accessed by document ID or via groupMembers join)

---

### 4. `groupMembers/`
**Purpose**: Group membership and permissions

```typescript
interface GroupMember {
  id: string;                    // {groupId}_{userId}
  groupId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  status: "active" | "left" | "removed";
  joinedAt: Timestamp;
  lastActivityAt: Timestamp;
  
  permissions: {
    canAddExpenses: boolean;
    canEditOwnExpenses: boolean;
    canEditAllExpenses: boolean;
    canDeleteExpenses: boolean;
    canApproveExpenses: boolean;
    canInviteMembers: boolean;
    canManageMembers: boolean;
  };
}
```

**Indexes Required**:
1. `userId + status + joinedAt (DESC)`
2. `groupId + status + joinedAt (DESC)`

---

### 5. `groupInvitations/`
**Purpose**: Group invitation tracking

```typescript
interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  invitedEmail: string;
  invitedBy: string;             // User ID
  role: "admin" | "member";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  invitationToken: string;       // Secure random token
  createdAt: Timestamp;
  expiresAt: Timestamp;
  respondedAt?: Timestamp;
}
```

**Indexes Required**:
1. `invitedEmail + status + createdAt (DESC)`
2. `groupId + status + createdAt (DESC)`

---

### 6. `conversations/`
**Purpose**: Chat conversation history

```typescript
interface Conversation {
  id: string;
  userId: string;
  title: string;
  summary?: string;
  status: "active" | "archived";
  messageCount: number;
  totalExpensesCreated: number;
  lastMessagePreview: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  metadata: {
    lastAccessedAt?: Timestamp;
    expenseCategories?: string[];
    totalSpent?: number;
  };
}
```

**Indexes Required**:
1. `userId + status + updatedAt (DESC)`

**Subcollection**: `messages/`
```typescript
interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Timestamp;
  attachments?: Array<{
    type: "image" | "receipt";
    url: string;
    filename: string;
  }>;
  expenseData?: {
    expenseId?: string;
    vendor?: string;
    amount?: number;
    category?: string;
  };
}
```

---

### 7. `budgets_personal/`
**Purpose**: Personal spending budgets

```typescript
interface PersonalBudget {
  id: string;
  userId: string;
  category: string;
  monthlyLimit: number;
  period: {
    month: number;               // 1-12
    year: number;
  };
  rollover: boolean;
  settings: {
    alertAt75: boolean;
    alertAt90: boolean;
    alertAt100: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required**:
1. `userId + period.month + period.year`
2. `userId + category + period.month + period.year`

---

### 8. `budgets_group/`
**Purpose**: Group-level budgets

```typescript
interface GroupBudget {
  id: string;
  groupId: string;
  category: string;
  monthlyLimit: number;
  period: {
    month: number;
    year: number;
  };
  setBy: string;                 // User ID
  setByRole: "owner" | "admin";
  rollover: boolean;
  settings: {
    alertAt75: boolean;
    alertAt90: boolean;
    alertAt100: boolean;
    notifyAllMembers: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required**:
1. `groupId + period.month + period.year`
2. `groupId + category + period.month + period.year`

---

### 9. `notifications/`
**Purpose**: User notifications

```typescript
interface Notification {
  id: string;
  userId: string;
  type: NotificationType;        // Enum: group_expense_added, budget_warning, etc.
  title: string;
  body: string;
  icon?: string;
  priority: "low" | "medium" | "high" | "critical";
  category: "group" | "budget" | "system" | "social";
  
  // Status
  read: boolean;
  readAt?: Timestamp;
  delivered: boolean;
  deliveredAt?: Timestamp;
  
  // Actions
  actions?: Array<{
    id: string;
    label: string;
    url?: string;
    variant?: "default" | "primary" | "danger";
  }>;
  actionUrl?: string;
  
  // Related data
  relatedId?: string;
  relatedType?: "expense" | "group" | "budget" | "member";
  groupId?: string;
  
  // Grouping
  isGrouped: boolean;
  groupKey?: string;
  groupCount?: number;
  groupedNotifications?: string[];
  
  // Actor
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  metadata?: Record<string, unknown>;
}
```

**Indexes Required**:
1. `userId + read + createdAt (DESC)`
2. `userId + category + createdAt (DESC)`
3. `userId + type + createdAt (DESC)`
4. `userId + groupId + createdAt (DESC)`
5. `userId + category + read + createdAt (DESC)`
6. `userId + isGrouped + groupKey + createdAt (DESC)`
7. `expiresAt (ASC)` - for cleanup

---

### 10. `budgetNotificationTrackers/`
**Purpose**: Track budget threshold notifications

```typescript
interface BudgetNotificationTracker {
  id: string;                    // {budgetId}_{year}_{month}
  budgetId: string;
  userId: string;
  category: string;
  period: {
    month: number;
    year: number;
  };
  thresholds: {
    warning: {                   // 75%
      percentage: number;
      triggered: boolean;
      triggeredAt?: Timestamp;
    };
    critical: {                  // 90%
      percentage: number;
      triggered: boolean;
      triggeredAt?: Timestamp;
    };
    exceeded: {                  // 100%
      percentage: number;
      triggered: boolean;
      triggeredAt?: Timestamp;
    };
  };
  lastChecked: Timestamp;
}
```

**Indexes Required**:
1. `budgetId + period.year + period.month`

---

## 🔒 Security Rules Summary

### Access Control Matrix

| Collection | Read | Create | Update | Delete |
|-----------|------|--------|--------|--------|
| **users** | Owner | Owner | Owner | ❌ Never |
| **expenses** | Owner/Member | Owner/Member | Owner/Admin | Owner/Admin |
| **groups** | Member | Anyone | Owner/Admin | Owner |
| **groupMembers** | Member | 🔒 Server | Owner/Admin | 🔒 Server |
| **groupInvitations** | Invitee/Member | 🔒 Server | Invitee/Admin | 🔒 Server |
| **conversations** | Owner | Owner | Owner | Owner |
| **budgets_personal** | Owner | Owner | Owner | Owner |
| **budgets_group** | Member | Admin | Admin | Admin |
| **notifications** | Owner | 🔒 Server | Owner (read only) | Owner |
| **budgetNotificationTrackers** | Owner | 🔒 Server | 🔒 Server | 🔒 Server |

🔒 **Server** = Only via Firebase Admin SDK (bypasses rules)

---

## 📈 Data Flow Diagrams

### Expense Creation Flow
```
User Input
    ↓
AI Analysis (Gemini)
    ↓
Confirmation UI
    ↓
POST /api/expenses
    ↓
[Server-Side] Create expense document
    ↓
├── Update group stats (if group expense)
├── Check budget impact
├── Create budget notifications (if threshold crossed)
└── Create group member notifications
    ↓
Real-time update to clients (Firestore listeners)
```

### Budget Notification Flow
```
Expense Created
    ↓
Calculate total spent in category/period
    ↓
Compare against budget limit
    ↓
Check budgetNotificationTrackers
    ↓
If threshold crossed AND not previously triggered:
    ├── Create notification
    └── Mark threshold as triggered in tracker
```

---

## 🔄 Migration Strategy

### Version Control
- Schema changes tracked in git
- `firestore.rules` versioned
- `firestore.indexes.json` versioned
- Migration scripts in `scripts/migrations/`

### Adding New Collections
1. Update this document
2. Add to `firestore.rules`
3. Add indexes to `firestore.indexes.json`
4. Deploy via CI/CD
5. Create migration script if data transformation needed

### Modifying Existing Collections
1. **Additive changes** (new fields): Safe, deploy anytime
2. **Breaking changes** (rename/delete fields):
   - Create migration script
   - Run migration in staging
   - Verify data integrity
   - Deploy to production
   - Monitor for 48 hours

---

## 🧪 Testing Strategy

### Index Testing
```bash
# Test that all queries have indexes
npm run test:indexes
```

### Rules Testing
```bash
# Test security rules
firebase emulators:start --only firestore
npm run test:rules
```

### Data Validation
```bash
# Validate schema compliance
npm run validate:schema
```

---

## 📊 Monitoring

### Key Metrics
- **Read operations/day**: Monitor costs
- **Write operations/day**: Monitor costs
- **Index usage**: Identify unused indexes
- **Query performance**: P95 latency < 500ms
- **Storage size**: Track growth rate

### Alerts
- Spike in read/write operations
- Failed index builds
- Security rule violations
- Storage approaching limits

---

## 🚀 Deployment Checklist

### Before Deployment
- [ ] Rules changes reviewed
- [ ] Indexes defined for new queries
- [ ] Migration scripts tested
- [ ] Staging environment validated
- [ ] Rollback plan documented

### Deployment
- [ ] Deploy via CI/CD (automatic on main branch push)
- [ ] Or manual: `firebase deploy --only firestore`

### After Deployment
- [ ] Verify indexes building (can take minutes)
- [ ] Monitor error logs
- [ ] Check query performance
- [ ] Verify rules working as expected

---

## 📝 Change Log

### Version 1.0 (2025-11-17)
- Initial schema documentation
- All collections documented
- Indexes defined
- Security rules documented
- CI/CD pipeline configured

---

**Maintained By**: Development Team  
**Review Cycle**: Quarterly or on major changes  
**Status**: ✅ Production Ready  

