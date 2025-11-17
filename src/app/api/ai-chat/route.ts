import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_FUNCTIONS, GeminiFunctionName } from "@/lib/gemini-functions";
import {
  getBudgetStatus,
  getExpenseSummary,
  getCategoryBreakdown,
  getGroupExpenses,
  searchExpenses,
  getRecentExpenses,
  comparePeriods,
} from "@/lib/ai-functions";

// Initialize Gemini AI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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

    // Call Gemini with function declarations
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: contents.map((c) => ({ text: c.text })),
      tools: [{ functionDeclarations: GEMINI_FUNCTIONS as any }],
    });

    const response = result.candidates?.[0]?.content;

    if (!response) {
      throw new Error("No response from AI");
    }

    // Check if AI wants to call a function
    const functionCall = response.functionCall;

    if (functionCall) {
      console.log(`🔧 [AI Chat] Function call: ${functionCall.name}`, functionCall.args);

      // Execute the function
      let functionResult;

      switch (functionCall.name as GeminiFunctionName) {
        case GeminiFunctionName.GET_BUDGET_STATUS:
          functionResult = await getBudgetStatus(userId, functionCall.args);
          break;

        case GeminiFunctionName.GET_EXPENSE_SUMMARY:
          functionResult = await getExpenseSummary(userId, functionCall.args);
          break;

        case GeminiFunctionName.GET_CATEGORY_BREAKDOWN:
          functionResult = await getCategoryBreakdown(userId, functionCall.args);
          break;

        case GeminiFunctionName.GET_GROUP_EXPENSES:
          functionResult = await getGroupExpenses(userId, functionCall.args);
          break;

        case GeminiFunctionName.SEARCH_EXPENSES:
          functionResult = await searchExpenses(userId, functionCall.args);
          break;

        case GeminiFunctionName.GET_RECENT_EXPENSES:
          functionResult = await getRecentExpenses(userId, functionCall.args);
          break;

        case GeminiFunctionName.COMPARE_PERIODS:
          functionResult = await comparePeriods(userId, functionCall.args);
          break;

        default:
          throw new Error(`Unknown function: ${functionCall.name}`);
      }

      console.log("✅ [AI Chat] Function result:", functionResult);

      // Send function result back to AI for natural language response
      const followUpResult = await genAI.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [
          ...contents.map((c) => ({ text: c.text })),
          {
            text: `Function ${functionCall.name} returned:\n${JSON.stringify(
              functionResult,
              null,
              2
            )}\n\nPlease provide a natural language response to the user based on this data. Format numbers nicely, highlight key insights, and be conversational.`,
          },
        ],
      });

      const finalResponse = followUpResult.text || "I retrieved the data, but couldn't format a response.";

      return NextResponse.json({
        success: true,
        message: finalResponse,
        functionCalled: functionCall.name,
        functionResult,
      });
    } else {
      // No function call, just return the AI's text response
      const textResponse = response.text || "I'm not sure how to help with that.";

      return NextResponse.json({
        success: true,
        message: textResponse,
      });
    }
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

