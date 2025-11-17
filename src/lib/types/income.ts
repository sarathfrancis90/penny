import { Timestamp } from 'firebase/firestore';

/**
 * Income Categories
 */
export enum IncomeCategory {
  SALARY = 'salary',
  FREELANCE = 'freelance',
  BONUS = 'bonus',
  INVESTMENT = 'investment',
  RENTAL = 'rental',
  SIDE_HUSTLE = 'side_hustle',
  GIFT = 'gift',
  OTHER = 'other',
}

/**
 * Income Frequency
 */
export enum IncomeFrequency {
  MONTHLY = 'monthly',
  BIWEEKLY = 'biweekly',
  WEEKLY = 'weekly',
  ONCE = 'once',
  YEARLY = 'yearly',
}

/**
 * Personal Income Source
 */
export interface PersonalIncomeSource {
  id: string;
  userId: string;
  name: string; // "Salary", "Freelance", "Bonus"
  category: IncomeCategory;
  amount: number;
  frequency: IncomeFrequency;

  // Recurring details
  isRecurring: boolean;
  recurringDate?: number; // Day of month (1-31)

  // Status
  isActive: boolean;
  startDate: Timestamp;
  endDate?: Timestamp; // For fixed-term income

  // Metadata
  description?: string;
  taxable: boolean;
  netAmount?: number; // After-tax amount
  currency: string; // "USD", "CAD", etc.

  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReceivedAt?: Timestamp;
}

/**
 * Group Income Source
 */
export interface GroupIncomeSource {
  id: string;
  groupId: string;
  addedBy: string; // User ID who added
  contributedBy?: string; // Which member's income

  name: string;
  category: IncomeCategory;
  amount: number;
  frequency: IncomeFrequency;

  isRecurring: boolean;
  recurringDate?: number;

  isActive: boolean;
  startDate: Timestamp;
  endDate?: Timestamp;

  description?: string;
  taxable: boolean;
  netAmount?: number;
  currency: string;

  // Group-specific
  splitType: 'equal' | 'proportional' | 'fixed';
  allocation?: Record<string, number>; // userId -> percentage/amount

  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReceivedAt?: Timestamp;
}

/**
 * Monthly Income Record (Summary)
 */
export interface MonthlyIncomeRecord {
  id: string;
  userId?: string; // For personal
  groupId?: string; // For group
  period: {
    month: number;
    year: number;
  };

  // Income summary
  totalIncome: number;
  incomeByCategory: Record<IncomeCategory, number>;
  incomeBySource: Array<{
    sourceId: string;
    sourceName: string;
    amount: number;
    receivedAt: Timestamp;
  }>;

  // Budget allocation (EXPENSES)
  totalExpenseBudgeted: number;
  expenseBudgetByCategory: Record<string, number>;

  // Savings allocation (NEW)
  totalSavingsAllocated: number;
  savingsGoalsAllocated: Array<{
    goalId: string;
    goalName: string;
    amount: number;
  }>;

  // Total allocation (Expenses + Savings)
  totalAllocated: number; // totalExpenseBudgeted + totalSavingsAllocated
  unallocatedIncome: number;
  allocationPercentage: number; // totalAllocated / totalIncome * 100

  // Status
  isOverAllocated: boolean;
  overAllocationAmount: number;

  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp; // When user confirmed this month
}

/**
 * Monthly Setup Status
 */
export interface MonthlySetupStatus {
  id: string; // userId_YYYY_MM or groupId_YYYY_MM
  userId?: string;
  groupId?: string;
  period: {
    month: number;
    year: number;
  };

  // Setup progress
  setupCompleted: boolean;
  incomeConfirmed: boolean;
  budgetsConfirmed: boolean;
  savingsConfirmed: boolean; // NEW: Step 3
  skippedSetup: boolean;

  // Data
  previousMonthIncome: number;
  currentMonthIncome: number;
  previousMonthBudgets: Array<{
    category: string;
    limit: number;
  }>;
  currentMonthBudgets: Array<{
    category: string;
    limit: number;
  }>;
  previousMonthSavingsGoals: Array<{
    goalId: string;
    goalName: string;
    monthlyContribution: number;
  }>;
  currentMonthSavingsGoals: Array<{
    goalId: string;
    goalName: string;
    monthlyContribution: number;
  }>;

  // Tracking
  setupStartedAt?: Timestamp;
  setupCompletedAt?: Timestamp;
  lastPromptedAt?: Timestamp;
  promptCount: number;
}

/**
 * Budget Allocation History
 */
export interface BudgetAllocationHistory {
  id: string;
  userId?: string;
  groupId?: string;
  period: {
    month: number;
    year: number;
  };

  totalIncome: number;
  
  // Expense allocations
  expenseAllocations: Array<{
    category: string;
    budgetAmount: number;
    percentage: number;
  }>;
  
  // Savings allocations
  savingsAllocations: Array<{
    goalId: string;
    goalName: string;
    amount: number;
    percentage: number;
  }>;

  totalExpenseBudgeted: number;
  totalSavingsAllocated: number;
  totalAllocated: number;
  unallocated: number;
  unallocatedPercentage: number;

  recommendations: Array<{
    type: 'expense' | 'savings';
    category: string;
    suggestedAmount: number;
    reason: string;
  }>;

  createdAt: Timestamp;
}

/**
 * Helper type for creating income sources (without generated fields)
 */
export type CreatePersonalIncomeSource = Omit<
  PersonalIncomeSource,
  'id' | 'createdAt' | 'updatedAt' | 'lastReceivedAt'
>;

export type CreateGroupIncomeSource = Omit<
  GroupIncomeSource,
  'id' | 'createdAt' | 'updatedAt' | 'lastReceivedAt'
>;

/**
 * Helper type for updating income sources
 */
export type UpdatePersonalIncomeSource = Partial<
  Omit<PersonalIncomeSource, 'id' | 'userId' | 'createdAt'>
>;

export type UpdateGroupIncomeSource = Partial<
  Omit<GroupIncomeSource, 'id' | 'groupId' | 'createdAt'>
>;

