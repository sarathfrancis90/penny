/**
 * Budget Calculation Utilities
 * 
 * Core calculations for budget tracking, status determination,
 * trend analysis, and projections.
 */

import { Timestamp } from "firebase/firestore";
import type {
  BudgetStatus,
  BudgetUsage,
  BudgetPeriod,
  Expense,
  PersonalBudget,
  GroupBudget,
} from "./types";

/**
 * Get current budget period (month and year)
 */
export function getCurrentPeriod(): BudgetPeriod {
  const now = new Date();
  return {
    month: now.getMonth() + 1, // 0-indexed, so +1
    year: now.getFullYear(),
  };
}

/**
 * Check if a timestamp falls within a budget period
 */
export function isInPeriod(timestamp: Timestamp | Date, period: BudgetPeriod): boolean {
  const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  
  return month === period.month && year === period.year;
}

/**
 * Get start and end dates for a budget period
 */
export function getPeriodBounds(period: BudgetPeriod): { start: Date; end: Date } {
  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 0, 23, 59, 59, 999); // Last day of month
  
  return { start, end };
}

/**
 * Calculate days in a month
 */
export function getDaysInMonth(period: BudgetPeriod): number {
  return new Date(period.year, period.month, 0).getDate();
}

/**
 * Get current day of month
 */
export function getCurrentDayOfMonth(): number {
  return new Date().getDate();
}

/**
 * Determine budget status based on percentage used
 */
export function getBudgetStatus(percentageUsed: number): BudgetStatus {
  if (percentageUsed > 100) return "over";
  if (percentageUsed >= 91) return "critical";
  if (percentageUsed >= 71) return "warning";
  return "safe";
}

/**
 * Calculate budget usage from expenses
 */
export function calculateBudgetUsage(
  category: string,
  budgetLimit: number,
  expenses: Expense[],
  period: BudgetPeriod,
  previousMonthExpenses?: Expense[]
): BudgetUsage {
  // Filter expenses for this category and period
  const relevantExpenses = expenses.filter(
    (exp) => exp.category === category && isInPeriod(exp.date, period)
  );
  
  // Calculate total spent
  const totalSpent = relevantExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Calculate basic metrics
  const remainingAmount = budgetLimit - totalSpent;
  const percentageUsed = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;
  const status = getBudgetStatus(percentageUsed);
  
  // Calculate trend data
  const trend = calculateTrend(
    relevantExpenses,
    previousMonthExpenses || [],
    period,
    budgetLimit
  );
  
  return {
    category,
    budgetLimit,
    totalSpent,
    remainingAmount,
    percentageUsed,
    status,
    expenseCount: relevantExpenses.length,
    trend,
  };
}

/**
 * Calculate spending trends and projections
 */
function calculateTrend(
  currentExpenses: Expense[],
  previousExpenses: Expense[],
  period: BudgetPeriod,
  budgetLimit: number
) {
  const currentTotal = currentExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const previousTotal = previousExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Month-over-month comparison
  const comparedToPreviousMonth = previousTotal > 0
    ? ((currentTotal - previousTotal) / previousTotal) * 100
    : 0;
  
  // Daily average spending rate
  const daysInMonth = getDaysInMonth(period);
  const currentDay = getCurrentDayOfMonth();
  const daysPassed = Math.min(currentDay, daysInMonth);
  const averageSpendingRate = daysPassed > 0 ? currentTotal / daysPassed : 0;
  
  // Project end-of-month total
  const daysRemaining = daysInMonth - daysPassed;
  const projectedFutureSpending = averageSpendingRate * daysRemaining;
  const projectedEndOfMonthTotal = currentTotal + projectedFutureSpending;
  
  // Days until over budget (if current rate continues)
  let daysUntilOverBudget: number | undefined;
  if (projectedEndOfMonthTotal > budgetLimit && averageSpendingRate > 0) {
    const remainingBudget = budgetLimit - currentTotal;
    daysUntilOverBudget = Math.ceil(remainingBudget / averageSpendingRate);
  }
  
  return {
    comparedToPreviousMonth,
    averageSpendingRate,
    projectedEndOfMonthTotal,
    daysUntilOverBudget,
  };
}

/**
 * Calculate budget impact of adding a new expense
 */
export function calculateBudgetImpact(
  currentUsage: BudgetUsage,
  newExpenseAmount: number
): {
  totalSpent: number;
  percentageUsed: number;
  status: BudgetStatus;
  willExceedBudget: boolean;
  amountOverBudget?: number;
} {
  const totalSpent = currentUsage.totalSpent + newExpenseAmount;
  const percentageUsed = currentUsage.budgetLimit > 0
    ? (totalSpent / currentUsage.budgetLimit) * 100
    : 0;
  const status = getBudgetStatus(percentageUsed);
  const willExceedBudget = percentageUsed > 100;
  const amountOverBudget = willExceedBudget
    ? totalSpent - currentUsage.budgetLimit
    : undefined;
  
  return {
    totalSpent,
    percentageUsed,
    status,
    willExceedBudget,
    amountOverBudget,
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Get budget document ID
 */
export function getPersonalBudgetId(
  userId: string,
  category: string,
  period: BudgetPeriod
): string {
  return `${userId}_${category}_${period.year}_${period.month}`;
}

/**
 * Get group budget document ID
 */
export function getGroupBudgetId(
  groupId: string,
  category: string,
  period: BudgetPeriod
): string {
  return `${groupId}_${category}_${period.year}_${period.month}`;
}

/**
 * Get budget cache document ID
 */
export function getBudgetCacheId(
  category: string,
  period: BudgetPeriod,
  userId?: string,
  groupId?: string
): string {
  const prefix = userId || groupId || "unknown";
  return `${prefix}_${category}_${period.year}_${period.month}`;
}

/**
 * Check if should show budget alert
 */
export function shouldShowAlert(
  percentageUsed: number,
  alertThreshold: number
): boolean {
  return percentageUsed >= alertThreshold;
}

/**
 * Get alert severity based on status
 */
export function getAlertSeverity(status: BudgetStatus): "info" | "warning" | "error" {
  switch (status) {
    case "safe":
      return "info";
    case "warning":
    case "critical":
      return "warning";
    case "over":
      return "error";
    default:
      return "info";
  }
}

/**
 * Generate alert message
 */
export function generateAlertMessage(
  category: string,
  usage: BudgetUsage
): string {
  const { status, percentageUsed, budgetLimit, totalSpent } = usage;
  
  switch (status) {
    case "warning":
      return `You've used ${formatPercentage(percentageUsed)} of your ${category} budget`;
    case "critical":
      return `Warning: You're approaching your ${category} budget limit`;
    case "over":
      return `You've exceeded your ${category} budget by ${formatCurrency(totalSpent - budgetLimit)}`;
    default:
      return `Your ${category} budget is on track`;
  }
}

/**
 * Calculate overall budget summary from multiple categories
 */
export function calculateBudgetSummary(
  budgetUsages: BudgetUsage[]
): {
  totalBudget: number;
  totalSpent: number;
  percentageUsed: number;
  status: BudgetStatus;
  categoriesCount: number;
  categoriesOverBudget: number;
  categoriesAtRisk: number;
} {
  const totalBudget = budgetUsages.reduce((sum, usage) => sum + usage.budgetLimit, 0);
  const totalSpent = budgetUsages.reduce((sum, usage) => sum + usage.totalSpent, 0);
  const percentageUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const status = getBudgetStatus(percentageUsed);
  
  const categoriesOverBudget = budgetUsages.filter(
    (usage) => usage.status === "over"
  ).length;
  
  const categoriesAtRisk = budgetUsages.filter(
    (usage) => usage.status === "warning" || usage.status === "critical"
  ).length;
  
  return {
    totalBudget,
    totalSpent,
    percentageUsed,
    status,
    categoriesCount: budgetUsages.length,
    categoriesOverBudget,
    categoriesAtRisk,
  };
}

/**
 * Sort budgets by status (critical first, then warning, safe, over)
 */
export function sortBudgetsByStatus(budgets: BudgetUsage[]): BudgetUsage[] {
  const order: Record<BudgetStatus, number> = {
    over: 1,
    critical: 2,
    warning: 3,
    safe: 4,
  };
  
  return [...budgets].sort((a, b) => {
    return order[a.status] - order[b.status];
  });
}

/**
 * Get color class for budget status
 */
export function getStatusColor(status: BudgetStatus): string {
  switch (status) {
    case "safe":
      return "text-green-600 dark:text-green-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "critical":
      return "text-orange-600 dark:text-orange-400";
    case "over":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}

/**
 * Get background color class for budget status
 */
export function getStatusBgColor(status: BudgetStatus): string {
  switch (status) {
    case "safe":
      return "bg-green-50 dark:bg-green-950/30";
    case "warning":
      return "bg-amber-50 dark:bg-amber-950/30";
    case "critical":
      return "bg-orange-50 dark:bg-orange-950/30";
    case "over":
      return "bg-red-50 dark:bg-red-950/30";
    default:
      return "bg-gray-50 dark:bg-gray-950/30";
  }
}

/**
 * Get border color class for budget status
 */
export function getStatusBorderColor(status: BudgetStatus): string {
  switch (status) {
    case "safe":
      return "border-green-200 dark:border-green-800";
    case "warning":
      return "border-amber-200 dark:border-amber-800";
    case "critical":
      return "border-orange-200 dark:border-orange-800";
    case "over":
      return "border-red-200 dark:border-red-800";
    default:
      return "border-gray-200 dark:border-gray-800";
  }
}

/**
 * Get progress bar gradient for budget status
 */
export function getStatusGradient(status: BudgetStatus): string {
  switch (status) {
    case "safe":
      return "from-green-500 to-emerald-500";
    case "warning":
      return "from-amber-500 to-orange-500";
    case "critical":
      return "from-orange-500 to-red-500";
    case "over":
      return "from-red-500 to-rose-600";
    default:
      return "from-gray-500 to-gray-600";
  }
}

