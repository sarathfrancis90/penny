import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";

// GET - List all users with their expense counts
export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get search params
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const maxResults = limitParam ? parseInt(limitParam) : 100;

    // Get all expenses to aggregate user data
    const expensesRef = collection(db, "expenses");
    const expensesSnapshot = await getDocs(expensesRef);

    // Aggregate user data
    const userMap = new Map<string, {
      userId: string;
      email?: string;
      expenseCount: number;
      totalAmount: number;
      lastActivity?: Date;
      firstActivity?: Date;
    }>();

    expensesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.userId;

      if (!userId) return;

      const existing = userMap.get(userId) || {
        userId,
        expenseCount: 0,
        totalAmount: 0,
        lastActivity: undefined,
        firstActivity: undefined,
      };

      const expenseDate = data.createdAt?.toDate() || new Date();

      userMap.set(userId, {
        userId,
        expenseCount: existing.expenseCount + 1,
        totalAmount: existing.totalAmount + (data.amount || 0),
        lastActivity: !existing.lastActivity || expenseDate > existing.lastActivity
          ? expenseDate
          : existing.lastActivity,
        firstActivity: !existing.firstActivity || expenseDate < existing.firstActivity
          ? expenseDate
          : existing.firstActivity,
      });
    });

    // Convert to array and sort by expense count
    const users = Array.from(userMap.values())
      .sort((a, b) => b.expenseCount - a.expenseCount)
      .slice(0, maxResults);

    return NextResponse.json({
      success: true,
      users,
      totalUsers: userMap.size,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

