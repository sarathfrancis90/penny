import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

interface UpdateExpenseRequest {
  vendor?: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string;
}

// DELETE - Delete an expense
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Expense ID is required" },
        { status: 400 }
      );
    }

    // Delete the expense document using Admin SDK (bypasses security rules)
    await adminDb.collection("expenses").doc(id).delete();

    return NextResponse.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting expense:", error);

    if (error instanceof Error) {
      if (error.message.includes("permission-denied")) {
        return NextResponse.json(
          {
            error: "Permission denied",
            details: "You don't have permission to delete this expense",
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to delete expense",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PUT/PATCH - Update an expense
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateExpenseRequest = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Expense ID is required" },
        { status: 400 }
      );
    }

    // Build update data object
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (body.vendor !== undefined) updateData.vendor = body.vendor;
    if (body.amount !== undefined) {
      // Validate amount
      if (typeof body.amount !== "number" || body.amount <= 0) {
        return NextResponse.json(
          { error: "Invalid amount. Must be a positive number" },
          { status: 400 }
        );
      }
      updateData.amount = body.amount;
    }
    if (body.category !== undefined) updateData.category = body.category;
    if (body.description !== undefined) updateData.description = body.description;
    
    if (body.date !== undefined) {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(body.date)) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD" },
          { status: 400 }
        );
      }
      // Parse date in local timezone
      const [year, month, day] = body.date.split("-").map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone issues
      updateData.date = Timestamp.fromDate(localDate);
    }

    // Update the expense document using Admin SDK (bypasses security rules)
    await adminDb.collection("expenses").doc(id).update(updateData);

    return NextResponse.json({
      success: true,
      message: "Expense updated successfully",
    });
  } catch (error) {
    console.error("Error updating expense:", error);

    if (error instanceof Error) {
      if (error.message.includes("permission-denied")) {
        return NextResponse.json(
          {
            error: "Permission denied",
            details: "You don't have permission to update this expense",
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to update expense",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PATCH - Same as PUT for this use case
export const PATCH = PUT;

