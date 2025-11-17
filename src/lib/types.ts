import { Timestamp } from "firebase/firestore";

/**
 * Expense data structure for tracking business expenses
 */
export interface Expense {
  id: string;
  userId: string;
  vendor: string;
  amount: number;
  category: string;
  date: Timestamp;
  description?: string;
  receiptUrl?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Offline sync fields
  syncStatus?: "pending" | "synced" | "error";
  localId?: string; // For offline-first functionality
  
  // Group tracking (NEW)
  groupId?: string | null; // null or undefined = personal expense
  expenseType: "personal" | "group";
  
  // Group-specific metadata (NEW)
  groupMetadata?: {
    approvedBy?: string;
    approvedAt?: Timestamp;
    approvalStatus?: "pending" | "approved" | "rejected";
    rejectedReason?: string;
    rejectedAt?: Timestamp;
  };
  
  // Audit trail (NEW)
  history?: Array<{
    action: "created" | "updated" | "deleted" | "approved" | "rejected";
    by: string;
    at: Timestamp;
    changes?: Record<string, unknown>;
  }>;
}

/**
 * Chat message structure for the AI chat interface
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Timestamp;
  // Optional fields for expense-related messages
  expenseData?: Partial<Expense>;
  imageUrl?: string;
  status?: "pending" | "confirmed" | "rejected";
  metadata?: {
    processingTime?: number;
    model?: string;
    confidence?: number;
  };
}

/**
 * User profile data structure
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  preferences?: {
    currency?: string;
    fiscalYearEnd?: string;
    defaultCategories?: string[];
    defaultGroupId?: string; // Default group for new expenses
  };
}

/**
 * Expense summary for dashboard analytics
 */
export interface ExpenseSummary {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

/**
 * Form data for manual expense entry
 */
export interface ExpenseFormData {
  vendor: string;
  amount: string;
  category: string;
  date: string;
  description?: string;
  notes?: string;
  groupId?: string; // NEW: Optional group assignment
}

// ============================================
// GROUP MANAGEMENT TYPES (NEW)
// ============================================

/**
 * Group role types with hierarchical permissions
 */
export type GroupRole = "owner" | "admin" | "member" | "viewer";

/**
 * Group member status
 */
export type GroupMemberStatus = "active" | "invited" | "left" | "removed";

/**
 * Group status
 */
export type GroupStatus = "active" | "archived" | "deleted";

/**
 * Expense approval status
 */
export type ApprovalStatus = "pending" | "approved" | "rejected";

/**
 * Group data structure
 */
export interface Group {
  id: string;
  name: string;
  description?: string;
  color?: string; // Hex color for UI differentiation
  icon?: string; // Emoji or icon name
  
  // Ownership
  createdBy: string; // userId
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Settings
  settings: {
    defaultCategory?: string;
    budget?: number;
    budgetPeriod?: "monthly" | "quarterly" | "yearly";
    requireApproval: boolean;
    allowMemberInvites: boolean;
    currency?: string;
  };
  
  // Status
  status: GroupStatus;
  archivedAt?: Timestamp;
  archivedBy?: string;
  
  // Statistics (denormalized for performance)
  stats: {
    memberCount: number;
    expenseCount: number;
    totalAmount: number;
    lastActivityAt: Timestamp;
  };
}

/**
 * Granular permissions for group members
 */
export interface GroupPermissions {
  canAddExpenses: boolean;
  canEditOwnExpenses: boolean;
  canEditAllExpenses: boolean;
  canDeleteExpenses: boolean;
  canApproveExpenses: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  canManageSettings: boolean;
}

/**
 * Group member data structure
 */
export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  
  // Role-based permissions
  role: GroupRole;
  
  // Status
  status: GroupMemberStatus;
  
  // Timestamps
  invitedAt: Timestamp;
  invitedBy: string; // userId
  joinedAt?: Timestamp;
  leftAt?: Timestamp;
  removedBy?: string;
  
  // Permissions (computed from role)
  permissions: GroupPermissions;
  
  // Activity tracking
  lastActivityAt?: Timestamp;
}

/**
 * Group invitation data structure
 */
export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string; // Denormalized for email template
  invitedEmail: string;
  invitedBy: string; // userId
  invitedByName?: string; // Denormalized for email template
  role: Exclude<GroupRole, "owner">; // Can't invite as owner
  
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  
  token: string; // Secure invitation token (hashed)
  expiresAt: Timestamp;
  
  createdAt: Timestamp;
  respondedAt?: Timestamp;
  
  // Metadata
  metadata?: {
    emailSent: boolean;
    emailSentAt?: Timestamp;
    reminderSent?: boolean;
    reminderSentAt?: Timestamp;
  };
}

/**
 * Group activity log entry
 */
export interface GroupActivity {
  id: string;
  groupId: string;
  userId: string;
  userName?: string;
  
  action: 
    | "group_created"
    | "group_updated"
    | "group_archived"
    | "group_deleted"
    | "member_invited"
    | "member_joined"
    | "member_left"
    | "member_removed"
    | "member_role_changed"
    | "expense_added"
    | "expense_updated"
    | "expense_deleted"
    | "expense_approved"
    | "expense_rejected"
    | "settings_updated";
  
  details?: string;
  metadata?: Record<string, unknown>;
  
  createdAt: Timestamp;
}

/**
 * Default permissions for each role
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<GroupRole, GroupPermissions> = {
  owner: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: true,
  },
  admin: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: false,
  },
  member: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
  viewer: {
    canAddExpenses: false,
    canEditOwnExpenses: false,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
};

/**
 * Group summary for dashboard
 */
export interface GroupSummary {
  group: Group;
  memberCount: number;
  myRole: GroupRole;
  pendingExpenses: number;
  recentActivity: GroupActivity[];
}

// ============================================
// CONVERSATION HISTORY TYPES (NEW)
// ============================================

/**
 * Conversation status
 */
export type ConversationStatus = "active" | "archived";

/**
 * Message status
 */
export type MessageStatus = "sending" | "sent" | "error";

/**
 * Conversation data structure
 */
export interface Conversation {
  id: string;
  userId: string;
  title: string; // Auto-generated from first message
  summary?: string; // AI-generated summary (optional)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessagePreview: string; // Last 100 chars
  messageCount: number;
  status: ConversationStatus;
  totalExpensesCreated: number;
  metadata: {
    firstMessageTimestamp: Timestamp;
    lastAccessedAt: Timestamp;
    isPinned: boolean;
  };
}

/**
 * Message attachment data structure
 */
export interface MessageAttachment {
  type: "image" | "file";
  url: string;
  fileName: string;
  mimeType: string;
}

/**
 * Expense data in message (when message resulted in expense)
 */
export interface MessageExpenseData {
  expenseId: string;
  vendor: string;
  amount: number;
  category: string;
  confirmed: boolean;
}

/**
 * Message metadata
 */
export interface MessageMetadata {
  tokenCount?: number;
  model?: string;
  processingTime?: number;
}

/**
 * Message data structure (stored in Firestore subcollection)
 */
export interface ConversationMessage {
  id: string;
  conversationId: string; // Parent reference
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Timestamp;
  attachments?: MessageAttachment[];
  expenseData?: MessageExpenseData; // If message resulted in expense
  metadata?: MessageMetadata;
  status: MessageStatus;
}

// ============================================
// BUDGETING TYPES (NEW)
// ============================================

/**
 * Budget status based on percentage used
 */
export type BudgetStatus = "safe" | "warning" | "critical" | "over";

/**
 * Budget period (month and year)
 */
export interface BudgetPeriod {
  month: number; // 1-12
  year: number;  // e.g., 2025
}

/**
 * Personal budget for a specific category and period
 */
export interface PersonalBudget {
  id: string;
  userId: string;
  category: string;
  monthlyLimit: number;
  period: BudgetPeriod;
  
  // Settings
  settings: {
    rollover: boolean;              // Carry over unused budget
    alertThreshold: number;         // Alert at % (default 80)
    notificationsEnabled: boolean;  // Enable/disable alerts
  };
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Group budget for a specific category and period
 */
export interface GroupBudget {
  id: string;
  groupId: string;
  category: string;
  monthlyLimit: number;
  period: BudgetPeriod;
  
  // Management
  setBy: string;              // userId who set it
  setByRole: GroupRole;       // owner/admin
  
  // Settings
  settings: {
    requireApprovalWhenOver: boolean; // Require approval if exceeded
    alertMembers: boolean;             // Alert all members at threshold
    alertThreshold: number;            // Default 80%
  };
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Budget usage statistics (calculated in real-time)
 */
export interface BudgetUsage {
  category: string;
  budgetLimit: number;
  totalSpent: number;
  remainingAmount: number;
  percentageUsed: number;
  status: BudgetStatus;
  expenseCount: number;
  
  // Trend data
  trend?: {
    comparedToPreviousMonth: number;  // +/- percentage
    averageSpendingRate: number;      // per day
    projectedEndOfMonthTotal: number; // prediction
    daysUntilOverBudget?: number;     // if at current rate
  };
}

/**
 * Budget usage cache (for performance)
 */
export interface BudgetUsageCache {
  id: string;
  userId?: string;           // For personal budgets
  groupId?: string;          // For group budgets
  category: string;
  period: BudgetPeriod;
  
  // Calculated values (synced with real data)
  budgetLimit: number;
  totalSpent: number;
  remainingAmount: number;
  percentageUsed: number;
  status: BudgetStatus;
  expenseCount: number;
  
  // Trend
  trend: {
    comparedToPreviousMonth: number;
    averageSpendingRate: number;
    projectedEndOfMonthTotal: number;
    daysUntilOverBudget?: number;
  };
  
  // Cache metadata
  lastCalculated: Timestamp;
  lastExpenseAt?: Timestamp;
}

/**
 * Budget summary for a user or group
 */
export interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  percentageUsed: number;
  status: BudgetStatus;
  categoriesCount: number;
  categoriesOverBudget: number;
  categoriesAtRisk: number;  // warning or critical
}

/**
 * Budget impact preview (shown before expense confirmation)
 */
export interface BudgetImpact {
  category: string;
  currentBudget: BudgetUsage;
  afterExpense: {
    totalSpent: number;
    percentageUsed: number;
    status: BudgetStatus;
    willExceedBudget: boolean;
    amountOverBudget?: number;
  };
}

/**
 * Budget alert
 */
export interface BudgetAlert {
  id: string;
  userId: string;
  category: string;
  type: "threshold" | "exceeded" | "projection";
  severity: "info" | "warning" | "error";
  message: string;
  budgetUsage: BudgetUsage;
  createdAt: Timestamp;
  readAt?: Timestamp;
  dismissedAt?: Timestamp;
}
