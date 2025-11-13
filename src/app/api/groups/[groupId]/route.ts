import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { auth } from "@/lib/firebase";
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
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;
    const body = await request.json();
    const { name, description, color, icon, settings } = body;

    // Check membership and permissions
    const membershipId = `${groupId}_${currentUser.uid}`;
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
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || "Unknown User",
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

// PUT is an alias for PATCH
export const PUT = PATCH;

/**
 * DELETE /api/groups/[groupId] - Permanently delete a group
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;

    // Check membership and permissions
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
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || "Unknown User",
      action: "group_deleted",
      details: `Group permanently deleted by ${currentUser.displayName || currentUser.email}`,
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

