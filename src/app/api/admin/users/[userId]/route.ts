import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { withObservability } from "@/lib/observability/withObservability";

/** Deletes every document of `collection` whose userId matches, in batches. */
async function deleteUserDocs(collection: string, userId: string): Promise<number> {
  const snapshot = await adminDb.collection(collection).where("userId", "==", userId).get();
  for (let i = 0; i < snapshot.docs.length; i += 400) {
    const batch = adminDb.batch();
    snapshot.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snapshot.size;
}

interface ExpenseData {
  amount?: number;
}

interface AnalyticsData {
  estimatedCost?: number;
  estimatedTokens?: number;
}

// DELETE - Delete all data for a user
async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Admin SDK (rules bypassed): require a Firebase ID token with the
    // `admin: true` custom claim.
    const admin = await verifyAdmin(request);
    if (admin instanceof Response) return admin;

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
      deletedCount += await deleteUserDocs("expenses", userId);
    }

    // Delete user's analytics data. (Offline expenses live in the browser's
    // IndexedDB, not in Firestore, so there is nothing to delete for them.)
    if (deleteType === "all") {
      deletedCount += await deleteUserDocs("analytics", userId);
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
async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Admin SDK (rules bypassed): require a Firebase ID token with the
    // `admin: true` custom claim.
    const admin = await verifyAdmin(request);
    if (admin instanceof Response) return admin;

    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get user's expenses
    const expensesSnapshot = await adminDb
      .collection("expenses")
      .where("userId", "==", userId)
      .get();

    const expenses = expensesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ExpenseData[];

    const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    // Get user's analytics
    const analyticsSnapshot = await adminDb
      .collection("analytics")
      .where("userId", "==", userId)
      .get();

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

export const DELETE = withObservability(
  deleteHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/admin/users/[userId]" },
);
export const GET = withObservability(
  getHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/admin/users/[userId]" },
);
