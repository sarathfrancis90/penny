import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp, orderBy, limit as firestoreLimit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";
import { getAuth } from "firebase-admin/auth";

interface SystemStats {
  database: {
    collections: {
      expenses: {
        count: number;
        estimatedSize: string;
      };
      analytics: {
        count: number;
        estimatedSize: string;
      };
    };
    totalDocuments: number;
    estimatedTotalSize: string;
  };
  users: {
    total: number;
    active24h: number;
    active7d: number;
    active30d: number;
    newLast7d: number;
    newLast30d: number;
    withExpenses: number;
    withoutExpenses: number;
  };
  performance: {
    avgResponseTime: number;
    errorRate: number;
    successRate: number;
    totalRequests: number;
  };
  activity: {
    expensesLast24h: number;
    expensesLast7d: number;
    expensesLast30d: number;
    apiCallsLast24h: number;
    apiCallsLast7d: number;
    apiCallsLast30d: number;
  };
}

// Helper to estimate document size (rough approximation)
function estimateCollectionSize(docCount: number, avgDocSizeKB: number): string {
  const sizeKB = docCount * avgDocSizeKB;
  if (sizeKB < 1024) return `${sizeKB.toFixed(2)} KB`;
  const sizeMB = sizeKB / 1024;
  if (sizeMB < 1024) return `${sizeMB.toFixed(2)} MB`;
  const sizeGB = sizeMB / 1024;
  return `${sizeGB.toFixed(2)} GB`;
}

// GET - Get comprehensive system statistics
export async function GET() {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Calculate time periods
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get expenses data
    const expensesRef = collection(db, "expenses");
    const allExpenses = await getDocs(expensesRef);
    const expenseCount = allExpenses.size;

    // Count expenses by time period
    const expenses24h = await getDocs(
      query(expensesRef, where("createdAt", ">=", Timestamp.fromDate(last24h)))
    );
    const expenses7d = await getDocs(
      query(expensesRef, where("createdAt", ">=", Timestamp.fromDate(last7d)))
    );
    const expenses30d = await getDocs(
      query(expensesRef, where("createdAt", ">=", Timestamp.fromDate(last30d)))
    );

    // Get analytics data
    const analyticsRef = collection(db, "analytics");
    const allAnalytics = await getDocs(analyticsRef);
    const analyticsCount = allAnalytics.size;

    // Count API calls by time period
    const analytics24h = await getDocs(
      query(analyticsRef, where("timestamp", ">=", Timestamp.fromDate(last24h)))
    );
    const analytics7d = await getDocs(
      query(analyticsRef, where("timestamp", ">=", Timestamp.fromDate(last7d)))
    );
    const analytics30d = await getDocs(
      query(analyticsRef, where("timestamp", ">=", Timestamp.fromDate(last30d)))
    );

    // Calculate performance metrics from recent analytics
    let totalDuration = 0;
    let successCount = 0;
    let errorCount = 0;

    analytics30d.docs.forEach((doc) => {
      const data = doc.data();
      totalDuration += data.duration || 0;
      if (data.success) successCount++;
      else errorCount++;
    });

    const totalRequests = analytics30d.size;
    const avgResponseTime = totalRequests > 0 ? totalDuration / totalRequests : 0;
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    // Get user statistics
    let totalUsers = 0;
    let active24hUsers = 0;
    let active7dUsers = 0;
    let active30dUsers = 0;
    let newUsers7d = 0;
    let newUsers30d = 0;

    try {
      const auth = getAuth();
      const listUsersResult = await auth.listUsers(1000);
      totalUsers = listUsersResult.users.length;

      listUsersResult.users.forEach((user) => {
        const createdAt = new Date(user.metadata.creationTime);
        const lastSignIn = user.metadata.lastSignInTime 
          ? new Date(user.metadata.lastSignInTime) 
          : null;

        // Count new users
        if (createdAt >= last7d) newUsers7d++;
        if (createdAt >= last30d) newUsers30d++;

        // Count active users (by last sign-in)
        if (lastSignIn) {
          if (lastSignIn >= last24h) active24hUsers++;
          if (lastSignIn >= last7d) active7dUsers++;
          if (lastSignIn >= last30d) active30dUsers++;
        }
      });
    } catch (error) {
      console.warn("Could not fetch user statistics:", error);
    }

    // Count users with/without expenses
    const usersWithExpenses = new Set(
      allExpenses.docs.map(doc => doc.data().userId)
    ).size;
    const usersWithoutExpenses = totalUsers - usersWithExpenses;

    // Estimate storage sizes (rough approximations)
    // Average expense document: ~500 bytes
    // Average analytics document: ~300 bytes
    const expenseSize = estimateCollectionSize(expenseCount, 0.5);
    const analyticsSize = estimateCollectionSize(analyticsCount, 0.3);
    const totalDocs = expenseCount + analyticsCount;
    const totalSize = estimateCollectionSize(totalDocs, 0.4);

    const systemStats: SystemStats = {
      database: {
        collections: {
          expenses: {
            count: expenseCount,
            estimatedSize: expenseSize,
          },
          analytics: {
            count: analyticsCount,
            estimatedSize: analyticsSize,
          },
        },
        totalDocuments: totalDocs,
        estimatedTotalSize: totalSize,
      },
      users: {
        total: totalUsers,
        active24h: active24hUsers,
        active7d: active7dUsers,
        active30d: active30dUsers,
        newLast7d: newUsers7d,
        newLast30d: newUsers30d,
        withExpenses: usersWithExpenses,
        withoutExpenses: usersWithoutExpenses,
      },
      performance: {
        avgResponseTime: Math.round(avgResponseTime),
        errorRate: parseFloat(errorRate.toFixed(2)),
        successRate: parseFloat(successRate.toFixed(2)),
        totalRequests,
      },
      activity: {
        expensesLast24h: expenses24h.size,
        expensesLast7d: expenses7d.size,
        expensesLast30d: expenses30d.size,
        apiCallsLast24h: analytics24h.size,
        apiCallsLast7d: analytics7d.size,
        apiCallsLast30d: analytics30d.size,
      },
    };

    // Get recent activity (last 10 expenses and API calls)
    const recentExpenses = await getDocs(
      query(expensesRef, orderBy("createdAt", "desc"), firestoreLimit(10))
    );

    const recentApiCalls = await getDocs(
      query(analyticsRef, orderBy("timestamp", "desc"), firestoreLimit(10))
    );

    return NextResponse.json({
      success: true,
      stats: systemStats,
      recentActivity: {
        expenses: recentExpenses.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate().toISOString(),
        })),
        apiCalls: recentApiCalls.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate().toISOString(),
        })),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Error fetching system stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch system stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

