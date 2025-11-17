import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/budgets/personal/[id]
 * Get a specific personal budget
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

    const doc = await adminDb.collection("budgets_personal").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const budget = doc.data();

    // Verify ownership
    if (budget?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ id: doc.id, ...budget }, { status: 200 });
  } catch (error) {
    console.error("Error fetching personal budget:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budgets/personal/[id]
 * Update a personal budget
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
    const doc = await adminDb.collection("budgets_personal").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const existingBudget = doc.data();

    // Verify ownership
    if (existingBudget?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
        rollover: settings.rollover ?? existingBudget?.settings?.rollover ?? false,
        alertThreshold: settings.alertThreshold ?? existingBudget?.settings?.alertThreshold ?? 80,
        notificationsEnabled: settings.notificationsEnabled ?? existingBudget?.settings?.notificationsEnabled ?? true,
      };
    }

    // Update budget
    await adminDb.collection("budgets_personal").doc(id).update(updateData);

    // Fetch updated budget
    const updatedDoc = await adminDb.collection("budgets_personal").doc(id).get();

    return NextResponse.json(
      { id: updatedDoc.id, ...updatedDoc.data() },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating personal budget:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budgets/personal/[id]
 * Delete a personal budget
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
    const doc = await adminDb.collection("budgets_personal").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const budget = doc.data();

    // Verify ownership
    if (budget?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete budget
    await adminDb.collection("budgets_personal").doc(id).delete();

    // Also delete associated cache if exists
    const cacheQuery = await adminDb
      .collection("budget_usage_cache")
      .where("userId", "==", userId)
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
    console.error("Error deleting personal budget:", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}

