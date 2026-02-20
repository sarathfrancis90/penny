import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { expenseCategories } from "@/lib/categories";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { findMatchingGroup } from "@/lib/groupMatching";

// Lazy-initialize the Gemini AI client (v1.42+ throws if apiKey is empty at construction)
let genAI: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return genAI;
}

// System prompt with detailed instructions for expense analysis
const getSystemPrompt = (userGroups?: { id: string; name: string; icon: string }[]) => {
  const categoriesList = expenseCategories.join(", ");
  const todayDate = new Date().toISOString().split("T")[0];
  const groupsList = userGroups?.map(g => `${g.icon} ${g.name}`).join(", ") || "No groups available";
  
  return `You are Penny, an AI expense tracking assistant for a self-incorporated software professional in Canada. Your job is to analyze expense information and extract structured data for tax purposes.

CURRENT DATE: ${todayDate}

USER'S GROUPS: ${groupsList}

INSTRUCTIONS:
1. Analyze the provided text description and/or receipt image
2. Extract ALL the following information:
   - vendor: The business/merchant name
   - amount: The total amount in CAD (number only, no currency symbol)
   - date: The transaction date in YYYY-MM-DD format
   - category: Choose the MOST appropriate category from the list below
   - description: A brief description of the expense (optional)
   - groupName: The group name if mentioned (e.g., "family group", "business group", "travel group")
   - confidence: Your confidence level in the extracted data (0-1)

3. AVAILABLE CATEGORIES (choose ONE that best fits):
${categoriesList}

4. DATE PARSING RULES:
   - "today" or no date mentioned → ${todayDate}
   - "yesterday" → subtract 1 day from ${todayDate}
   - "last week" → subtract 7 days from ${todayDate}
   - "Monday", "Tuesday", etc. → most recent occurrence of that day
   - Specific dates like "Nov 15" or "November 15th" → parse to YYYY-MM-DD
   - Relative dates like "3 days ago" → calculate from ${todayDate}

5. GROUP DETECTION RULES:
   - Look for phrases like "in family group", "for the business", "travel expenses", "office group"
   - Extract the group name mentioned (e.g., "family", "business", "travel")
   - If multiple groups match, choose the most relevant one
   - If no group is mentioned, set groupName to null
   - Match against user's groups: ${groupsList}

6. MULTI-EXPENSE SUPPORT:
   - If user mentions MULTIPLE expenses in one message, extract ALL of them
   - Return an array of expense objects
   - Example: "I spent $50 at Walmart and $30 at Target" → return 2 expenses

7. RESPONSE FORMAT:
For SINGLE expense:
{"vendor":"string","amount":number,"date":"YYYY-MM-DD","category":"string","description":"string","groupName":"string|null","confidence":number}

For MULTIPLE expenses:
{"expenses":[{"vendor":"string","amount":number,"date":"YYYY-MM-DD","category":"string","description":"string","groupName":"string|null","confidence":number},...]}

IMPORTANT: 
- Do not include markdown code blocks or explanations
- Respond with minified JSON only
- If multiple expenses detected, use the "expenses" array format
- Always extract groupName if mentioned`;
};

interface AnalyzeExpenseRequest {
  text?: string;
  imageBase64?: string;
  userId?: string; // For fetching user's groups
}

interface AnalyzeExpenseResponse {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  groupName?: string | null;
  confidence?: number;
}


export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;
  
  try {
    // Parse request body
    const body: AnalyzeExpenseRequest = await request.json();
    const { text, imageBase64, userId: bodyUserId } = body;
    
    // Extract userId from request headers or body
    userId = bodyUserId || request.headers.get("x-user-id") || undefined;

    // Validate input
    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: "Either text or image must be provided" },
        { status: 400 }
      );
    }

    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return NextResponse.json(
        { error: "AI service is not configured" },
        { status: 500 }
      );
    }

    // Fetch user's groups if userId is provided
    let userGroups: { id: string; name: string; icon: string }[] = [];
    if (userId) {
      try {
        const membershipSnapshot = await adminDb
          .collection("groupMembers")
          .where("userId", "==", userId)
          .where("status", "==", "active")
          .get();

        const groupIds = membershipSnapshot.docs.map(doc => doc.data().groupId);
        
        if (groupIds.length > 0) {
          const groupsSnapshot = await adminDb
            .collection("groups")
            .where("__name__", "in", groupIds.slice(0, 10)) // Firestore 'in' limit is 10
            .get();

          userGroups = groupsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || "",
            icon: doc.data().icon || "👥",
          }));
        }
      } catch (error) {
        console.warn("Failed to fetch user groups, continuing without them:", error);
      }
    }

    // Prepare the content parts
    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

    // Add system prompt with user's groups
    parts.push({ text: getSystemPrompt(userGroups) });

    // Add user text if provided
    if (text) {
      parts.push({ text: `\n\nUser input: ${text}` });
    }

    // Add image if provided
    if (imageBase64) {
      // Remove data URL prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg", // Assume JPEG, could be enhanced to detect type
        },
      });
      
      parts.push({ text: "\n\nAnalyze this receipt image and extract the expense information." });
    }

    // Generate content with Gemini using the new SDK
    const result = await getGenAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: parts,
    });
    
    const responseText = result.text;

    if (!responseText) {
      return NextResponse.json(
        { error: "No response from AI model" },
        { status: 500 }
      );
    }

    console.log("Gemini response:", responseText);

    // Parse the JSON response
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("No JSON object found in response");
      }

      const parsedResponse = JSON.parse(jsonMatch[0]);

      // Helper function to validate and process a single expense
      const processExpense = (expense: AnalyzeExpenseResponse) => {
        // Validate required fields
        if (!expense.vendor || !expense.amount || !expense.category) {
          throw new Error("Missing required fields in expense");
        }

        // Validate category
        const categoryList = expenseCategories as readonly string[];
        if (!categoryList.includes(expense.category)) {
          console.warn(`Invalid category: ${expense.category}, defaulting to "Other Business Expenses"`);
          expense.category = "Other Business Expenses";
        }

        // Ensure amount is a valid number
        if (typeof expense.amount === "string") {
          expense.amount = parseFloat(expense.amount);
        }

        // Validate date format (YYYY-MM-DD)
        if (expense.date && !/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) {
          console.warn(`Invalid date format: ${expense.date}, using today's date`);
          expense.date = new Date().toISOString().split("T")[0];
        }

        // Default date to today if not provided
        if (!expense.date) {
          expense.date = new Date().toISOString().split("T")[0];
        }

        // Match group name to group ID
        const groupId = findMatchingGroup(expense.groupName, userGroups);
        
        return {
          ...expense,
          groupId, // Add matched groupId
          groupName: expense.groupName || null,
        };
      };

      // Check if it's a multi-expense response
      const isMultiExpense = 'expenses' in parsedResponse && Array.isArray(parsedResponse.expenses);

      if (isMultiExpense) {
        // Handle multiple expenses
        const expenses = parsedResponse.expenses.map(processExpense);

        // Track analytics
        const duration = Date.now() - startTime;
        trackAnalytics({
          userId,
          requestType: imageBase64 ? "image" : "text",
          success: true,
          duration,
          inputLength: text?.length || 0,
          hasImage: !!imageBase64,
        }).catch(err => console.error("Analytics tracking failed:", err));

        console.log(`AI analyzed ${expenses.length} expenses in ${duration}ms`);

        return NextResponse.json({
          success: true,
          multiExpense: true,
          data: expenses,
        });

      } else {
        // Handle single expense
        const expenseData = processExpense(parsedResponse);

        // Track analytics
        const duration = Date.now() - startTime;
        trackAnalytics({
          userId,
          requestType: imageBase64 ? "image" : "text",
          success: true,
          duration,
          inputLength: text?.length || 0,
          hasImage: !!imageBase64,
        }).catch(err => console.error("Analytics tracking failed:", err));

        console.log(`AI analyzed expense in ${duration}ms`);

        return NextResponse.json({
          success: true,
          data: expenseData,
        });
      }

    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw response:", responseText);
      
      return NextResponse.json(
        {
          error: "Failed to parse expense data from AI response",
          details: parseError instanceof Error ? parseError.message : "Unknown error",
          rawResponse: responseText.substring(0, 500),
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Error in analyze-expense API:", error);
    
    // Track failed request
    const duration = Date.now() - startTime;
    trackAnalytics({
      userId,
      requestType: "unknown",
      success: false,
      duration,
      error: error instanceof Error ? error.message : "Unknown error",
    }).catch(err => console.error("Analytics tracking failed:", err));
    
    return NextResponse.json(
      {
        error: "Failed to analyze expense",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Analytics tracking function
async function trackAnalytics(data: {
  userId?: string;
  requestType: string;
  success: boolean;
  duration: number;
  inputLength?: number;
  hasImage?: boolean;
  error?: string;
}) {
  try {
    // Estimate tokens (rough approximation)
    const estimatedTokens = data.inputLength ? Math.ceil(data.inputLength / 4) + 500 : 500;
    
    // Estimate cost (Gemini 2.0 Flash pricing: ~$0.075 per 1M input tokens, $0.30 per 1M output tokens)
    // Rough estimate: 500 input tokens + 200 output tokens per request
    const estimatedCost = (estimatedTokens * 0.075 + 200 * 0.30) / 1000000;

    // Save analytics using Admin SDK (bypasses security rules)
    await adminDb.collection("analytics").add({
      timestamp: Timestamp.now(),
      userId: data.userId || "anonymous",
      requestType: data.requestType,
      success: data.success,
      duration: data.duration,
      estimatedTokens,
      estimatedCost,
      hasImage: data.hasImage || false,
      error: data.error || null,
    });
  } catch (error) {
    // Don't throw - analytics failure shouldn't break the main flow
    console.error("Failed to track analytics:", error);
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405 }
  );
}
