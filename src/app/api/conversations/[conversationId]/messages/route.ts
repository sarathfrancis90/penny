import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/conversations/[conversationId]/messages
 * Get messages for a conversation (paginated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limitParam = searchParams.get("limit");
    const beforeParam = searchParams.get("before"); // Timestamp for pagination

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    // Verify conversation belongs to user
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
    if (conversationData?.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Build query
    let query = adminDb
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limit(limit);

    // Add pagination if beforeParam provided
    if (beforeParam) {
      const beforeTimestamp = Timestamp.fromMillis(parseInt(beforeParam, 10));
      query = query.where("timestamp", "<", beforeTimestamp);
    }

    const snapshot = await query.get();

    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      messages,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations/[conversationId]/messages
 * Add a new message to conversation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await request.json();
    const { userId, role, content, attachments, expenseData, metadata } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    if (!role || !content) {
      return NextResponse.json(
        { error: "Role and content are required" },
        { status: 400 }
      );
    }

    // Verify conversation belongs to user
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

    const now = Timestamp.now();

    // Create message
    const messageRef = conversationRef.collection("messages").doc();
    const messageData: Record<string, unknown> = {
      conversationId,
      role,
      content,
      timestamp: now,
      status: "sent",
    };

    if (attachments) {
      messageData.attachments = attachments;
    }

    if (expenseData) {
      messageData.expenseData = expenseData;
    }

    if (metadata) {
      messageData.metadata = metadata;
    }

    await messageRef.set(messageData);

    // Update conversation metadata
    const updates: Record<string, unknown> = {
      updatedAt: now,
      lastMessagePreview: content.substring(0, 100),
      messageCount: (conversationData?.messageCount || 0) + 1,
    };

    // Increment expense count if this message created an expense
    if (expenseData?.confirmed) {
      updates.totalExpensesCreated = (conversationData?.totalExpensesCreated || 0) + 1;
    }

    await conversationRef.update(updates);

    return NextResponse.json({
      success: true,
      messageId: messageRef.id,
    });
  } catch (error) {
    console.error("Error adding message:", error);
    return NextResponse.json(
      { error: "Failed to add message" },
      { status: 500 }
    );
  }
}

