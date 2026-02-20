import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { BudgetNotificationService } from "@/lib/services/budgetNotificationService";

interface CreateExpenseRequest {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  userId: string;
  receiptUrl?: string;
  receiptPath?: string;
  groupId?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: CreateExpenseRequest = await request.json();
    const { vendor, amount, date, category, description, userId, receiptUrl, receiptPath, groupId } =
      body;

    // Validate required fields
    if (!vendor || !amount || !date || !category || !userId) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "vendor, amount, date, category, and userId are required",
        },
        { status: 400 }
      );
    }

    // Validate amount is a positive number
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount. Must be a positive number" },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Convert date string to Timestamp
    // Parse date components to avoid UTC midnight timezone shift
    const [year, month, day] = date.split("-").map(Number);
    const expenseDate = Timestamp.fromDate(new Date(year, month - 1, day, 12, 0, 0));
    const now = Timestamp.now();

    // Determine expense type
    const expenseType = groupId ? "group" : "personal";

    // Create expense document
    const expenseData = {
      vendor,
      amount,
      category,
      date: expenseDate,
      description: description || "",
      userId,
      receiptUrl: receiptUrl || null,
      receiptPath: receiptPath || null,
      groupId: groupId || null,
      expenseType,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      // Add audit trail
      history: [
        {
          action: "created",
          by: userId,
          at: now,
        },
      ],
    };

    // Save to Firestore using Admin SDK (bypasses security rules)
    const docRef = await adminDb.collection("expenses").add(expenseData);

    // Update group stats if this is a group expense
    if (groupId) {
      const groupRef = adminDb.collection("groups").doc(groupId);
      const groupDoc = await groupRef.get();
      
      if (groupDoc.exists) {
        const currentExpenseCount = groupDoc.data()?.stats?.expenseCount || 0;
        const currentTotalAmount = groupDoc.data()?.stats?.totalAmount || 0;

        await groupRef.update({
          "stats.expenseCount": currentExpenseCount + 1,
          "stats.totalAmount": currentTotalAmount + amount,
          "stats.lastActivityAt": now,
          updatedAt: now,
        });

        // Log activity
        await adminDb.collection("groupActivities").add({
          groupId,
          userId,
          userName: "Member", // TODO: Get from user profile
          action: "expense_added",
          details: `Added expense: $${amount.toFixed(2)} at ${vendor}`,
          metadata: { expenseId: docRef.id, vendor, amount, category },
          createdAt: now,
        });

        // Create notifications for other group members
        try {
          const groupData = groupDoc.data();
          const groupName = groupData?.name || 'Unknown Group';
          const groupIcon = groupData?.icon || '👥';

          // Get user info
          const userDoc = await adminDb.collection("users").doc(userId).get();
          const userData = userDoc.exists ? userDoc.data() : null;
          const actorName = userData?.displayName || userData?.email || 'Someone';
          const actorAvatar = userData?.photoURL;

          // Get all group members except the current user
          const membersSnapshot = await adminDb
            .collection("groupMembers")
            .where("groupId", "==", groupId)
            .where("status", "==", "active")
            .get();

          const notificationPromises = membersSnapshot.docs
            .filter(doc => doc.data().userId !== userId) // Exclude the user who added the expense
            .map(async (memberDoc) => {
              const memberId = memberDoc.data().userId;

              // Create notification
              return adminDb.collection("notifications").add({
                userId: memberId,
                type: "group_expense_added",
                title: "New expense added",
                body: `${actorName} added $${amount.toFixed(2)} at ${vendor}`,
                icon: "💰",
                priority: "medium",
                category: "group",
                read: false,
                delivered: false,
                isGrouped: false,
                actionUrl: `/groups/${groupId}`,
                relatedId: docRef.id,
                relatedType: "expense",
                groupId: groupId,
                actorId: userId,
                actorName: actorName,
                actorAvatar: actorAvatar,
                metadata: {
                  groupName: groupName,
                  groupIcon: groupIcon,
                  vendor: vendor,
                  amount: amount,
                  category: category,
                },
                createdAt: now,
              });
            });

          await Promise.all(notificationPromises);
          console.log(`[Notifications] Created ${notificationPromises.length} expense notifications for group ${groupId}`);
        } catch (notifError) {
          // Don't fail the expense creation if notifications fail
          console.error("[Notifications] Error creating expense notifications:", notifError);
        }
      }
    }

    // Check budget impact and trigger budget notifications
    try {
      console.log(`[Budget] Checking budget impact for expense ${docRef.id}`);
      const expenseMonth = expenseDate.toDate().getMonth() + 1;
      const expenseYear = expenseDate.toDate().getFullYear();

      if (groupId) {
        // Check group budget
        console.log(`[Budget] Checking group budget for ${groupId}, category: ${category}`);
        const groupBudgetSnapshot = await adminDb
          .collection("budgets_group")
          .where("groupId", "==", groupId)
          .where("category", "==", category)
          .where("period.month", "==", expenseMonth)
          .where("period.year", "==", expenseYear)
          .get();

        if (!groupBudgetSnapshot.empty) {
          const budgetDoc = groupBudgetSnapshot.docs[0];
          const budget = budgetDoc.data();
          const budgetLimit = budget.limit || 0;

          // Calculate total spent in this category for this group
          const startDate = new Date(expenseYear, expenseMonth - 1, 1);
          const endDate = new Date(expenseYear, expenseMonth, 0, 23, 59, 59, 999);

          const expensesSnapshot = await adminDb
            .collection("expenses")
            .where("groupId", "==", groupId)
            .where("category", "==", category)
            .where("date", ">=", Timestamp.fromDate(startDate))
            .where("date", "<=", Timestamp.fromDate(endDate))
            .get();

          const totalSpent = expensesSnapshot.docs.reduce(
            (sum, doc) => sum + (doc.data().amount || 0),
            0
          );

          // Get all group members for notifications
          const membersSnapshot = await adminDb
            .collection("groupMembers")
            .where("groupId", "==", groupId)
            .where("status", "==", "active")
            .get();

          const memberIds = membersSnapshot.docs.map(doc => doc.data().userId);
          const groupDoc = await adminDb.collection("groups").doc(groupId).get();
          const groupName = groupDoc.exists ? groupDoc.data()?.name : 'Unknown Group';

          console.log(`[Budget] Group budget check: ${totalSpent}/${budgetLimit} (${Math.round((totalSpent / budgetLimit) * 100)}%)`);

          // Trigger budget notifications
          await BudgetNotificationService.checkAndNotify({
            budgetId: budgetDoc.id,
            userId: userId, // Will send to all members
            category,
            totalSpent,
            budgetLimit,
            period: { month: expenseMonth, year: expenseYear },
            isGroupBudget: true,
            groupId,
            groupName,
            groupMembers: memberIds,
          });
        } else {
          console.log(`[Budget] No group budget found for ${groupId}, category: ${category}`);
        }
      } else {
        // Check personal budget
        console.log(`[Budget] Checking personal budget for ${userId}, category: ${category}`);
        const personalBudgetSnapshot = await adminDb
          .collection("budgets_personal")
          .where("userId", "==", userId)
          .where("category", "==", category)
          .where("period.month", "==", expenseMonth)
          .where("period.year", "==", expenseYear)
          .get();

        if (!personalBudgetSnapshot.empty) {
          const budgetDoc = personalBudgetSnapshot.docs[0];
          const budget = budgetDoc.data();
          const budgetLimit = budget.limit || 0;

          // Calculate total spent in this category for this user (personal only)
          const startDate = new Date(expenseYear, expenseMonth - 1, 1);
          const endDate = new Date(expenseYear, expenseMonth, 0, 23, 59, 59, 999);

          const expensesSnapshot = await adminDb
            .collection("expenses")
            .where("userId", "==", userId)
            .where("category", "==", category)
            .where("date", ">=", Timestamp.fromDate(startDate))
            .where("date", "<=", Timestamp.fromDate(endDate))
            .get();

          // Filter to only personal expenses (no groupId)
          const totalSpent = expensesSnapshot.docs
            .filter(doc => !doc.data().groupId)
            .reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

          console.log(`[Budget] Personal budget check: ${totalSpent}/${budgetLimit} (${Math.round((totalSpent / budgetLimit) * 100)}%)`);

          // Trigger budget notifications
          await BudgetNotificationService.checkAndNotify({
            budgetId: budgetDoc.id,
            userId,
            category,
            totalSpent,
            budgetLimit,
            period: { month: expenseMonth, year: expenseYear },
            isGroupBudget: false,
          });
        } else {
          console.log(`[Budget] No personal budget found for ${userId}, category: ${category}`);
        }
      }
    } catch (budgetError) {
      // Don't fail the expense creation if budget notifications fail
      console.error("[Budget] Error checking budget:", budgetError);
    }

    // Return success with the document ID
    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: "Expense saved successfully",
    });
  } catch (error) {
    console.error("Error saving expense:", error);

    // Check for Firebase-specific errors
    if (error instanceof Error) {
      if (error.message.includes("permission-denied")) {
        return NextResponse.json(
          {
            error: "Permission denied",
            details: "You don't have permission to save expenses",
          },
          { status: 403 }
        );
      }

      if (error.message.includes("not-found")) {
        return NextResponse.json(
          {
            error: "Database not found",
            details: "Firestore database is not properly configured",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to save expense",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve expenses (for future use)
export async function GET(request: NextRequest) {
  try {
    // Extract userId from query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId query parameter is required" },
        { status: 400 }
      );
    }

    // TODO: Implement expense retrieval in a future prompt
    return NextResponse.json({
      message: "Expense retrieval will be implemented in the dashboard prompt",
      expenses: [],
    });
  } catch (error) {
    console.error("Error retrieving expenses:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve expenses",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
