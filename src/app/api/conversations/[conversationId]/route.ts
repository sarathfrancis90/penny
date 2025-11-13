import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/conversations/[conversationId]
 * Get conversation with messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Get conversation
    const conversationDoc = await adminDb
      .collection("conversations")
      .doc(conversationId)
      .get();

    if (!conversationDoc.exists) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversationData = conversationDoc.data();

    // Verify ownership
    if (conversationData?.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get messages
    const messagesSnapshot = await adminDb
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .get();

    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      conversation: {
        id: conversationDoc.id,
        ...conversationData,
      },
      messages,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/conversations/[conversationId]
 * Update conversation metadata
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await request.json();
    const { userId, title, summary, isPinned, status } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Verify conversation exists and belongs to user
    const conversationRef = adminDb.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversationData = conversationDoc.data();
    if (conversationData?.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (title !== undefined) {
      updates.title = title.substring(0, 100);
    }

    if (summary !== undefined) {
      updates.summary = summary;
    }

    if (status !== undefined) {
      updates.status = status;
    }

    if (isPinned !== undefined) {
      updates["metadata.isPinned"] = isPinned;
    }

    await conversationRef.update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating conversation:", error);
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[conversationId]
 * Delete conversation and all messages
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Verify conversation exists and belongs to user
    const conversationRef = adminDb.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversationData = conversationDoc.data();
    if (conversationData?.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete all messages in subcollection
    const messagesSnapshot = await conversationRef.collection("messages").get();
    
    const batch = adminDb.batch();
    messagesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete conversation
    batch.delete(conversationRef);

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}

