import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { GroupMember, GroupRole } from "@/lib/types";
import { randomBytes } from "crypto";

/**
 * GET /api/groups/[groupId]/members - Get all members of a group
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Check if user is a member
    const userMembershipDoc = await adminDb
      .collection("groupMembers")
      .doc(`${groupId}_${userId}`)
      .get();

    if (!userMembershipDoc.exists || userMembershipDoc.data()?.status !== "active") {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    // Get all members
    const membersSnapshot = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", groupId)
      .where("status", "in", ["active", "invited"])
      .get();

    const members = membersSnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    })) as GroupMember[];

    return NextResponse.json({
      success: true,
      members,
      count: members.length,
    });
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch members",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/groups/[groupId]/members - Invite a new member
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const { userId, email, role = "member" } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "User ID and email are required" },
        { status: 400 }
      );
    }

    // Validate role
    if (!["admin", "member", "viewer"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be admin, member, or viewer" },
        { status: 400 }
      );
    }

    // Check if inviter has permission
    const inviterMembershipDoc = await adminDb
      .collection("groupMembers")
      .doc(`${groupId}_${userId}`)
      .get();

    if (!inviterMembershipDoc.exists) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const inviterData = inviterMembershipDoc.data();
    if (!inviterData || !inviterData.permissions.canInviteMembers) {
      return NextResponse.json(
        { error: "No permission to invite members" },
        { status: 403 }
      );
    }

    // Check if group settings allow member invites
    const groupDoc = await adminDb.collection("groups").doc(groupId).get();
    const groupData = groupDoc.data();
    
    if (!groupData) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      );
    }

    if (!groupData.settings.allowMemberInvites && inviterData?.role !== "owner") {
      return NextResponse.json(
        { error: "Member invitations are disabled for this group" },
        { status: 403 }
      );
    }

    // Check if user is already a member or invited
    const existingMembersSnapshot = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", groupId)
      .where("userEmail", "==", email.toLowerCase())
      .get();

    if (!existingMembersSnapshot.empty) {
      const existingMember = existingMembersSnapshot.docs[0].data();
      if (existingMember.status === "active") {
        return NextResponse.json(
          { error: "User is already a member" },
          { status: 400 }
        );
      } else if (existingMember.status === "invited") {
        return NextResponse.json(
          { error: "User is already invited" },
          { status: 400 }
        );
      }
    }

    // Create invitation
    const invitationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invitationData = {
      groupId,
      groupName: groupData.name,
      invitedEmail: email.toLowerCase(),
      invitedBy: userId,
      invitedByName: inviterData?.userName || "A team member",
      role: role as GroupRole,
      status: "pending",
      token: invitationToken,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
      metadata: {
        emailSent: false,
      },
    };

    const invitationRef = await adminDb
      .collection("groupInvitations")
      .add(invitationData);

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId,
      userId,
      userName: inviterData?.userName || "User",
      action: "member_invited",
      details: `Invited ${email} as ${role}`,
      metadata: { email, role, invitationId: invitationRef.id },
      createdAt: Timestamp.now(),
    });

    // Create notification for the invited user (if they're registered)
    try {
      const usersSnapshot = await adminDb
        .collection("users")
        .where("email", "==", email.toLowerCase())
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        const invitedUserDoc = usersSnapshot.docs[0];
        const invitedUserId = invitedUserDoc.id;
        
        // Get inviter info
        const inviterDoc = await adminDb.collection("users").doc(userId).get();
        const inviterUserData = inviterDoc.exists ? inviterDoc.data() : null;
        const inviterName = inviterUserData?.displayName || inviterUserData?.email || 'Someone';
        const inviterAvatar = inviterUserData?.photoURL;

        await adminDb.collection("notifications").add({
          userId: invitedUserId,
          type: "group_invitation",
          title: "Group invitation",
          body: `${inviterName} invited you to join ${groupData.icon || '👥'} ${groupData.name}`,
          icon: "📨",
          priority: "high",
          category: "group",
          read: false,
          delivered: false,
          isGrouped: false,
          actions: [
            {
              id: "accept",
              label: "Accept",
              variant: "primary",
              action: "accept_group_invitation",
            },
            {
              id: "decline",
              label: "Decline",
              variant: "default",
              action: "decline_group_invitation",
            },
          ],
          actionUrl: `/groups/${groupId}`,
          relatedId: groupId,
          relatedType: "group",
          groupId: groupId,
          actorId: userId,
          actorName: inviterName,
          actorAvatar: inviterAvatar,
          metadata: {
            groupName: groupData.name,
            groupIcon: groupData.icon || '👥',
            invitationId: invitationRef.id,
            invitationToken: invitationToken,
          },
          createdAt: Timestamp.now(),
        });

        console.log(`[Notifications] Created invitation notification for user ${invitedUserId}`);
      } else {
        console.log(`[Notifications] User with email ${email} not registered yet, skipping notification`);
      }
    } catch (notifError) {
      // Don't fail the invitation if notification fails
      console.error("[Notifications] Error creating invitation notification:", notifError);
    }

    // TODO: Send invitation email (implement in separate email service)

    return NextResponse.json({
      success: true,
      message: "Invitation sent successfully",
      invitationId: invitationRef.id,
      invitationToken, // Return for testing purposes (in production, only send via email)
    });
  } catch (error) {
    console.error("Error inviting member:", error);
    return NextResponse.json(
      {
        error: "Failed to invite member",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

