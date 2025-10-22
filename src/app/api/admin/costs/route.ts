import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";

// Pricing constants (update these as needed)
const PRICING = {
  gemini: {
    flash: {
      name: "Gemini 2.0 Flash",
      inputPer1M: 0.075,      // $0.075 per 1M input tokens
      outputPer1M: 0.30,      // $0.30 per 1M output tokens
      estimatedOutputTokens: 200, // Average output tokens per request
    },
    pro: {
      name: "Gemini 2.0 Pro",
      inputPer1M: 1.25,       // $1.25 per 1M input tokens
      outputPer1M: 5.00,      // $5.00 per 1M output tokens
      estimatedOutputTokens: 200,
    }
  },
  firestore: {
    reads: 0.06 / 100000,     // $0.06 per 100K reads
    writes: 0.18 / 100000,    // $0.18 per 100K writes
    deletes: 0.02 / 100000,   // $0.02 per 100K deletes
    storage: 0.18 / 1024,     // $0.18 per GB/month
  },
  vercel: {
    // Note: Vercel costs vary by plan, these are approximations
    functionInvocations: 0.60 / 1000000, // $0.60 per 1M invocations (Pro plan)
    bandwidth: 0.15,          // $0.15 per GB (Pro plan)
    edgeFunctions: 0.65 / 1000000, // $0.65 per 1M requests
  }
};

interface CostBreakdown {
  ai: {
    totalRequests: number;
    totalTokens: number;
    estimatedCost: number;
    model: string;
    successRate: number;
  };
  firestore: {
    estimatedReads: number;
    estimatedWrites: number;
    estimatedDeletes: number;
    estimatedCost: number;
    collections: {
      expenses: number;
      analytics: number;
    };
  };
  vercel: {
    estimatedInvocations: number;
    estimatedCost: number;
    note: string;
  };
  total: {
    estimatedMonthlyCost: number;
    dailyAverage: number;
    projectedMonthlyCost: number;
  };
}

// GET - Get comprehensive cost breakdown
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
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam) : 30;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get AI analytics data
    const analyticsRef = collection(db, "analytics");
    const analyticsQuery = query(
      analyticsRef,
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate))
    );
    const analyticsSnapshot = await getDocs(analyticsQuery);

    // Calculate AI costs
    let totalAIRequests = 0;
    let successfulRequests = 0;
    let totalTokens = 0;
    let totalAICost = 0;

    analyticsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      totalAIRequests++;
      if (data.success) successfulRequests++;
      totalTokens += data.estimatedTokens || 0;
      totalAICost += data.estimatedCost || 0;
    });

    // Estimate Firestore operations
    // For a more accurate count, you'd need to track these explicitly
    // These are estimates based on typical app usage patterns
    const expensesRef = collection(db, "expenses");
    const expensesSnapshot = await getDocs(expensesRef);
    const totalExpenses = expensesSnapshot.size;

    const analyticsCount = analyticsSnapshot.size;

    // Estimate Firestore costs (rough approximation)
    // Reads: Every expense list view, dashboard load, admin queries
    // Writes: Every expense creation, analytics logging
    // Deletes: Expense deletions
    const estimatedReads = totalExpenses * 5 + analyticsCount * 2; // Multiply by avg reads per doc
    const estimatedWrites = totalExpenses + analyticsCount;
    const estimatedDeletes = 0; // Track separately if needed

    const firestoreCost = 
      (estimatedReads * PRICING.firestore.reads) +
      (estimatedWrites * PRICING.firestore.writes) +
      (estimatedDeletes * PRICING.firestore.deletes);

    // Estimate Vercel costs
    // This is approximate - for real data, integrate with Vercel API
    const estimatedFunctionInvocations = totalAIRequests * 3; // Multiple functions per AI request
    const vercelCost = estimatedFunctionInvocations * PRICING.vercel.functionInvocations;

    // Calculate totals
    const totalCost = totalAICost + firestoreCost + vercelCost;
    const dailyAverage = totalCost / days;
    const projectedMonthlyCost = dailyAverage * 30;

    // Get daily breakdown for chart
    const dailyBreakdown: Array<{
      date: string;
      aiCost: number;
      firestoreCost: number;
      vercelCost: number;
      total: number;
    }> = [];

    // Group analytics by day
    const dailyMap = new Map<string, { requests: number; tokens: number; cost: number }>();
    
    analyticsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const date = data.timestamp?.toDate().toISOString().split("T")[0] || "";
      
      const existing = dailyMap.get(date) || { requests: 0, tokens: 0, cost: 0 };
      dailyMap.set(date, {
        requests: existing.requests + 1,
        tokens: existing.tokens + (data.estimatedTokens || 0),
        cost: existing.cost + (data.estimatedCost || 0),
      });
    });

    // Fill in all days
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      
      const dayData = dailyMap.get(dateStr) || { requests: 0, tokens: 0, cost: 0 };
      const dayFirestoreCost = (dayData.requests * 10 * PRICING.firestore.reads) + 
                               (dayData.requests * PRICING.firestore.writes);
      const dayVercelCost = dayData.requests * 3 * PRICING.vercel.functionInvocations;
      
      dailyBreakdown.push({
        date: dateStr,
        aiCost: dayData.cost,
        firestoreCost: dayFirestoreCost,
        vercelCost: dayVercelCost,
        total: dayData.cost + dayFirestoreCost + dayVercelCost,
      });
    }

    // Get top cost-generating users
    const userCosts = new Map<string, { requests: number; cost: number; tokens: number }>();
    
    analyticsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.userId || "anonymous";
      
      const existing = userCosts.get(userId) || { requests: 0, cost: 0, tokens: 0 };
      userCosts.set(userId, {
        requests: existing.requests + 1,
        cost: existing.cost + (data.estimatedCost || 0),
        tokens: existing.tokens + (data.estimatedTokens || 0),
      });
    });

    const topUsers = Array.from(userCosts.entries())
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const costBreakdown: CostBreakdown = {
      ai: {
        totalRequests: totalAIRequests,
        totalTokens,
        estimatedCost: totalAICost,
        model: PRICING.gemini.flash.name,
        successRate: totalAIRequests > 0 ? (successfulRequests / totalAIRequests) * 100 : 0,
      },
      firestore: {
        estimatedReads,
        estimatedWrites,
        estimatedDeletes,
        estimatedCost: firestoreCost,
        collections: {
          expenses: totalExpenses,
          analytics: analyticsCount,
        },
      },
      vercel: {
        estimatedInvocations: estimatedFunctionInvocations,
        estimatedCost: vercelCost,
        note: "Estimates based on function invocations. For accurate data, integrate Vercel API.",
      },
      total: {
        estimatedMonthlyCost: projectedMonthlyCost,
        dailyAverage,
        projectedMonthlyCost,
      },
    };

    return NextResponse.json({
      success: true,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      costs: costBreakdown,
      dailyBreakdown,
      topUsers,
      pricing: PRICING,
    });

  } catch (error) {
    console.error("Error fetching cost data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch cost data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

