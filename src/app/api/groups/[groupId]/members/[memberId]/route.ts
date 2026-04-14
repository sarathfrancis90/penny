import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_ROLE_PERMISSIONS, GroupRole } from "@/lib/types";
import { PushService } from "@/lib/services/pushService";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";

/**
 * PATCH /api/groups/[groupId]/members/[memberId] - Update member role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; memberId: string }> }
) {
  try {
    const { groupId, memberId } = await params;
    const tokenUserId = await getAuthenticatedUserId(request);
    const body = await request.json();
    const { newRole, userId: bodyUserId } = body;
    const userId = tokenUserId || bodyUserId;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    if (!newRole) {
      return NextResponse.json(
        { error: "New role is required" },
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
    await adminDb.collection("groupActivity").add({
      groupId,
      userId: userId,
      userName: requesterData.userName || requesterData.userEmail || "Admin",
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

    // Notify the member whose role was changed
    try {
      const groupDoc = await adminDb.collection("groups").doc(groupId).get();
      const groupName = groupDoc.exists ? groupDoc.data()?.name : "Unknown Group";
      const requesterName = requesterData.userName || requesterData.userEmail || "An admin";

      await adminDb.collection("notifications").add({
        userId: targetMemberData.userId,
        type: "group_role_changed",
        title: "Role updated",
        body: `${requesterName} changed your role to ${newRole} in ${groupName}`,
        icon: "🔑",
        priority: "high",
        category: "group",
        read: false,
        delivered: false,
        isGrouped: false,
        actionUrl: `/groups/${groupId}`,
        relatedType: "member",
        relatedId: targetMemberData.userId,
        groupId,
        actorId: userId,
        actorName: requesterName,
        metadata: {
          groupName,
          oldRole: targetMemberData.role,
          newRole,
        },
        createdAt: Timestamp.now(),
      });

      console.log(`[Notifications] Created role_changed notification for user ${targetMemberData.userId}`);

      PushService.sendToUser(targetMemberData.userId, {
        title: "Role updated",
        body: `${requesterName} changed your role to ${newRole} in ${groupName}`,
        actionUrl: `/groups/${groupId}`,
        icon: "🔑",
        priority: "high",
      });
    } catch (notifError) {
      console.error("[Notifications] Error creating role_changed notification:", notifError);
    }

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

// PUT is an alias for PATCH
export const PUT = PATCH;

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
    const tokenUserId = await getAuthenticatedUserId(request);
    const userId = tokenUserId || searchParams.get("userId");
    const action = searchParams.get("action"); // "leave" or "remove"

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
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
      await adminDb.collection("groupActivity").add({
        groupId,
        userId: userId,
        userName: targetMemberData.userName || targetMemberData.userEmail || "Member",
        action: "member_left",
        details: `${targetMemberData.userEmail} left the group`,
        metadata: { email: targetMemberData.userEmail },
        createdAt: Timestamp.now(),
      });

      // Notify remaining group members about member leaving
      try {
        const groupName = groupDoc.data()?.name || 'Unknown Group';
        const remainingMembers = await adminDb
          .collection("groupMembers")
          .where("groupId", "==", groupId)
          .where("status", "==", "active")
          .get();

        const notifPromises = remainingMembers.docs
          .filter(doc => doc.data().userId !== userId)
          .map(memberDoc =>
            adminDb.collection("notifications").add({
              userId: memberDoc.data().userId,
              type: "group_member_left",
              title: "Member left",
              body: `${targetMemberData.userName || targetMemberData.userEmail} left the group`,
              icon: "👋",
              priority: "low",
              category: "group",
              read: false,
              delivered: false,
              isGrouped: false,
              actionUrl: `/groups/${groupId}`,
              relatedType: "member",
              relatedId: targetMemberData.userId,
              groupId,
              actorId: targetMemberData.userId,
              actorName: targetMemberData.userName || targetMemberData.userEmail || "A member",
              metadata: { groupName },
              createdAt: Timestamp.now(),
            })
          );

        await Promise.all(notifPromises);

        const pushRecipients = remainingMembers.docs
          .filter(doc => doc.data().userId !== userId)
          .map(doc => doc.data().userId);

        PushService.sendToUsers(pushRecipients, {
          title: "Member left",
          body: `${targetMemberData.userName || targetMemberData.userEmail} left the group`,
          actionUrl: `/groups/${groupId}`,
          icon: "👋",
          priority: "low",
        });
      } catch (notifError) {
        console.error("[Notifications] Error creating member_left notifications:", notifError);
      }

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
    await adminDb.collection("groupActivity").add({
      groupId,
      userId: userId,
      userName: requesterData.userName || requesterData.userEmail || "Admin",
      action: "member_removed",
      details: `Removed ${targetMemberData.userEmail} from the group`,
      metadata: {
        removedUserId: targetMemberData.userId,
        removedEmail: targetMemberData.userEmail,
      },
      createdAt: Timestamp.now(),
    });

    // Notify removed member
    try {
      const groupName = groupDoc.data()?.name || 'Unknown Group';
      const removerName = requesterData.userName || requesterData.userEmail || "An admin";

      await adminDb.collection("notifications").add({
        userId: targetMemberData.userId,
        type: "group_member_left",
        title: "Removed from group",
        body: `You were removed from ${groupName} by ${removerName}`,
        icon: "🚫",
        priority: "high",
        category: "group",
        read: false,
        delivered: false,
        isGrouped: false,
        relatedType: "group",
        relatedId: groupId,
        groupId,
        actorId: userId,
        actorName: removerName,
        metadata: { groupName, reason: "removed" },
        createdAt: Timestamp.now(),
      });

      // Notify remaining members
      const remainingMembers = await adminDb
        .collection("groupMembers")
        .where("groupId", "==", groupId)
        .where("status", "==", "active")
        .get();

      const notifPromises = remainingMembers.docs
        .filter(doc => doc.data().userId !== userId && doc.data().userId !== targetMemberData.userId)
        .map(memberDoc =>
          adminDb.collection("notifications").add({
            userId: memberDoc.data().userId,
            type: "group_member_left",
            title: "Member removed",
            body: `${targetMemberData.userName || targetMemberData.userEmail} was removed from ${groupName}`,
            icon: "👋",
            priority: "low",
            category: "group",
            read: false,
            delivered: false,
            isGrouped: false,
            actionUrl: `/groups/${groupId}`,
            relatedType: "member",
            relatedId: targetMemberData.userId,
            groupId,
            actorId: userId,
            actorName: removerName,
            metadata: { groupName, removedBy: removerName },
            createdAt: Timestamp.now(),
          })
        );

      await Promise.all(notifPromises);

      // Push to removed member
      PushService.sendToUser(targetMemberData.userId, {
        title: "Removed from group",
        body: `You were removed from ${groupName} by ${removerName}`,
        icon: "🚫",
        priority: "high",
      });

      // Push to remaining members
      const pushRecipients = remainingMembers.docs
        .filter(doc => doc.data().userId !== userId && doc.data().userId !== targetMemberData.userId)
        .map(doc => doc.data().userId);

      PushService.sendToUsers(pushRecipients, {
        title: "Member removed",
        body: `${targetMemberData.userName || targetMemberData.userEmail} was removed from ${groupName}`,
        actionUrl: `/groups/${groupId}`,
        icon: "👋",
        priority: "low",
      });
    } catch (notifError) {
      console.error("[Notifications] Error creating member_removed notifications:", notifError);
    }

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

