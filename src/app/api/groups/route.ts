import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { Group, GroupMember, DEFAULT_ROLE_PERMISSIONS } from "@/lib/types";

/**
 * GET /api/groups - Get all groups for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Get userId from query params (set by middleware/auth)
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get all group memberships for this user
    const membershipsSnapshot = await adminDb
      .collection("groupMembers")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .get();

    if (membershipsSnapshot.empty) {
      return NextResponse.json({
        success: true,
        groups: [],
        message: "No groups found",
      });
    }

    // Get all group IDs
    const groupIds = membershipsSnapshot.docs.map((doc) => doc.data().groupId);

    // Fetch all groups
    const groupsPromises = groupIds.map((groupId) =>
      adminDb.collection("groups").doc(groupId).get()
    );
    const groupDocs = await Promise.all(groupsPromises);

    // Combine group data with membership info
    const groups = groupDocs
      .filter((doc) => doc.exists)
      .map((doc, index) => {
        const groupData = doc.data() as Group;
        const membershipData = membershipsSnapshot.docs[index].data() as GroupMember;
        
        return {
          ...groupData,
          id: doc.id,
          myRole: membershipData.role,
          myPermissions: membershipData.permissions,
        };
      });

    return NextResponse.json({
      success: true,
      groups,
      count: groups.length,
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch groups",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/groups - Create a new group
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, color, icon, settings, userId } = body;

    // Validation
    if (!name || !userId) {
      return NextResponse.json(
        { error: "Name and userId are required" },
        { status: 400 }
      );
    }

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: "Name must be between 2 and 100 characters" },
        { status: 400 }
      );
    }

    const now = Timestamp.now();

    // Create group data
    const groupData = {
      name: name.trim(),
      description: description?.trim() || "",
      color: color || "#8B5CF6", // Default violet
      icon: icon || "👥",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      settings: {
        defaultCategory: settings?.defaultCategory || undefined,
        budget: settings?.budget || undefined,
        budgetPeriod: settings?.budgetPeriod || "monthly",
        requireApproval: settings?.requireApproval || false,
        allowMemberInvites: settings?.allowMemberInvites || true,
        currency: settings?.currency || "CAD",
      },
      status: "active",
      stats: {
        memberCount: 1,
        expenseCount: 0,
        totalAmount: 0,
        lastActivityAt: now,
      },
    };

    // Create group
    const groupRef = await adminDb.collection("groups").add(groupData);
    const groupId = groupRef.id;

    // Create owner membership
    const membershipId = `${groupId}_${userId}`;
    const membershipData = {
      groupId,
      userId,
      userEmail: body.userEmail || "",
      userName: body.userName || "",
      role: "owner",
      status: "active",
      invitedAt: now,
      invitedBy: userId,
      joinedAt: now,
      permissions: DEFAULT_ROLE_PERMISSIONS.owner,
      lastActivityAt: now,
    };

    await adminDb
      .collection("groupMembers")
      .doc(membershipId)
      .set(membershipData);

    // Log activity
    await adminDb.collection("groupActivities").add({
      groupId,
      userId,
      userName: body.userName || "User",
      action: "group_created",
      details: `Created group "${name}"`,
      metadata: { groupName: name },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      groupId,
      message: "Group created successfully",
      group: {
        ...groupData,
        id: groupId,
        myRole: "owner",
        myPermissions: DEFAULT_ROLE_PERMISSIONS.owner,
      },
    });
  } catch (error) {
    console.error("Error creating group:", error);
    return NextResponse.json(
      {
        error: "Failed to create group",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

