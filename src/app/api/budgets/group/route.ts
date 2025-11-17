import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Helper function to check if user is admin/owner of a group
 */
async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  const memberDoc = await adminDb
    .collection("groupMembers")
    .where("groupId", "==", groupId)
    .where("userId", "==", userId)
    .get();

  if (memberDoc.empty) {
    return false;
  }

  const member = memberDoc.docs[0].data();
  return member.role === "owner" || member.role === "admin";
}

/**
 * GET /api/budgets/group
 * List group budgets (filtered by groupId)
 * Query params: groupId (required), category (optional), month (optional), year (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const groupId = searchParams.get("groupId");
    const category = searchParams.get("category");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    if (!groupId) {
      return NextResponse.json(
        { error: "Group ID is required" },
        { status: 400 }
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

    // Build query
    let query = adminDb
      .collection("budgets_group")
      .where("groupId", "==", groupId);

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
    console.error("Error fetching group budgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budgets/group
 * Create a new group budget (admin/owner only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, groupId, category, monthlyLimit, period, settings } = body;

    // Validation
    if (!userId || !groupId || !category || !monthlyLimit || !period) {
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

    // Check if user is admin/owner
    const isAdmin = await isGroupAdmin(groupId, userId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only group admins/owners can create budgets" },
        { status: 403 }
      );
    }

    // Get user's role
    const memberDoc = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", groupId)
      .where("userId", "==", userId)
      .get();

    const userRole = memberDoc.docs[0].data().role;

    // Check for duplicate budget
    const existingBudget = await adminDb
      .collection("budgets_group")
      .where("groupId", "==", groupId)
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
      groupId,
      category,
      monthlyLimit,
      period,
      setBy: userId,
      setByRole: userRole,
      settings: {
        requireApprovalWhenOver: settings?.requireApprovalWhenOver || false,
        alertMembers: settings?.alertMembers || true,
        alertThreshold: settings?.alertThreshold || 80,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection("budgets_group").add(budgetData);

    return NextResponse.json(
      { id: docRef.id, ...budgetData },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating group budget:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 }
    );
  }
}

