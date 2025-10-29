import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";

interface AnalyticsData {
  timestamp?: { toDate: () => Date };
  userId?: string;
  success?: boolean;
  estimatedTokens?: number;
  estimatedCost?: number;
  duration?: number;
  requestType?: string;
}

// GET - Get analytics data
export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startTimestamp = Timestamp.fromDate(startDate);

    // Get analytics data
    const analyticsRef = collection(db, "analytics");
    const analyticsQuery = query(
      analyticsRef,
      where("timestamp", ">=", startTimestamp)
    );
    const analyticsSnapshot = await getDocs(analyticsQuery);

    // Process analytics data
    const analytics = analyticsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Calculate aggregated stats
    const analyticsData = analytics as AnalyticsData[];
    const totalRequests = analyticsData.length;
    const successfulRequests = analyticsData.filter((a) => a.success).length;
    const failedRequests = totalRequests - successfulRequests;
    
    const totalTokens = analyticsData.reduce((sum: number, a) => 
      sum + (a.estimatedTokens || 0), 0
    );
    
    const totalCost = analyticsData.reduce((sum: number, a) => 
      sum + (a.estimatedCost || 0), 0
    );

    const avgDuration = totalRequests > 0
      ? analyticsData.reduce((sum: number, a) => sum + (a.duration || 0), 0) / totalRequests
      : 0;

    // Group by user
    const userStats = new Map<string, {
      userId: string;
      requests: number;
      tokens: number;
      cost: number;
      successful: number;
      successRate: number;
    }>();

    analyticsData.forEach((a) => {
      const userId = a.userId || "anonymous";
      const existing = userStats.get(userId) || {
        userId,
        requests: 0,
        tokens: 0,
        cost: 0,
        successful: 0,
      };

      const newSuccessful = existing.successful + (a.success ? 1 : 0);
      const newRequests = existing.requests + 1;
      
      userStats.set(userId, {
        userId,
        requests: newRequests,
        tokens: existing.tokens + (a.estimatedTokens || 0),
        cost: existing.cost + (a.estimatedCost || 0),
        successful: newSuccessful,
        successRate: (newSuccessful / newRequests) * 100,
      });
    });

    // Group by date for time series
    const dailyStats = new Map<string, {
      date: string;
      requests: number;
      tokens: number;
      cost: number;
    }>();

    analyticsData.forEach((a) => {
      const date = a.timestamp?.toDate ? a.timestamp.toDate().toISOString().split('T')[0] : 'unknown';
      const existing = dailyStats.get(date) || {
        date,
        requests: 0,
        tokens: 0,
        cost: 0,
      };

      dailyStats.set(date, {
        date,
        requests: existing.requests + 1,
        tokens: existing.tokens + (a.estimatedTokens || 0),
        cost: existing.cost + (a.estimatedCost || 0),
      });
    });

    // Group by request type
    const typeStats = new Map<string, number>();
    analyticsData.forEach((a) => {
      const type = a.requestType || "unknown";
      typeStats.set(type, (typeStats.get(type) || 0) + 1);
    });

    // Convert userStats to array for response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const userStatsArray = Array.from(userStats.values()).map(({ successful: _successful, ...rest}) => rest);

    return NextResponse.json({
      success: true,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      summary: {
        totalRequests,
        successfulRequests,
        failedRequests,
        successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
        totalTokens,
        totalCost: totalCost.toFixed(6),
        avgDuration: Math.round(avgDuration),
      },
      byUser: userStatsArray.sort((a, b) => b.requests - a.requests),
      byDate: Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date)),
      byType: Object.fromEntries(typeStats),
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

