import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * GET /api/conversations
 * List user conversations (paginated)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limitParam = searchParams.get("limit");
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // Build query
    let query = adminDb
      .collection("conversations")
      .where("userId", "==", userId)
      .orderBy("updatedAt", "desc")
      .limit(limit);

    // Filter by status if not including archived
    if (!includeArchived) {
      query = adminDb
        .collection("conversations")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .orderBy("updatedAt", "desc")
        .limit(limit);
    }

    // Note: Firestore doesn't support offset-based pagination well
    // For production, implement cursor-based pagination with startAfter

    const snapshot = await query.get();

    const conversations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      conversations,
      total: conversations.length,
      hasMore: conversations.length === limit,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations
 * Create a new conversation with first message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, firstMessage, firstMessageRole = "user" } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 401 }
      );
    }

    if (!title || !firstMessage) {
      return NextResponse.json(
        { error: "Title and first message are required" },
        { status: 400 }
      );
    }

    const now = Timestamp.now();

    // Create conversation document
    const conversationRef = adminDb.collection("conversations").doc();
    const conversationId = conversationRef.id;

    const conversationData = {
      userId,
      title: title.substring(0, 100), // Limit title length
      createdAt: now,
      updatedAt: now,
      lastMessagePreview: firstMessage.substring(0, 100),
      messageCount: 1,
      status: "active",
      totalExpensesCreated: 0,
      metadata: {
        firstMessageTimestamp: now,
        lastAccessedAt: now,
        isPinned: false,
      },
    };

    await conversationRef.set(conversationData);

    // Create first message in subcollection
    const messageRef = conversationRef.collection("messages").doc();
    const messageData = {
      conversationId,
      role: firstMessageRole,
      content: firstMessage,
      timestamp: now,
      status: "sent",
    };

    await messageRef.set(messageData);

    return NextResponse.json({
      success: true,
      conversationId,
      messageId: messageRef.id,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}

