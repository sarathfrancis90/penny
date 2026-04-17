import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { PushService } from "@/lib/services/pushService";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";
import { withObservability } from "@/lib/observability/withObservability";

async function postHandler(
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

    // Notify remaining group members
    try {
      const groupName = groupDoc.data()?.name || 'Unknown Group';
      const membersSnapshot = await adminDb
        .collection("groupMembers")
        .where("groupId", "==", groupId)
        .where("status", "==", "active")
        .get();

      const notifPromises = membersSnapshot.docs
        .filter(doc => doc.data().userId !== userId)
        .map(memberDoc =>
          adminDb.collection("notifications").add({
            userId: memberDoc.data().userId,
            type: "group_member_left",
            title: "Member left",
            body: `${displayName} left ${groupName}`,
            icon: "👋",
            priority: "low",
            category: "group",
            read: false,
            delivered: false,
            isGrouped: false,
            actionUrl: `/groups/${groupId}`,
            relatedType: "member",
            relatedId: userId,
            groupId: groupId,
            actorId: userId,
            actorName: displayName,
            metadata: { groupName },
            createdAt: Timestamp.now(),
          })
        );

      await Promise.all(notifPromises);
      console.log(`[Notifications] Created ${notifPromises.length} member_left notifications`);

      const pushRecipients = membersSnapshot.docs
        .filter(doc => doc.data().userId !== userId)
        .map(doc => doc.data().userId);

      PushService.sendToUsers(pushRecipients, {
        title: "Member left",
        body: `${displayName} left ${groupName}`,
        actionUrl: `/groups/${groupId}`,
        icon: "👋",
        priority: "low",
      });
    } catch (notifError) {
      console.error("[Notifications] Error creating member_left notifications:", notifError);
    }

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

export const POST = withObservability(
  postHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/groups/[groupId]/leave" },
);
