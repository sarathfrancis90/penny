/**
 * AI Function Implementations
 *
 * Server-side functions that the AI agent can call to answer user queries.
 * Each function fetches data from Firestore and returns formatted results.
 *
 * These run with the Admin SDK, so security rules do not apply: every group
 * read is gated on the caller's active membership here.
 *
 * Document shapes (src/lib/types.ts):
 * - expenses.date is a Timestamp stored at local noon of the calendar day;
 *   the AI speaks YYYY-MM-DD, so we convert both ways.
 * - Group expenses carry groupId + expenseType 'group' and belong to the
 *   whole group, not only to the member who logged them.
 * - budgets_group documents have no userId (setBy is the author).
 * - Budgets are per month: period { month: 1-12, year }.
 */

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { Expense } from "@/lib/types";
import {
  BudgetStatusParams,
  ExpenseSummaryParams,
  CategoryBreakdownParams,
  GroupExpensesParams,
  SearchExpensesParams,
  RecentExpensesParams,
  ComparePeriodsParams,
} from "@/lib/gemini-functions";

/** Upper bound on documents read when filtering in memory. */
const MAX_SCAN = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDay(value: string, field: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    throw new Error(`${field} must be a date in YYYY-MM-DD format`);
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    throw new Error(`${field} must be a date in YYYY-MM-DD format`);
  }
  return [year, month, day];
}

/** Start of a calendar day (inclusive lower bound). */
function startOfDay(value: string, field: string): Timestamp {
  const [y, m, d] = parseDay(value, field);
  return Timestamp.fromDate(new Date(y, m - 1, d, 0, 0, 0, 0));
}

/** End of a calendar day (inclusive upper bound). */
function endOfDay(value: string, field: string): Timestamp {
  const [y, m, d] = parseDay(value, field);
  return Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59, 999));
}

function toDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Expense date (Timestamp, legacy string or Date) as YYYY-MM-DD. */
function formatExpenseDate(value: unknown): string | null {
  if (value instanceof Timestamp) return toDayString(value.toDate());
  if (value instanceof Date) return toDayString(value);
  if (typeof value === "string") return value.slice(0, 10);
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return toDayString((value as { toDate: () => Date }).toDate());
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Throws unless the user is an active member of the group. */
async function assertActiveMember(userId: string, groupId: string): Promise<void> {
  const membership = await adminDb
    .collection("groupMembers")
    .doc(`${groupId}_${userId}`)
    .get();
  if (!membership.exists || membership.data()?.status !== "active") {
    throw new Error("You are not an active member of this group");
  }
}

interface ExpenseScope {
  userId: string;
  groupId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Fetches expenses newest first. Without a groupId: the user's own
 * expenses. With a groupId: every member's expenses in that group (after a
 * membership check). Served by the (userId, date DESC) and
 * (expenseType, groupId, date DESC) composite indexes.
 */
async function fetchExpenses(scope: ExpenseScope): Promise<Expense[]> {
  const { userId, groupId, startDate, endDate, limit = MAX_SCAN } = scope;

  let query = groupId
    ? adminDb
        .collection("expenses")
        .where("groupId", "==", groupId)
        .where("expenseType", "==", "group")
    : adminDb.collection("expenses").where("userId", "==", userId);

  if (groupId) {
    await assertActiveMember(userId, groupId);
  }
  if (startDate) {
    query = query.where("date", ">=", startOfDay(startDate, "startDate"));
  }
  if (endDate) {
    query = query.where("date", "<=", endOfDay(endDate, "endDate"));
  }

  const snapshot = await query.orderBy("date", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Expense));
}

function sumAmounts(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + (typeof e.amount === "number" ? e.amount : 0), 0);
}

function describeExpense(e: Expense) {
  return {
    id: e.id,
    vendor: e.vendor,
    amount: e.amount,
    date: formatExpenseDate(e.date),
    category: e.category,
    description: e.description,
    groupId: e.groupId || null,
  };
}

/** Every { month, year } touched by [start, end]. */
function monthsBetween(start: Date, end: Date): Array<{ month: number; year: number }> {
  const months: Array<{ month: number; year: number }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Get budget status for categories
 */
export async function getBudgetStatus(
  userId: string,
  params: BudgetStatusParams
) {
  const { category, groupId, period = "current" } = params;

  // Calculate date range based on period
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (period) {
    case "last_month":
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "last_3_months":
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      break;
    case "current":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const startDay = toDayString(startDate);
  const endDay = toDayString(endDate);

  if (groupId) {
    await assertActiveMember(userId, groupId);
  }

  // Budgets are monthly documents: sum the limits of every month in range.
  const limits = new Map<string, number>();
  for (const { month, year } of monthsBetween(startDate, endDate)) {
    let budgetQuery = groupId
      ? adminDb.collection("budgets_group").where("groupId", "==", groupId)
      : adminDb.collection("budgets_personal").where("userId", "==", userId);
    budgetQuery = budgetQuery
      .where("period.month", "==", month)
      .where("period.year", "==", year);
    if (category) {
      budgetQuery = budgetQuery.where("category", "==", category);
    }
    const snapshot = await budgetQuery.get();
    for (const doc of snapshot.docs) {
      const budget = doc.data();
      if (typeof budget.monthlyLimit !== "number") continue;
      limits.set(budget.category, (limits.get(budget.category) ?? 0) + budget.monthlyLimit);
    }
  }

  // Personal budgets track personal expenses only (as /api/budgets/usage
  // does); group budgets track all of the group's expenses.
  const expenses = (
    await fetchExpenses({ userId, groupId, startDate: startDay, endDate: endDay })
  ).filter((e) => (groupId ? true : !e.groupId));

  const budgetStatus = Array.from(limits.entries()).map(([budgetCategory, limit]) => {
    const spent = round2(sumAmounts(expenses.filter((e) => e.category === budgetCategory)));
    const percentUsed = limit > 0 ? (spent / limit) * 100 : 0;

    return {
      category: budgetCategory,
      limit,
      spent,
      remaining: round2(limit - spent),
      percentUsed: Math.round(percentUsed),
      status:
        percentUsed >= 100
          ? "over"
          : percentUsed >= 90
          ? "critical"
          : percentUsed >= 75
          ? "warning"
          : "safe",
    };
  });

  return {
    period,
    startDate: startDay,
    endDate: endDay,
    groupId: groupId || null,
    budgets: budgetStatus,
    totalBudget: round2(budgetStatus.reduce((sum, b) => sum + b.limit, 0)),
    totalSpent: round2(budgetStatus.reduce((sum, b) => sum + b.spent, 0)),
  };
}

/**
 * Get expense summary for a date range
 */
export async function getExpenseSummary(
  userId: string,
  params: ExpenseSummaryParams
) {
  const { startDate, endDate, groupId } = params;

  const expenses = await fetchExpenses({ userId, groupId, startDate, endDate });

  const totalAmount = sumAmounts(expenses);
  const avgAmount = expenses.length > 0 ? totalAmount / expenses.length : 0;

  return {
    startDate,
    endDate,
    totalExpenses: expenses.length,
    totalAmount: round2(totalAmount),
    averageAmount: round2(avgAmount),
    groupId: groupId || null,
  };
}

/**
 * Get category breakdown
 */
export async function getCategoryBreakdown(
  userId: string,
  params: CategoryBreakdownParams
) {
  const { startDate, endDate, groupId, limit = 10 } = params;

  const expenses = await fetchExpenses({ userId, groupId, startDate, endDate });

  // Group by category
  const categoryMap = new Map<string, { amount: number; count: number }>();

  expenses.forEach((expense) => {
    const existing = categoryMap.get(expense.category) || { amount: 0, count: 0 };
    categoryMap.set(expense.category, {
      amount: existing.amount + expense.amount,
      count: existing.count + 1,
    });
  });

  const totalAmount = sumAmounts(expenses);

  // Convert to array and calculate percentages
  const breakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      amount: round2(data.amount),
      count: data.count,
      percentage: totalAmount > 0 ? Math.round((data.amount / totalAmount) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return {
    startDate,
    endDate,
    groupId: groupId || null,
    totalAmount: round2(totalAmount),
    categories: breakdown,
  };
}

/**
 * Get group expenses
 */
export async function getGroupExpenses(
  userId: string,
  params: GroupExpensesParams
) {
  const { groupId, startDate, endDate, limit = 50 } = params;

  const expenses = await fetchExpenses({ userId, groupId, startDate, endDate, limit });

  return {
    groupId,
    startDate: startDate || null,
    endDate: endDate || null,
    totalExpenses: expenses.length,
    totalAmount: round2(sumAmounts(expenses)),
    expenses: expenses.map((e) => {
      const { groupId: _groupId, ...rest } = describeExpense(e);
      void _groupId;
      return { ...rest, userId: e.userId };
    }),
  };
}

/**
 * Search expenses
 */
export async function searchExpenses(
  userId: string,
  params: SearchExpensesParams
) {
  const {
    vendor,
    category,
    minAmount,
    maxAmount,
    startDate,
    endDate,
    groupId,
    limit = 20,
  } = params;

  let expenses = await fetchExpenses({ userId, groupId, startDate, endDate });

  // Filter in memory, then apply the limit, so a vendor or amount filter is
  // not limited to the first N documents.
  if (category) {
    expenses = expenses.filter((e) => e.category === category);
  }

  if (vendor) {
    const needle = vendor.toLowerCase();
    expenses = expenses.filter((e) => (e.vendor ?? "").toLowerCase().includes(needle));
  }

  if (minAmount !== undefined) {
    expenses = expenses.filter((e) => e.amount >= minAmount);
  }

  if (maxAmount !== undefined) {
    expenses = expenses.filter((e) => e.amount <= maxAmount);
  }

  const results = expenses.slice(0, limit);

  return {
    totalResults: results.length,
    totalMatches: expenses.length,
    expenses: results.map(describeExpense),
  };
}

/**
 * Get recent expenses (newest expense date first)
 */
export async function getRecentExpenses(
  userId: string,
  params: RecentExpensesParams
) {
  const { limit = 10, groupId } = params;

  const expenses = await fetchExpenses({ userId, groupId, limit });

  return {
    totalExpenses: expenses.length,
    totalAmount: round2(sumAmounts(expenses)),
    expenses: expenses.map(describeExpense),
  };
}

/**
 * Compare periods
 */
export async function comparePeriods(
  userId: string,
  params: ComparePeriodsParams
) {
  const { period1Start, period1End, period2Start, period2End, category, groupId } = params;

  const inCategory = (e: Expense) => !category || e.category === category;

  const expenses1 = (
    await fetchExpenses({ userId, groupId, startDate: period1Start, endDate: period1End })
  ).filter(inCategory);
  const expenses2 = (
    await fetchExpenses({ userId, groupId, startDate: period2Start, endDate: period2End })
  ).filter(inCategory);

  const total1 = sumAmounts(expenses1);
  const total2 = sumAmounts(expenses2);
  const difference = total2 - total1;
  const percentageChange =
    total1 > 0 ? Math.round(((total2 - total1) / total1) * 100) : 0;

  return {
    period1: {
      startDate: period1Start,
      endDate: period1End,
      totalExpenses: expenses1.length,
      totalAmount: round2(total1),
    },
    period2: {
      startDate: period2Start,
      endDate: period2End,
      totalExpenses: expenses2.length,
      totalAmount: round2(total2),
    },
    comparison: {
      difference: round2(difference),
      percentageChange,
      trend: difference > 0 ? "increased" : difference < 0 ? "decreased" : "unchanged",
    },
  };
}
