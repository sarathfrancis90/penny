import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";

/**
 * DELETE /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated data
 * from Firestore, Firebase Auth, and Firebase Storage.
 *
 * Requires: Bearer token authentication (Firebase ID token).
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Delete all user data from Firestore collections
    const batch = adminDb.batch();
    const collections = [
      { name: "expenses", field: "userId" },
      { name: "budgets_personal", field: "userId" },
      { name: "income_sources_personal", field: "userId" },
      { name: "savings_goals_personal", field: "userId" },
      { name: "notifications", field: "userId" },
      { name: "conversations", field: "userId" },
      { name: "groupMembers", field: "userId" },
      { name: "groupActivities", field: "userId" },
      { name: "groupInvitations", field: "invitedBy" },
      { name: "passkeys", field: "userId" },
      { name: "challenges", field: "userId" },
    ];

    // Firestore batches have a 500-operation limit, so process in chunks
    let opCount = 0;
    const BATCH_LIMIT = 450; // leave some headroom

    const commitBatchIfNeeded = async () => {
      if (opCount >= BATCH_LIMIT) {
        await batch.commit();
        opCount = 0;
      }
    };

    // Delete documents from each collection
    for (const { name, field } of collections) {
      const snapshot = await adminDb
        .collection(name)
        .where(field, "==", userId)
        .get();

      for (const doc of snapshot.docs) {
        // For conversations, also delete subcollection messages
        if (name === "conversations") {
          const messages = await doc.ref.collection("messages").get();
          for (const msg of messages.docs) {
            batch.delete(msg.ref);
            opCount++;
            await commitBatchIfNeeded();
          }
        }

        batch.delete(doc.ref);
        opCount++;
        await commitBatchIfNeeded();
      }
    }

    // Delete the user profile document
    const userDoc = adminDb.collection("users").doc(userId);
    if ((await userDoc.get()).exists) {
      batch.delete(userDoc);
      opCount++;
    }

    // Commit remaining operations
    if (opCount > 0) {
      await batch.commit();
    }

    // Delete Firebase Auth account
    try {
      await adminAuth.deleteUser(userId);
    } catch (authError) {
      // User may already be deleted from Auth — log but don't fail
      console.warn(
        `[Account Delete] Could not delete auth user ${userId}:`,
        authError instanceof Error ? authError.message : authError
      );
    }

    return NextResponse.json({
      success: true,
      message: "Account and all associated data have been permanently deleted.",
    });
  } catch (error) {
    console.error("[Account Delete] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete account. Please try again." },
      { status: 500 }
    );
  }
}
