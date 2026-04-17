import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { Group } from "@/lib/types";
import { PushService } from "@/lib/services/pushService";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";
import { withObservability } from "@/lib/observability/withObservability";

/**
 * GET /api/groups/[groupId] - Get a specific group
 */
async function getHandler(
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

    // Check membership
    const membershipId = `${groupId}_${userId}`;
    const membershipDoc = await adminDb
      .collection("groupMembers")
      .doc(membershipId)
      .get();

    if (!membershipDoc.exists || membershipDoc.data()?.status !== "active") {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    // Get group
    const groupDoc = await adminDb.collection("groups").doc(groupId).get();

    if (!groupDoc.exists) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      );
    }

    const groupData = groupDoc.data() as Group;
    const membershipData = membershipDoc.data();

    if (!membershipData) {
      return NextResponse.json(
        { error: "Membership data not found" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      group: {
        ...groupData,
        id: groupDoc.id,
        myRole: membershipData.role,
        myPermissions: membershipData.permissions,
      },
    });
  } catch (error) {
    console.error("Error fetching group:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch group",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/groups/[groupId] - Update a group
 */
async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;

    // Authenticate: prefer Bearer token (mobile), fall back to body userId (web)
    const tokenUserId = await getAuthenticatedUserId(request);

    const body = await request.json();
    const { name, description, color, icon, settings, userId: bodyUserId } = body;

    const userId = tokenUserId ?? bodyUserId;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Check membership and permissions
    const membershipId = `${groupId}_${userId}`;
    const membershipDoc = await adminDb
      .collection("groupMembers")
      .doc(membershipId)
      .get();

    if (!membershipDoc.exists || membershipDoc.data()?.status !== "active") {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const membershipData = membershipDoc.data();
    
    if (!membershipData) {
      return NextResponse.json(
        { error: "Membership data not found" },
        { status: 500 }
      );
    }
    
    const isOwner = membershipData.role === "owner";
    const isAdmin = membershipData.role === "admin" || isOwner;

    // Check permissions for settings changes
    if (settings && !isOwner) {
      return NextResponse.json(
        { error: "Only owners can change group settings" },
        { status: 403 }
      );
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only admins can update group details" },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (name !== undefined) {
      if (name.length < 2 || name.length > 100) {
        return NextResponse.json(
          { error: "Name must be between 2 and 100 characters" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description.trim();
    }

    if (color !== undefined) {
      updateData.color = color;
    }

    if (icon !== undefined) {
      updateData.icon = icon;
    }

    if (settings && isOwner) {
      const groupDoc = await adminDb.collection("groups").doc(groupId).get();
      const currentSettings = groupDoc.data()?.settings || {};
      
      // Filter out undefined values from settings (Firestore doesn't allow undefined)
      const cleanedSettings = Object.fromEntries(
        Object.entries(settings).filter(([, value]) => value !== undefined)
      );
      
      updateData.settings = {
        ...currentSettings,
        ...cleanedSettings,
      };
    }

    // Update group
    await adminDb.collection("groups").doc(groupId).update(updateData);

    // Log activity
    await adminDb.collection("groupActivity").add({
      groupId,
      userId: userId,
      userName: membershipData.userName || membershipData.userEmail || "Unknown User",
      action: "group_updated",
      details: "Updated group details",
      metadata: { changes: Object.keys(updateData) },
      createdAt: Timestamp.now(),
    });

    // Notify group members about settings changes
    if (updateData.settings) {
      try {
        const groupDoc = await adminDb.collection("groups").doc(groupId).get();
        const groupName = groupDoc.data()?.name || 'Unknown Group';
        const actorName = membershipData.userName || membershipData.userEmail || "Owner";

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
              type: "group_settings_changed",
              title: "Group settings updated",
              body: `${actorName} updated settings for ${groupName}`,
              icon: "⚙️",
              priority: "low",
              category: "group",
              read: false,
              delivered: false,
              isGrouped: false,
              actionUrl: `/groups/${groupId}`,
              relatedType: "group",
              relatedId: groupId,
              groupId,
              actorId: userId,
              actorName,
              metadata: {
                groupName,
                changes: Object.keys(settings),
              },
              createdAt: Timestamp.now(),
            })
          );

        await Promise.all(notifPromises);
        console.log(`[Notifications] Created ${notifPromises.length} settings_changed notifications`);

        const pushRecipients = membersSnapshot.docs
          .filter(doc => doc.data().userId !== userId)
          .map(doc => doc.data().userId);

        PushService.sendToUsers(pushRecipients, {
          title: "Group settings updated",
          body: `${actorName} updated settings for ${groupName}`,
          actionUrl: `/groups/${groupId}`,
          icon: "⚙️",
          priority: "low",
        });
      } catch (notifError) {
        console.error("[Notifications] Error creating settings_changed notifications:", notifError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Group updated successfully",
    });
  } catch (error) {
    console.error("Error updating group:", error);
    return NextResponse.json(
      {
        error: "Failed to update group",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/groups/[groupId] - Permanently delete a group
 */
async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;

    // Authenticate: prefer Bearer token (mobile), fall back to query param (web)
    const tokenUserId = await getAuthenticatedUserId(request);
    const { searchParams } = new URL(request.url);
    const userId = tokenUserId ?? searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Check membership and permissions
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
    
    if (!membershipData || membershipData.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can delete groups" },
        { status: 403 }
      );
    }

    // Mark group as deleted (soft delete for safety)
    await adminDb
      .collection("groups")
      .doc(groupId)
      .update({
        status: "deleted",
        updatedAt: Timestamp.now(),
      });

    // Update all members' status to 'removed'
    const membersSnapshot = await adminDb
      .collection("groupMembers")
      .where("groupId", "==", groupId)
      .get();

    const batch = adminDb.batch();
    membersSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "removed",
        leftAt: Timestamp.now(),
      });
    });
    await batch.commit();

    // Convert group expenses to personal expenses
    const expensesSnapshot = await adminDb
      .collection("expenses")
      .where("groupId", "==", groupId)
      .get();

    const expenseBatch = adminDb.batch();
    expensesSnapshot.docs.forEach((doc) => {
      expenseBatch.update(doc.ref, {
        groupId: null,
        expenseType: "personal",
        updatedAt: Timestamp.now(),
      });
    });
    await expenseBatch.commit();

    // Log activity
    await adminDb.collection("groupActivity").add({
      groupId,
      userId: userId,
      userName: membershipData.userName || membershipData.userEmail || "Unknown User",
      action: "group_deleted",
      details: `Group permanently deleted by ${membershipData.userName || membershipData.userEmail}`,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting group:", error);
    return NextResponse.json(
      {
        error: "Failed to delete group",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(
  getHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/groups/[groupId]" },
);
export const PATCH = withObservability(
  patchHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/groups/[groupId]" },
);
export const PUT = withObservability(
  patchHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/groups/[groupId]" },
);
export const DELETE = withObservability(
  deleteHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/groups/[groupId]" },
);
