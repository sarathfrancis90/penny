import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { withObservability } from "@/lib/observability/withObservability";

/** Expense dates are Timestamps stored at local noon; export YYYY-MM-DD. */
function exportDate(value: unknown): string {
  if (value instanceof Timestamp) {
    const d = value.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return typeof value === "string" ? value : "";
}

// GET - Export all data for a specific user
async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Admin SDK (rules bypassed): require a Firebase ID token with the
    // `admin: true` custom claim.
    const admin = await verifyAdmin(request);
    if (admin instanceof Response) return admin;

    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get user profile from Firebase Auth
    let userProfile = null;
    try {
      const userRecord = await adminAuth.getUser(userId);
      userProfile = {
        uid: userRecord.uid,
        email: userRecord.email || null,
        displayName: userRecord.displayName || null,
        photoURL: userRecord.photoURL || null,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
        createdAt: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime || null,
      };
    } catch (error) {
      console.warn("Could not fetch user profile:", error);
    }

    // Get all expenses for this user
    const expensesSnapshot = await adminDb
      .collection("expenses")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    
    interface ExpenseData {
      id: string;
      vendor: string;
      amount: number;
      date: string;
      category: string;
      description?: string;
      createdAt: string;
      confidence?: number;
    }

    const expenses: ExpenseData[] = expensesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        vendor: data.vendor,
        amount: data.amount,
        date: exportDate(data.date),
        category: data.category,
        description: data.description || "",
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        confidence: data.confidence,
      };
    });

    // Get all analytics for this user
    const analyticsSnapshot = await adminDb
      .collection("analytics")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .get();

    interface AnalyticsData {
      id: string;
      timestamp: string;
      requestType: string;
      success: boolean;
      duration: number;
      estimatedTokens: number;
      estimatedCost: number;
      hasImage: boolean;
      error?: string;
    }

    const analytics: AnalyticsData[] = analyticsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString(),
        requestType: data.requestType,
        success: data.success,
        duration: data.duration,
        estimatedTokens: data.estimatedTokens,
        estimatedCost: data.estimatedCost,
        hasImage: data.hasImage || false,
        error: data.error || undefined,
      };
    });

    // Calculate summary statistics
    const summary = {
      totalExpenses: expenses.length,
      totalAmount: expenses.reduce((sum, exp) => sum + exp.amount, 0),
      categories: Array.from(new Set(expenses.map(e => e.category))),
      totalApiRequests: analytics.length,
      successfulRequests: analytics.filter(a => a.success).length,
      totalTokens: analytics.reduce((sum, a) => sum + a.estimatedTokens, 0),
      totalCost: analytics.reduce((sum, a) => sum + a.estimatedCost, 0),
      averageDuration: analytics.length > 0 
        ? analytics.reduce((sum, a) => sum + a.duration, 0) / analytics.length 
        : 0,
    };

    // Create export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      userProfile,
      summary,
      expenses,
      analytics,
    };

    // Return as JSON
    return NextResponse.json({
      success: true,
      data: exportData,
    });

  } catch (error) {
    console.error("Error exporting user data:", error);
    return NextResponse.json(
      {
        error: "Failed to export user data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(
  getHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/admin/users/[userId]/export" },
);
