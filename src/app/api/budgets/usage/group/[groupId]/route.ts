import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  calculateBudgetUsage,
  calculateTrend,
  getCurrentPeriod,
} from "@/lib/budgetCalculations";
import { Expense } from "@/lib/types";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/budgets/usage/group/[groupId]
 * Calculate budget usage for all group budgets
 * Query params: userId (required), month (optional), year (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Verify user is a member of the group
    const memberDoc = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", groupId)
      .where("userId", "==", userId)
      .get();

    if (memberDoc.empty) {
      return NextResponse.json(
        { error: "User is not a member of this group" },
        { status: 403 }
      );
    }

    // Determine period
    const currentPeriod = getCurrentPeriod();
    const month = monthParam ? parseInt(monthParam) : currentPeriod.month;
    const year = yearParam ? parseInt(yearParam) : currentPeriod.year;

    // Fetch all group budgets for this period
    const budgetsSnapshot = await adminDb
      .collection("budgets_group")
      .where("groupId", "==", groupId)
      .where("period.month", "==", month)
      .where("period.year", "==", year)
      .get();

    if (budgetsSnapshot.empty) {
      return NextResponse.json({ usage: [] }, { status: 200 });
    }

    // Fetch all group expenses for this period
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const expensesSnapshot = await adminDb
      .collection("expenses")
      .where("groupId", "==", groupId)
      .where("date", ">=", Timestamp.fromDate(startDate))
      .where("date", "<=", Timestamp.fromDate(endDate))
      .get();

    const expenses: Expense[] = expensesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Expense[];

    // Calculate usage for each budget
    const usageData = budgetsSnapshot.docs.map((doc) => {
      const budget = doc.data();
      const category = budget.category;
      const budgetLimit = budget.monthlyLimit;
      const alertThreshold = budget.settings?.alertThreshold || 80;

      // Filter expenses for this category
      const categoryExpenses = expenses.filter(
        (exp) => exp.category === category
      );
      const totalSpent = categoryExpenses.reduce(
        (sum, exp) => sum + exp.amount,
        0
      );

      // Calculate basic usage
      const usage = calculateBudgetUsage(budgetLimit, totalSpent, alertThreshold);

      // Calculate trend (requires previous month's data)
      const previousMonth = month === 1 ? 12 : month - 1;
      const previousYear = month === 1 ? year - 1 : year;

      const prevStartDate = new Date(previousYear, previousMonth - 1, 1);
      const prevEndDate = new Date(previousYear, previousMonth, 0, 23, 59, 59, 999);

      return adminDb
        .collection("expenses")
        .where("groupId", "==", groupId)
        .where("date", ">=", Timestamp.fromDate(prevStartDate))
        .where("date", "<=", Timestamp.fromDate(prevEndDate))
        .get()
        .then((prevSnapshot) => {
          const prevExpenses = prevSnapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((exp) => exp.category === category);

          const prevTotalSpent = prevExpenses.reduce(
            (sum, exp) => sum + (exp.amount || 0),
            0
          );

          const trend = calculateTrend(
            totalSpent,
            prevTotalSpent,
            budgetLimit,
            { month, year }
          );

          return {
            budgetId: doc.id,
            category,
            budgetLimit,
            totalSpent: usage.totalSpent,
            remainingAmount: usage.remainingAmount,
            percentageUsed: usage.percentageUsed,
            status: usage.status,
            expenseCount: categoryExpenses.length,
            trend,
          };
        });
    });

    // Wait for all trend calculations
    const resolvedUsage = await Promise.all(usageData);

    return NextResponse.json({ usage: resolvedUsage }, { status: 200 });
  } catch (error) {
    console.error("Error calculating group budget usage:", error);
    return NextResponse.json(
      { error: "Failed to calculate budget usage" },
      { status: 500 }
    );
  }
}

