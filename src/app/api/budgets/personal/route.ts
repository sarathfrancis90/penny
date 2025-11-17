import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/budgets/personal
 * List all personal budgets for the authenticated user
 * Query params: category (optional), month (optional), year (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const category = searchParams.get("category");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Build query
    let query = adminDb
      .collection("budgets_personal")
      .where("userId", "==", userId);

    if (category) {
      query = query.where("category", "==", category);
    }

    if (month && year) {
      query = query
        .where("period.month", "==", parseInt(month))
        .where("period.year", "==", parseInt(year));
    }

    const snapshot = await query.get();
    const budgets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ budgets }, { status: 200 });
  } catch (error) {
    console.error("Error fetching personal budgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budgets/personal
 * Create a new personal budget
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, category, monthlyLimit, period, settings } = body;

    // Validation
    if (!userId || !category || !monthlyLimit || !period) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (monthlyLimit <= 0) {
      return NextResponse.json(
        { error: "Monthly limit must be greater than 0" },
        { status: 400 }
      );
    }

    if (
      !period.month ||
      !period.year ||
      period.month < 1 ||
      period.month > 12 ||
      period.year < 2020
    ) {
      return NextResponse.json(
        { error: "Invalid period" },
        { status: 400 }
      );
    }

    // Check for duplicate budget (same user, category, and period)
    const existingBudget = await adminDb
      .collection("budgets_personal")
      .where("userId", "==", userId)
      .where("category", "==", category)
      .where("period.month", "==", period.month)
      .where("period.year", "==", period.year)
      .get();

    if (!existingBudget.empty) {
      return NextResponse.json(
        { error: "Budget already exists for this category and period" },
        { status: 409 }
      );
    }

    // Create budget
    const budgetData = {
      userId,
      category,
      monthlyLimit,
      period,
      settings: {
        rollover: settings?.rollover || false,
        alertThreshold: settings?.alertThreshold || 80,
        notificationsEnabled: settings?.notificationsEnabled || true,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection("budgets_personal").add(budgetData);

    return NextResponse.json(
      { id: docRef.id, ...budgetData },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating personal budget:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 }
    );
  }
}

