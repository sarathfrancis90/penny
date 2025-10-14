"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Expense } from "@/lib/types";

export function useExpenses(userId: string | undefined) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete expense
  const deleteExpense = async (expenseId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`/api/expenses/${expenseId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        return { success: true };
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete expense");
      }
    } catch (err) {
      console.error("Error deleting expense:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  };

  // Update expense
  const updateExpense = async (
    expenseId: string,
    updates: {
      vendor?: string;
      amount?: number;
      date?: string;
      category?: string;
      description?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`/api/expenses/${expenseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        return { success: true };
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to update expense");
      }
    } catch (err) {
      console.error("Error updating expense:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  };

  // Delete all expenses for a user
  const deleteAllExpenses = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!userId) {
        return { success: false, error: "User not authenticated" };
      }

      // Delete all expenses one by one (batch delete would need additional API)
      const deletePromises = expenses.map((expense) => deleteExpense(expense.id!));
      const results = await Promise.all(deletePromises);
      
      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        return {
          success: false,
          error: `Failed to delete ${failures.length} expense(s)`,
        };
      }

      return { success: true };
    } catch (err) {
      console.error("Error deleting all expenses:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create query for user's expenses
      // Note: We order in memory to avoid requiring a composite index
      const expensesQuery = query(
        collection(db, "expenses"),
        where("userId", "==", userId)
      );

      // Set up real-time listener
      const unsubscribe = onSnapshot(
        expensesQuery,
        (snapshot: QuerySnapshot<DocumentData>) => {
          const expensesData: Expense[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
            } as Expense;
          });

          // Sort by date in memory (descending - newest first)
          expensesData.sort((a, b) => {
            // Handle Firestore Timestamp objects
            const dateA = a.date?.toMillis ? a.date.toMillis() : 0;
            const dateB = b.date?.toMillis ? b.date.toMillis() : 0;
            return dateB - dateA;
          });

          setExpenses(expensesData);
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching expenses:", err);
          setError(err.message || "Failed to fetch expenses");
          setLoading(false);
        }
      );

      // Cleanup listener on unmount
      return () => unsubscribe();
    } catch (err) {
      console.error("Error setting up expenses listener:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch expenses");
      setLoading(false);
    }
  }, [userId]);

  return {
    expenses,
    loading,
    error,
    deleteExpense,
    updateExpense,
    deleteAllExpenses,
  };
}
