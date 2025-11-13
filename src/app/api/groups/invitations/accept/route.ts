import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_ROLE_PERMISSIONS, GroupRole } from "@/lib/types";

/**
 * POST /api/groups/invitations/accept - Accept a group invitation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, userId, userEmail, userName } = body;

    if (!token || !userId || !userEmail) {
      return NextResponse.json(
        { error: "Token, userId, and userEmail are required" },
        { status: 400 }
      );
    }

    // Find invitation by token
    const invitationsSnapshot = await adminDb
      .collection("groupInvitations")
      .where("token", "==", token)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (invitationsSnapshot.empty) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 404 }
      );
    }

    const invitationDoc = invitationsSnapshot.docs[0];
    const invitation = invitationDoc.data();

    // Validate email matches
    if (invitation.invitedEmail.toLowerCase() !== userEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation is for a different email address" },
        { status: 403 }
      );
    }

    // Check if invitation expired
    const now = new Date();
    const expiresAt = invitation.expiresAt.toDate();
    if (now > expiresAt) {
      await invitationDoc.ref.update({
        status: "expired",
      });
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      );
    }

    // Check if already a member
    const membershipId = `${invitation.groupId}_${userId}`;
    const existingMembership = await adminDb
      .collection("groupMembers")
      .doc(membershipId)
      .get();

    if (existingMembership.exists && existingMembership.data()?.status === "active") {
      return NextResponse.json(
        { error: "Already a member of this group" },
        { status: 400 }
      );
    }

    // Create membership
    const membershipData = {
      groupId: invitation.groupId,
      userId,
      userEmail: userEmail.toLowerCase(),
      userName: userName || "",
      role: invitation.role,
      status: "active",
      invitedAt: invitation.createdAt,
      invitedBy: invitation.invitedBy,
      joinedAt: Timestamp.now(),
      permissions: DEFAULT_ROLE_PERMISSIONS[invitation.role as GroupRole],
      lastActivityAt: Timestamp.now(),
    };

    await adminDb.collection("groupMembers").doc(membershipId).set(membershipData);

    // Update invitation status
    await invitationDoc.ref.update({
      status: "accepted",
      respondedAt: Timestamp.now(),
    });

    // Update group stats
    const groupRef = adminDb.collection("groups").doc(invitation.groupId);
    const groupDoc = await groupRef.get();
    const currentMemberCount = groupDoc.data()?.stats?.memberCount || 0;

    await groupRef.update({
      "stats.memberCount": currentMemberCount + 1,
      "stats.lastActivityAt": Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId: invitation.groupId,
      userId,
      userName: userName || "New member",
      action: "member_joined",
      details: `${userEmail} joined the group`,
      metadata: { email: userEmail, role: invitation.role },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Successfully joined the group",
      groupId: invitation.groupId,
      groupName: invitation.groupName,
      role: invitation.role,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      {
        error: "Failed to accept invitation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

