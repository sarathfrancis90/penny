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

    // Verify user is owner or admin
    const memberDoc = await adminDb
      .collection("groupMembers")
      .doc(`${groupId}_${currentUser.uid}`)
      .get();

    if (!memberDoc.exists) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const memberData = memberDoc.data();
    const isOwner = memberData?.role === "owner";
    const isAdmin = memberData?.role === "admin";

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Only owners and admins can archive groups" },
        { status: 403 }
      );
    }

    // Archive the group
    await adminDb.collection("groups").doc(groupId).update({
      status: "archived",
      archivedAt: Timestamp.now(),
      archivedBy: currentUser.uid,
      updatedAt: Timestamp.now(),
    });

    // Log activity
    await adminDb.collection("groupActivity").add({
      groupId,
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || "Unknown User",
      action: "group_archived",
      details: `Group archived by ${currentUser.displayName || currentUser.email}`,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Group archived successfully",
    });
  } catch (error) {
    console.error("Error archiving group:", error);
    return NextResponse.json(
      {
        error: "Failed to archive group",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

