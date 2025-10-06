import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { expenseCategories } from "@/lib/categories";

// Initialize the Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// System prompt with detailed instructions for expense analysis
const getSystemPrompt = () => {
  const categoriesList = expenseCategories.join(", ");
  
  return `You are Penny, an AI expense tracking assistant for a self-incorporated software professional in Canada. Your job is to analyze expense information and extract structured data for tax purposes.

INSTRUCTIONS:
1. Analyze the provided text description and/or receipt image
2. Extract the following information:
   - vendor: The business/merchant name
   - amount: The total amount in CAD (number only, no currency symbol)
   - date: The transaction date in YYYY-MM-DD format (use today's date if not specified)
   - category: Choose the MOST appropriate category from the list below
   - description: A brief description of the expense (optional)
   - confidence: Your confidence level in the extracted data (0-1)

3. AVAILABLE CATEGORIES (choose ONE that best fits):
${categoriesList}

4. RULES:
   - For meals and entertainment, use categories with "(50%)" suffix as they have special tax treatment
   - Be conservative with categorization - choose the most specific category that applies
   - If the image is unclear or data is missing, make reasonable assumptions based on context
   - Always provide a vendor name, even if it's "Unknown Vendor"
   - Amounts should be numbers only (e.g., 85.50 not $85.50)
   - If you see multiple amounts, use the TOTAL amount

5. RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object, no other text before or after. Use this exact structure:
{"vendor":"string","amount":number,"date":"YYYY-MM-DD","category":"string","description":"string","confidence":number}

IMPORTANT: Do not include markdown code blocks, explanations, or any text outside the JSON object. Respond with minified JSON only.`;
};

interface AnalyzeExpenseRequest {
  text?: string;
  imageBase64?: string;
}

interface AnalyzeExpenseResponse {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: AnalyzeExpenseRequest = await request.json();
    const { text, imageBase64 } = body;

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

    // Determine which model to use
    const modelName = imageBase64 ? "gemini-1.5-flash" : "gemini-1.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    // Prepare the content parts
    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

    // Add system prompt
    parts.push({ text: getSystemPrompt() });

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

    // Generate content with Gemini
    const result = await model.generateContent(parts);
    const response = result.response;
    const responseText = response.text();

    console.log("Gemini response:", responseText);

    // Parse the JSON response
    let expenseData: AnalyzeExpenseResponse;
    
    try {
      // Try to extract JSON from the response
      // Sometimes the model includes extra text despite instructions
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("No JSON object found in response");
      }

      expenseData = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!expenseData.vendor || !expenseData.amount || !expenseData.category) {
        throw new Error("Missing required fields in response");
      }

      // Validate category is in our list
      const categoryList = expenseCategories as readonly string[];
      if (!categoryList.includes(expenseData.category)) {
        console.warn(`Invalid category: ${expenseData.category}, defaulting to "Other Business Expenses"`);
        expenseData.category = "Other Business Expenses";
      }

      // Ensure amount is a valid number
      if (typeof expenseData.amount === "string") {
        expenseData.amount = parseFloat(expenseData.amount);
      }

      // Validate date format (YYYY-MM-DD)
      if (expenseData.date && !/^\d{4}-\d{2}-\d{2}$/.test(expenseData.date)) {
        console.warn(`Invalid date format: ${expenseData.date}, using today's date`);
        expenseData.date = new Date().toISOString().split("T")[0];
      }

      // Default date to today if not provided
      if (!expenseData.date) {
        expenseData.date = new Date().toISOString().split("T")[0];
      }

    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw response:", responseText);
      
      return NextResponse.json(
        {
          error: "Failed to parse expense data from AI response",
          details: parseError instanceof Error ? parseError.message : "Unknown error",
          rawResponse: responseText.substring(0, 500), // Include partial response for debugging
        },
        { status: 500 }
      );
    }

    // Return the extracted expense data
    return NextResponse.json({
      success: true,
      data: expenseData,
    });

  } catch (error) {
    console.error("Error in analyze-expense API:", error);
    
    return NextResponse.json(
      {
        error: "Failed to analyze expense",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405 }
  );
}
