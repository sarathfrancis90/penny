import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";

interface ExpenseData {
  amount?: number;
}

interface AnalyticsData {
  estimatedCost?: number;
  estimatedTokens?: number;
}

// DELETE - Delete all data for a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get search params to determine what to delete
    const { searchParams } = new URL(request.url);
    const deleteType = searchParams.get("type") || "all"; // "expenses" or "all"

    let deletedCount = 0;

    // Delete user's expenses
    if (deleteType === "expenses" || deleteType === "all") {
      const expensesRef = collection(db, "expenses");
      const expensesQuery = query(expensesRef, where("userId", "==", userId));
      const expensesSnapshot = await getDocs(expensesQuery);

      const deletePromises = expensesSnapshot.docs.map((expenseDoc) =>
        deleteDoc(expenseDoc.ref)
      );

      await Promise.all(deletePromises);
      deletedCount += expensesSnapshot.size;
    }

    // Delete user's analytics data
    if (deleteType === "all") {
      const analyticsRef = collection(db, "analytics");
      const analyticsQuery = query(analyticsRef, where("userId", "==", userId));
      const analyticsSnapshot = await getDocs(analyticsQuery);

      const deletePromises = analyticsSnapshot.docs.map((analyticsDoc) =>
        deleteDoc(analyticsDoc.ref)
      );

      await Promise.all(deletePromises);
      deletedCount += analyticsSnapshot.size;
    }

    // Delete offline data if exists
    if (deleteType === "all") {
      const offlineRef = collection(db, "offlineExpenses");
      const offlineQuery = query(offlineRef, where("userId", "==", userId));
      const offlineSnapshot = await getDocs(offlineQuery);

      const deletePromises = offlineSnapshot.docs.map((offlineDoc) =>
        deleteDoc(offlineDoc.ref)
      );

      await Promise.all(deletePromises);
      deletedCount += offlineSnapshot.size;
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} records for user ${userId}`,
      deletedCount,
      deleteType,
    });
  } catch (error) {
    console.error("Error deleting user data:", error);
    return NextResponse.json(
      {
        error: "Failed to delete user data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET - Get detailed user info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get user's expenses
    const expensesRef = collection(db, "expenses");
    const expensesQuery = query(expensesRef, where("userId", "==", userId));
    const expensesSnapshot = await getDocs(expensesQuery);

    const expenses = expensesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ExpenseData[];

    const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    // Get user's analytics
    const analyticsRef = collection(db, "analytics");
    const analyticsQuery = query(analyticsRef, where("userId", "==", userId));
    const analyticsSnapshot = await getDocs(analyticsQuery);

    const analytics = analyticsSnapshot.docs.map((doc) => doc.data()) as AnalyticsData[];
    const totalCost = analytics.reduce((sum: number, a) => sum + (a.estimatedCost || 0), 0);
    const totalTokens = analytics.reduce((sum: number, a) => sum + (a.estimatedTokens || 0), 0);

    return NextResponse.json({
      success: true,
      userId,
      stats: {
        expenseCount: expenses.length,
        totalAmount,
        apiCalls: analytics.length,
        totalTokens,
        totalCost,
      },
      recentExpenses: expenses.slice(0, 10),
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch user details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

