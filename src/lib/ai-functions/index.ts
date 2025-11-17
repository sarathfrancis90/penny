/**
 * AI Function Implementations
 * 
 * Server-side functions that the AI agent can call to answer user queries.
 * Each function fetches data from Firestore and returns formatted results.
 */

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

  // Fetch budgets
  const budgetCollection = groupId ? "budgets_group" : "budgets_personal";
  let budgetQuery = adminDb.collection(budgetCollection).where("userId", "==", userId);

  if (groupId) {
    budgetQuery = budgetQuery.where("groupId", "==", groupId);
  }

  if (category) {
    budgetQuery = budgetQuery.where("category", "==", category);
  }

  const budgetsSnapshot = await budgetQuery.get();

  // Fetch actual spending
  let expenseQuery = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .where("date", ">=", startDate.toISOString().split("T")[0])
    .where("date", "<=", endDate.toISOString().split("T")[0]);

  if (groupId) {
    expenseQuery = expenseQuery.where("groupId", "==", groupId);
  }

  const expensesSnapshot = await expenseQuery.get();
  const expenses: Expense[] = expensesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  // Calculate budget status
  const budgetStatus = budgetsSnapshot.docs.map((doc) => {
    const budget = doc.data();
    const categoryExpenses = expenses.filter(
      (e) => e.category === budget.category
    );
    const spent = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = budget.monthlyLimit - spent;
    const percentUsed = (spent / budget.monthlyLimit) * 100;

    return {
      category: budget.category,
      limit: budget.monthlyLimit,
      spent,
      remaining,
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
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    budgets: budgetStatus,
    totalBudget: budgetStatus.reduce((sum, b) => sum + b.limit, 0),
    totalSpent: budgetStatus.reduce((sum, b) => sum + b.spent, 0),
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

  let query = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate);

  if (groupId) {
    query = query.where("groupId", "==", groupId);
  }

  const snapshot = await query.get();
  const expenses: Expense[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const avgAmount = expenses.length > 0 ? totalAmount / expenses.length : 0;

  return {
    startDate,
    endDate,
    totalExpenses: expenses.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    averageAmount: Math.round(avgAmount * 100) / 100,
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

  let query = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate);

  if (groupId) {
    query = query.where("groupId", "==", groupId);
  }

  const snapshot = await query.get();
  const expenses: Expense[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  // Group by category
  const categoryMap = new Map<string, { amount: number; count: number }>();

  expenses.forEach((expense) => {
    const existing = categoryMap.get(expense.category) || { amount: 0, count: 0 };
    categoryMap.set(expense.category, {
      amount: existing.amount + expense.amount,
      count: existing.count + 1,
    });
  });

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Convert to array and calculate percentages
  const breakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
      percentage: Math.round((data.amount / totalAmount) * 100),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return {
    startDate,
    endDate,
    totalAmount: Math.round(totalAmount * 100) / 100,
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

  let query = adminDb
    .collection("expenses")
    .where("groupId", "==", groupId)
    .orderBy("date", "desc")
    .limit(limit);

  if (startDate) {
    query = query.where("date", ">=", startDate);
  }

  if (endDate) {
    query = query.where("date", "<=", endDate);
  }

  const snapshot = await query.get();
  const expenses: Expense[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    groupId,
    startDate: startDate || null,
    endDate: endDate || null,
    totalExpenses: expenses.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    expenses: expenses.map((e) => ({
      id: e.id,
      vendor: e.vendor,
      amount: e.amount,
      date: e.date,
      category: e.category,
      description: e.description,
    })),
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

  let query = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .limit(limit);

  // Apply filters
  if (category) {
    query = query.where("category", "==", category);
  }

  if (groupId) {
    query = query.where("groupId", "==", groupId);
  }

  if (startDate) {
    query = query.where("date", ">=", startDate);
  }

  if (endDate) {
    query = query.where("date", "<=", endDate);
  }

  const snapshot = await query.get();
  let expenses: Expense[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  // Client-side filters (Firestore limitations)
  if (vendor) {
    expenses = expenses.filter((e) =>
      e.vendor.toLowerCase().includes(vendor.toLowerCase())
    );
  }

  if (minAmount !== undefined) {
    expenses = expenses.filter((e) => e.amount >= minAmount);
  }

  if (maxAmount !== undefined) {
    expenses = expenses.filter((e) => e.amount <= maxAmount);
  }

  return {
    totalResults: expenses.length,
    expenses: expenses.map((e) => ({
      id: e.id,
      vendor: e.vendor,
      amount: e.amount,
      date: e.date,
      category: e.category,
      description: e.description,
      groupId: e.groupId || null,
    })),
  };
}

/**
 * Get recent expenses
 */
export async function getRecentExpenses(
  userId: string,
  params: RecentExpensesParams
) {
  const { limit = 10, groupId } = params;

  let query = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (groupId) {
    query = query.where("groupId", "==", groupId);
  }

  const snapshot = await query.get();
  const expenses: Expense[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    totalExpenses: expenses.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    expenses: expenses.map((e) => ({
      id: e.id,
      vendor: e.vendor,
      amount: e.amount,
      date: e.date,
      category: e.category,
      description: e.description,
      groupId: e.groupId || null,
    })),
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

  // Fetch Period 1 expenses
  let query1 = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .where("date", ">=", period1Start)
    .where("date", "<=", period1End);

  if (category) {
    query1 = query1.where("category", "==", category);
  }

  if (groupId) {
    query1 = query1.where("groupId", "==", groupId);
  }

  const snapshot1 = await query1.get();
  const expenses1: Expense[] = snapshot1.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  // Fetch Period 2 expenses
  let query2 = adminDb
    .collection("expenses")
    .where("userId", "==", userId)
    .where("date", ">=", period2Start)
    .where("date", "<=", period2End);

  if (category) {
    query2 = query2.where("category", "==", category);
  }

  if (groupId) {
    query2 = query2.where("groupId", "==", groupId);
  }

  const snapshot2 = await query2.get();
  const expenses2: Expense[] = snapshot2.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Expense));

  const total1 = expenses1.reduce((sum, e) => sum + e.amount, 0);
  const total2 = expenses2.reduce((sum, e) => sum + e.amount, 0);
  const difference = total2 - total1;
  const percentageChange =
    total1 > 0 ? Math.round(((total2 - total1) / total1) * 100) : 0;

  return {
    period1: {
      startDate: period1Start,
      endDate: period1End,
      totalExpenses: expenses1.length,
      totalAmount: Math.round(total1 * 100) / 100,
    },
    period2: {
      startDate: period2Start,
      endDate: period2End,
      totalExpenses: expenses2.length,
      totalAmount: Math.round(total2 * 100) / 100,
    },
    comparison: {
      difference: Math.round(difference * 100) / 100,
      percentageChange,
      trend: difference > 0 ? "increased" : difference < 0 ? "decreased" : "unchanged",
    },
  };
}

