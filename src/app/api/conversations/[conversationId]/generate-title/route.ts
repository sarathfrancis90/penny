import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getAuthenticatedUserId } from "@/lib/auth-middleware";
import { withObservability } from "@/lib/observability/withObservability";

let genAI: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return genAI;
}

const TITLE_PROMPT = `Generate a concise 3-5 word title for this expense-tracking conversation.
Rules:
- 3 to 5 words only
- No quotes, no punctuation, no emojis
- Title Case
- Describe the topic, not the format
Examples: "Tim Hortons Lunch Receipt", "Office Supplies Question", "Monthly Spending Review", "Vehicle Fuel Expense Log".

Conversation:
`;

const MAX_MESSAGES = 6;
const MAX_TITLE_LEN = 80;

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const tokenUserId = await getAuthenticatedUserId(request);
    const body = await request.json().catch(() => ({}));
    const userId = tokenUserId ?? body?.userId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 },
      );
    }

    const convRef = adminDb.collection("conversations").doc(conversationId);
    const convDoc = await convRef.get();
    if (!convDoc.exists) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    const convData = convDoc.data();
    if (convData?.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (convData?.metadata?.aiTitleGenerated === true) {
      // Idempotent: someone already generated. Return current title.
      return NextResponse.json({
        success: true,
        title: convData.title,
        regenerated: false,
      });
    }

    const messagesSnap = await convRef
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limit(MAX_MESSAGES)
      .get();

    const transcript = messagesSnap.docs
      .map((d) => {
        const data = d.data();
        const role = String(data.role ?? "user");
        const content = String(data.content ?? "").slice(0, 500);
        return `<${role}> ${content}`;
      })
      .join("\n");

    if (transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "Conversation has no messages yet" },
        { status: 400 },
      );
    }

    const result = await getGenAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ text: TITLE_PROMPT + transcript }],
    });

    const raw = (result.text ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 },
      );
    }

    const title = sanitizeTitle(raw);
    if (!title) {
      return NextResponse.json(
        { error: "AI returned an unusable title" },
        { status: 502 },
      );
    }

    await convRef.update({
      title,
      "metadata.aiTitleGenerated": true,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      title,
      regenerated: true,
    });
  } catch (error) {
    console.error("[generate-title] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate title",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

function sanitizeTitle(raw: string): string {
  // Take only the first non-empty line; strip wrapping quotes; collapse
  // whitespace; cap length. Defensive against models that add explanations.
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  let cleaned = firstLine.trim();
  cleaned = cleaned.replace(/^["'`*\s]+|["'`*\s]+$/g, "");
  cleaned = cleaned.replace(/\s+/g, " ");
  if (cleaned.length > MAX_TITLE_LEN) {
    cleaned = cleaned.slice(0, MAX_TITLE_LEN).trimEnd();
  }
  return cleaned;
}

export const POST = withObservability(
  postHandler as (req: NextRequest, ctx?: unknown) => Promise<Response>,
  { route: "/api/conversations/[conversationId]/generate-title" },
);
