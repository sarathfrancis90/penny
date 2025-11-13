import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { Group } from "@/lib/types";

/**
 * GET /api/groups/[groupId] - Get a specific group
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
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const { userId, name, description, color, icon, settings } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
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
      
      updateData.settings = {
        ...currentSettings,
        ...settings,
      };
    }

    // Update group
    await adminDb.collection("groups").doc(groupId).update(updateData);

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId,
      userId,
      userName: membershipData.userName || "User",
      action: "group_updated",
      details: "Updated group details",
      metadata: { changes: Object.keys(updateData) },
      createdAt: Timestamp.now(),
    });

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
 * DELETE /api/groups/[groupId] - Archive a group
 */
export async function DELETE(
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

    // Archive group (soft delete)
    await adminDb
      .collection("groups")
      .doc(groupId)
      .update({
        status: "archived",
        archivedAt: Timestamp.now(),
        archivedBy: userId,
        updatedAt: Timestamp.now(),
      });

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId,
      userId,
      userName: membershipData.userName || "User",
      action: "group_archived",
      details: "Archived group",
      metadata: {},
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

