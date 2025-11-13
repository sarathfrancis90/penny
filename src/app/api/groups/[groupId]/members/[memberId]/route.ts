import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_ROLE_PERMISSIONS, GroupRole } from "@/lib/types";

/**
 * PATCH /api/groups/[groupId]/members/[memberId] - Update member role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; memberId: string }> }
) {
  try {
    const { groupId, memberId } = await params;
    const body = await request.json();
    const { userId, newRole } = body;

    if (!userId || !newRole) {
      return NextResponse.json(
        { error: "User ID and new role are required" },
        { status: 400 }
      );
    }

    // Validate role
    if (!["owner", "admin", "member", "viewer"].includes(newRole)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    // Check if requester has permission
    const requesterMembershipDoc = await adminDb
      .collection("groupMembers")
      .doc(`${groupId}_${userId}`)
      .get();

    if (!requesterMembershipDoc.exists) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const requesterData = requesterMembershipDoc.data();
    if (!requesterData) {
      return NextResponse.json(
        { error: "Invalid membership data" },
        { status: 500 }
      );
    }

    const isOwner = requesterData.role === "owner";
    const isAdmin = requesterData.role === "admin";

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Only owners and admins can change member roles" },
        { status: 403 }
      );
    }

    // Get target member
    const targetMemberDoc = await adminDb
      .collection("groupMembers")
      .doc(memberId)
      .get();

    if (!targetMemberDoc.exists) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    const targetMemberData = targetMemberDoc.data();
    if (!targetMemberData) {
      return NextResponse.json(
        { error: "Invalid member data" },
        { status: 500 }
      );
    }

    // Validate permissions
    if (targetMemberData.role === "owner") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Only owners can modify owner roles" },
          { status: 403 }
        );
      }
      if (newRole !== "owner") {
        return NextResponse.json(
          { error: "Cannot demote the owner. Transfer ownership first." },
          { status: 400 }
        );
      }
    }

    if (newRole === "owner" && !isOwner) {
      return NextResponse.json(
        { error: "Only owners can promote members to owner" },
        { status: 403 }
      );
    }

    if (targetMemberData.role === "admin" && !isOwner) {
      return NextResponse.json(
        { error: "Only owners can modify admin roles" },
        { status: 403 }
      );
    }

    // Update member role
    await targetMemberDoc.ref.update({
      role: newRole,
      permissions: DEFAULT_ROLE_PERMISSIONS[newRole as GroupRole],
      lastActivityAt: Timestamp.now(),
    });

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId,
      userId,
      userName: requesterData.userName || "Admin",
      action: "member_role_changed",
      details: `Changed ${targetMemberData.userEmail}'s role from ${targetMemberData.role} to ${newRole}`,
      metadata: {
        targetUserId: targetMemberData.userId,
        targetEmail: targetMemberData.userEmail,
        oldRole: targetMemberData.role,
        newRole,
      },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Member role updated successfully",
    });
  } catch (error) {
    console.error("Error updating member role:", error);
    return NextResponse.json(
      {
        error: "Failed to update member role",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/groups/[groupId]/members/[memberId] - Remove member from group
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; memberId: string }> }
) {
  try {
    const { groupId, memberId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action"); // "leave" or "remove"

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get target member
    const targetMemberDoc = await adminDb
      .collection("groupMembers")
      .doc(memberId)
      .get();

    if (!targetMemberDoc.exists) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    const targetMemberData = targetMemberDoc.data();
    if (!targetMemberData) {
      return NextResponse.json(
        { error: "Invalid member data" },
        { status: 500 }
      );
    }

    // Check if it's a leave action (member removing themselves)
    if (action === "leave" && targetMemberData.userId === userId) {
      if (targetMemberData.role === "owner") {
        return NextResponse.json(
          { error: "Owners cannot leave the group. Transfer ownership first or delete the group." },
          { status: 400 }
        );
      }

      // Update status to "left"
      await targetMemberDoc.ref.update({
        status: "left",
        leftAt: Timestamp.now(),
      });

      // Update group stats
      const groupRef = adminDb.collection("groups").doc(groupId);
      const groupDoc = await groupRef.get();
      const currentMemberCount = groupDoc.data()?.stats?.memberCount || 0;

      await groupRef.update({
        "stats.memberCount": Math.max(0, currentMemberCount - 1),
        "stats.lastActivityAt": Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Log activity
      await adminDb.collection("groupActivities").add({
        groupId,
        userId,
        userName: targetMemberData.userName || "Member",
        action: "member_left",
        details: `${targetMemberData.userEmail} left the group`,
        metadata: { email: targetMemberData.userEmail },
        createdAt: Timestamp.now(),
      });

      return NextResponse.json({
        success: true,
        message: "Successfully left the group",
      });
    }

    // Otherwise, it's a remove action by admin/owner
    const requesterMembershipDoc = await adminDb
      .collection("groupMembers")
      .doc(`${groupId}_${userId}`)
      .get();

    if (!requesterMembershipDoc.exists) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const requesterData = requesterMembershipDoc.data();
    if (!requesterData || !requesterData.permissions.canRemoveMembers) {
      return NextResponse.json(
        { error: "No permission to remove members" },
        { status: 403 }
      );
    }

    // Can't remove owner
    if (targetMemberData.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the owner" },
        { status: 400 }
      );
    }

    // Only owners can remove admins
    if (targetMemberData.role === "admin" && requesterData.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can remove admins" },
        { status: 403 }
      );
    }

    // Update status to "removed"
    await targetMemberDoc.ref.update({
      status: "removed",
      removedBy: userId,
      leftAt: Timestamp.now(),
    });

    // Update group stats
    const groupRef = adminDb.collection("groups").doc(groupId);
    const groupDoc = await groupRef.get();
    const currentMemberCount = groupDoc.data()?.stats?.memberCount || 0;

    await groupRef.update({
      "stats.memberCount": Math.max(0, currentMemberCount - 1),
      "stats.lastActivityAt": Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId,
      userId,
      userName: requesterData.userName || "Admin",
      action: "member_removed",
      details: `Removed ${targetMemberData.userEmail} from the group`,
      metadata: {
        removedUserId: targetMemberData.userId,
        removedEmail: targetMemberData.userEmail,
      },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      {
        error: "Failed to remove member",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

