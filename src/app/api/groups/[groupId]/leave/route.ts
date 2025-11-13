import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { auth } from "@/lib/firebase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;

    // Check membership
    const membershipId = `${groupId}_${currentUser.uid}`;
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
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || "Unknown User",
      action: "member_left",
      details: `${currentUser.displayName || currentUser.email} left the group`,
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

