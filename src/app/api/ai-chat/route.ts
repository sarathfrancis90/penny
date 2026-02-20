import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Lazy-initialize the Gemini AI client (v1.42+ throws if apiKey is empty at construction)
let genAI: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return genAI;
}

/**
 * POST /api/ai-chat
 * Handle conversational AI requests with function calling support
 */
export async function POST(request: NextRequest) {
  try {
    const { message, userId, conversationHistory = [] } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    // System prompt for the AI agent
    const systemPrompt = `You are Penny, an AI expense tracking assistant for a self-incorporated software professional in Canada. 

Your capabilities:
1. Answer questions about expenses, budgets, and spending patterns
2. Provide insights and analytics on financial data
3. Help with tax-related expense queries
4. Compare spending across different periods
5. Search and filter expenses

When answering:
- Be conversational and friendly, but concise
- Use the available functions to fetch real data
- Format currency in CAD with $ symbol
- **Use markdown formatting** for rich responses:
  • Use **bold** for important numbers and categories
  • Use bullet points (•) for lists
  • Use emojis for visual appeal (📊 📈 💰 ⚠️ ✅ 🎯)
  • Use line breaks for better readability
  • Create simple tables when comparing data
- Highlight key insights with emojis
- Use status indicators:
  • ✅ Good/Safe (under 75% of budget)
  • ⚠️ Warning (75-90% of budget)
  • 🚨 Critical (90-100% of budget)
  • ❌ Over budget (>100%)
- When showing expenses, format as: "**VendorName** - $amount (category)"
- Always include actionable insights or suggestions
- If data shows concerning trends, mention it
- Keep responses focused and scannable

Available functions: budget status, expense summaries, category breakdowns, group expenses, search, recent expenses, period comparisons.

Current date: ${new Date().toISOString().split("T")[0]}

**Example response formats:**

Budget query:
"📊 **Your Budget Status for November**

• **Food & Dining**: $247/$300 (82%) ⚠️
• **Transportation**: $120/$200 (60%) ✅
• **Entertainment**: $85/$100 (85%) ⚠️

**Total**: $452/$600 (75%)

💡 You're on track! Watch your dining expenses - you're at 82% with 10 days left."

Expense list:
"📝 **Your Recent Expenses**

• **Whole Foods** - $45.67 (Food & Dining)
• **Shell Gas Station** - $52.00 (Transportation)
• **Netflix** - $16.99 (Entertainment)
• **Starbucks** - $5.50 (Food & Dining)

**Total**: $120.16 across 4 expenses"

Comparison:
"📈 **This Month vs Last Month**

**November 2024**: $1,245
**October 2024**: $1,089
**Difference**: +$156 (+14%)

📊 **Category Changes:**
• Food & Dining: +$78 (+23%)
• Transportation: -$12 (-8%)
• Shopping: +$90 (+45%)

⚠️ Your shopping expenses are up significantly this month."`;

    // Build conversation history
    const contents: Array<{ text: string; role: "user" | "assistant" }> = [
      { text: systemPrompt, role: "user" },
      ...conversationHistory.map((msg: { role: string; content: string }) => ({
        text: msg.content,
        role: msg.role === "user" ? "user" : "assistant",
      })),
      { text: message, role: "user" },
    ];

    console.log("🤖 [AI Chat] Starting conversation with Gemini...");

    // TODO: Implement function calling when SDK supports it properly
    // For now, AI will guide users to use the dashboard for detailed analytics
    
    // Call Gemini for conversational response
    const result = await getGenAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents.map((c) => ({ text: c.text })),
    });

    const responseText = result.text;

    if (!responseText) {
      throw new Error("No response from AI");
    }

    // Return the AI's text response
    return NextResponse.json({
      success: true,
      message: responseText,
    });
    
    /* TODO: Implement function calling when Gemini SDK properly supports it
     * The function implementations are ready in src/lib/ai-functions/
     * Function declarations are defined in src/lib/gemini-functions.ts
     * Once SDK supports tools parameter, uncomment and integrate.
     */
  } catch (error) {
    console.error("❌ [AI Chat] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

