import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin SDK if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.warn("Firebase Admin SDK initialization skipped:", error);
  }
}

// GET - List all users (from Firebase Auth + expense data)
export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get search params
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const maxResults = limitParam ? parseInt(limitParam) : 1000;

    // First, get ALL users from Firebase Auth
    let allAuthUsers: Array<{
      userId: string;
      email?: string;
      displayName?: string;
      photoURL?: string;
      emailVerified: boolean;
      createdAt: Date;
      lastSignInTime?: Date;
      disabled: boolean;
    }> = [];

    try {
      const auth = getAuth();
      const listUsersResult = await auth.listUsers(maxResults);
      
      allAuthUsers = listUsersResult.users.map((userRecord) => ({
        userId: userRecord.uid,
        email: userRecord.email || undefined,
        displayName: userRecord.displayName || undefined,
        photoURL: userRecord.photoURL || undefined,
        emailVerified: userRecord.emailVerified,
        createdAt: new Date(userRecord.metadata.creationTime),
        lastSignInTime: userRecord.metadata.lastSignInTime 
          ? new Date(userRecord.metadata.lastSignInTime) 
          : undefined,
        disabled: userRecord.disabled,
      }));
    } catch (error) {
      console.error("Could not fetch Firebase Auth users:", error);
      // Continue with expense-only data
    }

    // Get all expenses to aggregate expense data
    const expensesRef = collection(db, "expenses");
    const expensesSnapshot = await getDocs(expensesRef);

    // Aggregate expense data by user
    const expenseMap = new Map<string, {
      expenseCount: number;
      totalAmount: number;
      lastExpenseDate?: Date;
      firstExpenseDate?: Date;
    }>();

    expensesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.userId;

      if (!userId) return;

      const existing = expenseMap.get(userId) || {
        expenseCount: 0,
        totalAmount: 0,
        lastExpenseDate: undefined,
        firstExpenseDate: undefined,
      };

      const expenseDate = data.createdAt?.toDate() || new Date();

      expenseMap.set(userId, {
        expenseCount: existing.expenseCount + 1,
        totalAmount: existing.totalAmount + (data.amount || 0),
        lastExpenseDate: !existing.lastExpenseDate || expenseDate > existing.lastExpenseDate
          ? expenseDate
          : existing.lastExpenseDate,
        firstExpenseDate: !existing.firstExpenseDate || expenseDate < existing.firstExpenseDate
          ? expenseDate
          : existing.firstExpenseDate,
      });
    });

    // Merge Auth users with expense data
    const mergedUsers = allAuthUsers.map((authUser) => {
      const expenseData = expenseMap.get(authUser.userId) || {
        expenseCount: 0,
        totalAmount: 0,
        lastExpenseDate: undefined,
        firstExpenseDate: undefined,
      };

      return {
        ...authUser,
        ...expenseData,
        // Determine actual last activity (either last login or last expense)
        lastActivity: authUser.lastSignInTime && expenseData.lastExpenseDate
          ? (authUser.lastSignInTime > expenseData.lastExpenseDate 
              ? authUser.lastSignInTime 
              : expenseData.lastExpenseDate)
          : (authUser.lastSignInTime || expenseData.lastExpenseDate),
      };
    });

    // Also add any users that have expenses but not in Auth (edge case)
    expenseMap.forEach((expenseData, userId) => {
      if (!allAuthUsers.find(u => u.userId === userId)) {
        mergedUsers.push({
          userId,
          email: undefined,
          displayName: undefined,
          photoURL: undefined,
          emailVerified: false,
          createdAt: expenseData.firstExpenseDate || new Date(),
          lastSignInTime: undefined,
          disabled: false,
          ...expenseData,
          lastActivity: expenseData.lastExpenseDate,
        });
      }
    });

    // Sort by last activity (most recent first)
    const sortedUsers = mergedUsers
      .sort((a, b) => {
        const aTime = a.lastActivity?.getTime() || a.createdAt.getTime();
        const bTime = b.lastActivity?.getTime() || b.createdAt.getTime();
        return bTime - aTime;
      });

    return NextResponse.json({
      success: true,
      users: sortedUsers,
      totalUsers: mergedUsers.length,
      registeredUsers: allAuthUsers.length,
      usersWithExpenses: expenseMap.size,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

