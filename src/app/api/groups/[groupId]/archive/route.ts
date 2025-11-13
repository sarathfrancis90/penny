import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Verify user is owner or admin
    const memberDoc = await adminDb
      .collection("groupMembers")
      .doc(`${groupId}_${userId}`)
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
      archivedBy: userId,
      updatedAt: Timestamp.now(),
    });

    // Log activity
    await adminDb.collection("groupActivity").add({
      groupId,
      userId: userId,
      userName: memberData.userName || memberData.userEmail || "Unknown User",
      action: "group_archived",
      details: `Group archived by ${memberData.userName || memberData.userEmail}`,
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

