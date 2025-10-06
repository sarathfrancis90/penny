import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface CreateExpenseRequest {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  userId: string;
  receiptUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: CreateExpenseRequest = await request.json();
    const { vendor, amount, date, category, description, userId, receiptUrl } =
      body;

    // Validate required fields
    if (!vendor || !amount || !date || !category || !userId) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "vendor, amount, date, category, and userId are required",
        },
        { status: 400 }
      );
    }

    // Validate amount is a positive number
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount. Must be a positive number" },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Convert date string to Timestamp
    const expenseDate = Timestamp.fromDate(new Date(date));
    const now = Timestamp.now();

    // Create expense document
    const expenseData = {
      vendor,
      amount,
      category,
      date: expenseDate,
      description: description || "",
      userId,
      receiptUrl: receiptUrl || null,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
    };

    // Save to Firestore
    const docRef = await addDoc(collection(db, "expenses"), expenseData);

    // Return success with the document ID
    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: "Expense saved successfully",
    });
  } catch (error) {
    console.error("Error saving expense:", error);

    // Check for Firebase-specific errors
    if (error instanceof Error) {
      if (error.message.includes("permission-denied")) {
        return NextResponse.json(
          {
            error: "Permission denied",
            details: "You don't have permission to save expenses",
          },
          { status: 403 }
        );
      }

      if (error.message.includes("not-found")) {
        return NextResponse.json(
          {
            error: "Database not found",
            details: "Firestore database is not properly configured",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to save expense",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve expenses (for future use)
export async function GET(request: NextRequest) {
  try {
    // Extract userId from query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId query parameter is required" },
        { status: 400 }
      );
    }

    // TODO: Implement expense retrieval in a future prompt
    return NextResponse.json({
      message: "Expense retrieval will be implemented in the dashboard prompt",
      expenses: [],
    });
  } catch (error) {
    console.error("Error retrieving expenses:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve expenses",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
