import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const tokenUserId = await getAuthenticatedUserId(request);
    let bodyUserId: string | null = null;
    try {
      const body = await request.json();
      bodyUserId = body.userId || null;
    } catch {
      // No body or invalid JSON — that's fine
    }
    const userId = tokenUserId || bodyUserId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;

    // Fetch user profile for display name
    const userDoc = await adminDb.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const displayName = userData?.displayName || userData?.email || "Unknown User";

    // Check membership
    const membershipId = `${groupId}_${userId}`;
    const membershipDoc = await adminDb
      .collection("groupMembers")
      .doc(membershipId)
      .get();

    if (!membershipDoc.exists) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const membershipData = membershipDoc.data();

    // Owners cannot leave - they must transfer ownership first or delete the group
    if (membershipData?.role === "owner") {
      return NextResponse.json(
        {
          error: "Owners cannot leave the group",
          details: "Please transfer ownership to another member or delete the group",
        },
        { status: 400 }
      );
    }

    // Update membership status to 'left'
    await adminDb.collection("groupMembers").doc(membershipId).update({
      status: "left",
      leftAt: Timestamp.now(),
    });

    // Decrease member count in group stats
    const groupRef = adminDb.collection("groups").doc(groupId);
    const groupDoc = await groupRef.get();

    if (groupDoc.exists) {
      const currentMemberCount = groupDoc.data()?.stats?.memberCount || 0;
      await groupRef.update({
        "stats.memberCount": Math.max(0, currentMemberCount - 1),
        "stats.lastActivityAt": Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    // Log activity
    await adminDb.collection("groupActivity").add({
      groupId,
      userId,
      userName: displayName,
      action: "member_left",
      details: `${displayName} left the group`,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "You have left the group successfully",
    });
  } catch (error) {
    console.error("Error leaving group:", error);
    return NextResponse.json(
      {
        error: "Failed to leave group",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
