import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * GET /api/user/default-group
 * Get the user's default group
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Get user profile
    const userDoc = await adminDb.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data();
    const defaultGroupId = userData?.preferences?.defaultGroupId || null;

    return NextResponse.json({ defaultGroupId });
  } catch (error) {
    console.error("Error fetching default group:", error);
    return NextResponse.json(
      { error: "Failed to fetch default group" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/default-group
 * Set the user's default group
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, groupId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Validate that the user is a member of the group (if groupId is provided)
    if (groupId) {
      const membershipQuery = await adminDb
        .collection("groupMembers")
        .where("groupId", "==", groupId)
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (membershipQuery.empty) {
        return NextResponse.json(
          { error: "You must be a member of this group to set it as default" },
          { status: 403 }
        );
      }
    }

    // Update user profile
    await adminDb
      .collection("users")
      .doc(userId)
      .set(
        {
          preferences: {
            defaultGroupId: groupId || null, // null to unset
          },
          updatedAt: new Date(),
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      defaultGroupId: groupId || null,
    });
  } catch (error) {
    console.error("Error setting default group:", error);
    return NextResponse.json(
      { error: "Failed to set default group" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/default-group
 * Remove the user's default group
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Update user profile to remove default group
    await adminDb
      .collection("users")
      .doc(userId)
      .set(
        {
          preferences: {
            defaultGroupId: null,
          },
          updatedAt: new Date(),
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      defaultGroupId: null,
    });
  } catch (error) {
    console.error("Error removing default group:", error);
    return NextResponse.json(
      { error: "Failed to remove default group" },
      { status: 500 }
    );
  }
}

