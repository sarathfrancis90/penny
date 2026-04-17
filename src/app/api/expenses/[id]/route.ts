import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { deleteReceipt } from "@/lib/storageService";
import { PushService } from "@/lib/services/pushService";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";
import { withObservability } from "@/lib/observability/withObservability";

/**
 * Notify group members about an expense change (update or delete).
 */
async function notifyGroupMembers(
  groupId: string,
  actorUserId: string,
  type: "group_expense_updated" | "group_expense_deleted",
  title: string,
  body: string,
  expenseId: string,
  metadata?: Record<string, unknown>
) {
  try {
    const now = Timestamp.now();

    // Get actor info
    const userDoc = await adminDb.collection("users").doc(actorUserId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const actorName = userData?.displayName || userData?.email || "Someone";

    // Get group info
    const groupDoc = await adminDb.collection("groups").doc(groupId).get();
    const groupName = groupDoc.exists ? groupDoc.data()?.name : "Unknown Group";
    const groupIcon = groupDoc.exists ? groupDoc.data()?.icon : "👥";

    // Get all active members except actor
    const membersSnapshot = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", groupId)
      .where("status", "==", "active")
      .get();

    const promises = membersSnapshot.docs
      .filter((doc) => doc.data().userId !== actorUserId)
      .map((memberDoc) =>
        adminDb.collection("notifications").add({
          userId: memberDoc.data().userId,
          type,
          title,
          body: body.replace("{actor}", actorName),
          icon: type === "group_expense_deleted" ? "🗑️" : "✏️",
          priority: "medium",
          category: "group",
          read: false,
          delivered: false,
          isGrouped: false,
          actionUrl: `/groups/${groupId}`,
          relatedId: expenseId,
          relatedType: "expense",
          groupId,
          actorId: actorUserId,
          actorName,
          metadata: { groupName, groupIcon, ...metadata },
          createdAt: now,
        })
      );

    await Promise.all(promises);
    console.log(`[Notifications] Created ${promises.length} ${type} notifications for group ${groupId}`);

    // Send push notifications
    const pushRecipients = membersSnapshot.docs
      .filter((doc) => doc.data().userId !== actorUserId)
      .map((doc) => doc.data().userId);

    PushService.sendToUsers(pushRecipients, {
      title,
      body: body.replace("{actor}", actorName),
      actionUrl: `/groups/${groupId}`,
      icon: type === "group_expense_deleted" ? "🗑️" : "✏️",
      priority: "medium",
    });
  } catch (err) {
    console.error("[Notifications] Error creating group notifications:", err);
  }
}

interface UpdateExpenseRequest {
  vendor?: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string;
}

// DELETE - Delete an expense
async function deleteHandler(
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

    // Get the expense document first to check for receipt
    const expenseDoc = await adminDb.collection("expenses").doc(id).get();
    const expenseData = expenseDoc.data();

    // Delete the receipt image if it exists
    if (expenseData?.receiptPath) {
      try {
        await deleteReceipt(expenseData.receiptPath);
        console.log("Receipt deleted:", expenseData.receiptPath);
      } catch (receiptError) {
        console.error("Failed to delete receipt:", receiptError);
        // Continue with expense deletion even if receipt deletion fails
      }
    }

    // Notify group members if this is a group expense
    if (expenseData?.groupId && expenseData?.expenseType === "group") {
      const tokenUserId = await getAuthenticatedUserId(request);
      const userId = tokenUserId || expenseData.userId;
      await notifyGroupMembers(
        expenseData.groupId,
        userId,
        "group_expense_deleted",
        "Expense deleted",
        `{actor} deleted $${expenseData.amount?.toFixed(2)} at ${expenseData.vendor}`,
        id,
        { vendor: expenseData.vendor, amount: expenseData.amount, category: expenseData.category }
      );

      // Update group stats
      const groupRef = adminDb.collection("groups").doc(expenseData.groupId);
      const groupDoc = await groupRef.get();
      if (groupDoc.exists) {
        const stats = groupDoc.data()?.stats || {};
        await groupRef.update({
          "stats.expenseCount": Math.max((stats.expenseCount || 1) - 1, 0),
          "stats.totalAmount": Math.max((stats.totalAmount || 0) - (expenseData.amount || 0), 0),
          "stats.lastActivityAt": Timestamp.now(),
        });
      }
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
async function putHandler(
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

    // Notify group members if this is a group expense
    const expenseDoc = await adminDb.collection("expenses").doc(id).get();
    const expenseData = expenseDoc.data();
    if (expenseData?.groupId && expenseData?.expenseType === "group") {
      const tokenUserId = await getAuthenticatedUserId(request);
      const userId = tokenUserId || expenseData.userId;

      const changes = Object.keys(body).filter(k => body[k as keyof UpdateExpenseRequest] !== undefined);
      const changeDesc = changes.join(", ");

      await notifyGroupMembers(
        expenseData.groupId,
        userId,
        "group_expense_updated",
        "Expense updated",
        `{actor} updated ${expenseData.vendor} (${changeDesc})`,
        id,
        { vendor: expenseData.vendor, amount: expenseData.amount, changes }
      );
    }

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
export const DELETE = withObservability(
  deleteHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/expenses/[id]" },
);
export const PUT = withObservability(
  putHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/expenses/[id]" },
);
export const PATCH = withObservability(
  putHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/expenses/[id]" },
);

