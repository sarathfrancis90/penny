import { Timestamp } from 'firebase/firestore';

/**
 * Savings Categories
 */
export enum SavingsCategory {
  EMERGENCY_FUND = 'emergency_fund',
  TRAVEL = 'travel',
  EDUCATION = 'education',
  HEALTH = 'health',
  HOUSE_DOWN_PAYMENT = 'house_down_payment',
  CAR = 'car',
  WEDDING = 'wedding',
  RETIREMENT = 'retirement',
  INVESTMENT = 'investment',
  CUSTOM = 'custom',
}

/**
 * Goal Status
 */
export enum GoalStatus {
  ACTIVE = 'active',
  ACHIEVED = 'achieved',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

/**
 * Goal Priority
 */
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Personal Savings Goal
 */
export interface PersonalSavingsGoal {
  id: string;
  userId: string;
  name: string; // "Emergency Fund", "Japan Trip", "New Car"
  category: SavingsCategory;

  // Goal details
  targetAmount: number; // Total goal (e.g., $10,000)
  currentAmount: number; // How much saved so far
  monthlyContribution: number; // Planned monthly allocation

  // Timeline
  targetDate?: Timestamp; // When goal should be reached
  startDate: Timestamp;
  achievedDate?: Timestamp; // When goal was reached

  // Status
  status: GoalStatus;
  isActive: boolean;
  priority: GoalPriority;

  // Progress tracking
  progressPercentage: number; // (currentAmount / targetAmount) * 100
  monthsToGoal?: number; // Estimated months to reach goal
  onTrack: boolean; // Is monthly contribution being met?

  // Metadata
  description?: string;
  emoji?: string; // ✈️ 🏠 🎓 💰
  currency: string;

  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastContributionAt?: Timestamp;
}

/**
 * Group Savings Goal
 */
export interface GroupSavingsGoal {
  id: string;
  groupId: string;
  createdBy: string; // User ID who created

  name: string;
  category: SavingsCategory;

  // Goal details
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;

  // Timeline
  targetDate?: Timestamp;
  startDate: Timestamp;
  achievedDate?: Timestamp;

  // Status
  status: GoalStatus;
  isActive: boolean;
  priority: GoalPriority;

  // Progress tracking
  progressPercentage: number;
  monthsToGoal?: number;
  onTrack: boolean;

  // Group-specific
  contributionType: 'equal' | 'proportional' | 'custom';
  contributions: Array<{
    userId: string;
    userName: string;
    monthlyAmount: number;
    totalContributed: number;
  }>;

  // Metadata
  description?: string;
  emoji?: string;
  currency: string;

  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastContributionAt?: Timestamp;
}

/**
 * Savings Contribution
 */
export interface SavingsContribution {
  id: string;
  userId?: string;
  groupId?: string;
  goalId: string;
  goalName: string;

  amount: number;
  date: Timestamp;
  period: {
    month: number;
    year: number;
  };

  // Type
  contributionType: 'manual' | 'auto' | 'from_expense_savings';
  source?: string; // Where money came from

  // Metadata
  note?: string;
  currency: string;

  createdAt: Timestamp;
}

/**
 * Monthly Savings Summary
 */
export interface MonthlySavingsSummary {
  id: string;
  userId?: string;
  groupId?: string;
  period: {
    month: number;
    year: number;
  };

  // Savings allocation
  totalSavingsAllocated: number; // Total monthly savings budget
  totalSavingsContributed: number; // Actual amount saved
  savingsGoalsMet: boolean; // All goals contributions met?

  // By goal
  goalContributions: Array<{
    goalId: string;
    goalName: string;
    plannedAmount: number;
    actualAmount: number;
    met: boolean;
  }>;

  // YTD (Year-to-Date)
  ytdSavings: number;
  ytdByCategory: Record<SavingsCategory, number>;

  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Helper type for creating savings goals (without generated fields)
 */
export type CreatePersonalSavingsGoal = Omit<
  PersonalSavingsGoal,
  'id' | 'createdAt' | 'updatedAt' | 'lastContributionAt' | 'progressPercentage' | 'monthsToGoal' | 'onTrack'
>;

export type CreateGroupSavingsGoal = Omit<
  GroupSavingsGoal,
  'id' | 'createdAt' | 'updatedAt' | 'lastContributionAt' | 'progressPercentage' | 'monthsToGoal' | 'onTrack'
>;

/**
 * Helper type for updating savings goals
 */
export type UpdatePersonalSavingsGoal = Partial<
  Omit<PersonalSavingsGoal, 'id' | 'userId' | 'createdAt'>
>;

export type UpdateGroupSavingsGoal = Partial<
  Omit<GroupSavingsGoal, 'id' | 'groupId' | 'createdAt'>
>;

/**
 * Helper type for creating contributions
 */
export type CreateSavingsContribution = Omit<SavingsContribution, 'id' | 'createdAt'>;

/**
 * Helper functions for category display
 */
export const SAVINGS_CATEGORY_LABELS: Record<SavingsCategory, string> = {
  [SavingsCategory.EMERGENCY_FUND]: 'Emergency Fund',
  [SavingsCategory.TRAVEL]: 'Travel',
  [SavingsCategory.EDUCATION]: 'Education',
  [SavingsCategory.HEALTH]: 'Health',
  [SavingsCategory.HOUSE_DOWN_PAYMENT]: 'House Down Payment',
  [SavingsCategory.CAR]: 'Car',
  [SavingsCategory.WEDDING]: 'Wedding',
  [SavingsCategory.RETIREMENT]: 'Retirement',
  [SavingsCategory.INVESTMENT]: 'Investment',
  [SavingsCategory.CUSTOM]: 'Custom',
};

export const SAVINGS_CATEGORY_EMOJIS: Record<SavingsCategory, string> = {
  [SavingsCategory.EMERGENCY_FUND]: '💰',
  [SavingsCategory.TRAVEL]: '✈️',
  [SavingsCategory.EDUCATION]: '🎓',
  [SavingsCategory.HEALTH]: '💊',
  [SavingsCategory.HOUSE_DOWN_PAYMENT]: '🏠',
  [SavingsCategory.CAR]: '🚗',
  [SavingsCategory.WEDDING]: '💍',
  [SavingsCategory.RETIREMENT]: '🏖️',
  [SavingsCategory.INVESTMENT]: '📈',
  [SavingsCategory.CUSTOM]: '🎯',
};

