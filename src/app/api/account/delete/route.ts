import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { adminApp, adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireAuthenticatedUser } from "@/lib/auth-middleware";
import { withObservability } from "@/lib/observability/withObservability";

/**
 * DELETE /api/account/delete
 *
 * Permanently deletes the authenticated user's account and all associated data
 * from Firestore, Firebase Auth, and Firebase Storage.
 *
 * Requires: Bearer token authentication (Firebase ID token).
 */
async function deleteHandler(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    // Delete all user data from Firestore collections
    const collections = [
      { name: "expenses", field: "userId" },
      { name: "budgets_personal", field: "userId" },
      { name: "income_sources_personal", field: "userId" },
      { name: "savings_goals_personal", field: "userId" },
      { name: "savings_contributions", field: "userId" },
      { name: "notifications", field: "userId" },
      { name: "conversations", field: "userId" },
      { name: "groupMembers", field: "userId" },
      { name: "groupActivities", field: "userId" },
      { name: "groupInvitations", field: "invitedBy" },
      { name: "passkeys", field: "userId" },
      { name: "challenges", field: "userId" },
    ];

    // Firestore batches have a 500-operation limit, and a committed batch
    // can't be reused, so start a fresh batch for every chunk.
    const BATCH_LIMIT = 450; // leave some headroom
    let batch = adminDb.batch();
    let opCount = 0;

    const deleteRef = async (ref: FirebaseFirestore.DocumentReference) => {
      batch.delete(ref);
      opCount++;
      if (opCount >= BATCH_LIMIT) {
        await batch.commit();
        batch = adminDb.batch();
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
            await deleteRef(msg.ref);
          }
        }

        await deleteRef(doc.ref);
      }
    }

    // Notification settings live under and beside the user profile
    const userDoc = adminDb.collection("users").doc(userId);
    const preferences = await userDoc.collection("notificationPreferences").get();
    for (const pref of preferences.docs) {
      await deleteRef(pref.ref);
    }
    const settingsDoc = adminDb.collection("userNotificationSettings").doc(userId);
    if ((await settingsDoc.get()).exists) {
      await deleteRef(settingsDoc);
    }

    // Delete the user profile document
    if ((await userDoc.get()).exists) {
      await deleteRef(userDoc);
    }

    // Commit remaining operations
    if (opCount > 0) {
      await batch.commit();
    }

    // Delete the user's uploaded files (receipt images, chat attachments,
    // avatar). Best effort: a storage failure must not block the deletion,
    // but it is logged so leftover files can be cleaned up.
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    for (const prefix of [`receipts/${userId}/`, `conversations/${userId}/`, `avatars/${userId}/`]) {
      try {
        await getStorage(adminApp).bucket(bucketName).deleteFiles({ prefix });
      } catch (storageError) {
        console.error(
          `[Account Delete] Could not delete files under ${prefix}:`,
          storageError instanceof Error ? storageError.message : storageError
        );
      }
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

export const DELETE = withObservability(deleteHandler, { route: "/api/account/delete" });
