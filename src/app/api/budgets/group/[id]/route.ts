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
 * GET /api/budgets/group/[id]
 * Get a specific group budget
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    const doc = await adminDb.collection("budgets_group").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const budget = doc.data();

    // Verify user is a member of the group
    const memberDoc = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", budget?.groupId)
      .where("userId", "==", userId)
      .get();

    if (memberDoc.empty) {
      return NextResponse.json(
        { error: "User is not a member of this group" },
        { status: 403 }
      );
    }

    return NextResponse.json({ id: doc.id, ...budget }, { status: 200 });
  } catch (error) {
    console.error("Error fetching group budget:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budgets/group/[id]
 * Update a group budget (admin/owner only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { userId, monthlyLimit, settings } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Get existing budget
    const doc = await adminDb.collection("budgets_group").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const existingBudget = doc.data();

    // Check if user is admin/owner
    const isAdmin = await isGroupAdmin(existingBudget?.groupId, userId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only group admins/owners can update budgets" },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (monthlyLimit !== undefined) {
      if (monthlyLimit <= 0) {
        return NextResponse.json(
          { error: "Monthly limit must be greater than 0" },
          { status: 400 }
        );
      }
      updateData.monthlyLimit = monthlyLimit;
    }

    if (settings) {
      updateData.settings = {
        requireApprovalWhenOver: settings.requireApprovalWhenOver ?? existingBudget?.settings?.requireApprovalWhenOver ?? false,
        alertMembers: settings.alertMembers ?? existingBudget?.settings?.alertMembers ?? true,
        alertThreshold: settings.alertThreshold ?? existingBudget?.settings?.alertThreshold ?? 80,
      };
    }

    // Update budget
    await adminDb.collection("budgets_group").doc(id).update(updateData);

    // Fetch updated budget
    const updatedDoc = await adminDb.collection("budgets_group").doc(id).get();

    return NextResponse.json(
      { id: updatedDoc.id, ...updatedDoc.data() },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating group budget:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budgets/group/[id]
 * Delete a group budget (admin/owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Get existing budget
    const doc = await adminDb.collection("budgets_group").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const budget = doc.data();

    // Check if user is admin/owner
    const isAdmin = await isGroupAdmin(budget?.groupId, userId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only group admins/owners can delete budgets" },
        { status: 403 }
      );
    }

    // Delete budget
    await adminDb.collection("budgets_group").doc(id).delete();

    // Also delete associated cache if exists
    const cacheQuery = await adminDb
      .collection("budget_usage_cache")
      .where("groupId", "==", budget?.groupId)
      .where("category", "==", budget?.category)
      .where("period.month", "==", budget?.period?.month)
      .where("period.year", "==", budget?.period?.year)
      .get();

    const batch = adminDb.batch();
    cacheQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return NextResponse.json(
      { message: "Budget deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting group budget:", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}

