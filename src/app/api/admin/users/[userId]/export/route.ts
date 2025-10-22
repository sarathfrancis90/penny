import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";
import { getAuth } from "firebase-admin/auth";

// GET - Export all data for a specific user
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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
      const auth = getAuth();
      const userRecord = await auth.getUser(userId);
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
    const expensesRef = collection(db, "expenses");
    const expensesQuery = query(
      expensesRef,
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const expensesSnapshot = await getDocs(expensesQuery);
    
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
        date: data.date,
        category: data.category,
        description: data.description || "",
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        confidence: data.confidence,
      };
    });

    // Get all analytics for this user
    const analyticsRef = collection(db, "analytics");
    const analyticsQuery = query(
      analyticsRef,
      where("userId", "==", userId),
      orderBy("timestamp", "desc")
    );
    const analyticsSnapshot = await getDocs(analyticsQuery);

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

