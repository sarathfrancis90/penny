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
import { useGroups } from "./useGroups";
import { useMemo } from "react";
import { authFetch } from "@/lib/authFetch";

export function useExpenses(userId: string | undefined) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { groups } = useGroups(); // Get user's groups
  const userGroupIds = useMemo(() => groups.map(g => g.id), [groups]);

  // Delete expense
  const deleteExpense = async (expenseId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await authFetch(`/api/expenses/${expenseId}`, {
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
      const response = await authFetch(`/api/expenses/${expenseId}`, {
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
      const allExpenses = new Map<string, Expense>();
      let personalLoaded = false;
      let groupsLoaded = false;

      const checkAllLoaded = () => {
        if (personalLoaded && groupsLoaded) {
          // Combine and sort all expenses
          const combinedExpenses = Array.from(allExpenses.values());
          combinedExpenses.sort((a, b) => {
            const dateA = a.date?.toMillis ? a.date.toMillis() : 0;
            const dateB = b.date?.toMillis ? b.date.toMillis() : 0;
            return dateB - dateA;
          });
          setExpenses(combinedExpenses);
          setLoading(false);
        }
      };

      // Query 1: Personal expenses (userId == currentUser)
      const personalQuery = query(
        collection(db, "expenses"),
        where("userId", "==", userId)
      );

      const unsubscribePersonal = onSnapshot(
        personalQuery,
        (snapshot: QuerySnapshot<DocumentData>) => {
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            allExpenses.set(doc.id, {
              id: doc.id,
              ...data,
            } as Expense);
          });

          // Remove deleted docs
          const currentIds = new Set(snapshot.docs.map(d => d.id));
          Array.from(allExpenses.keys()).forEach(id => {
            const expense = allExpenses.get(id);
            if (expense?.userId === userId && !currentIds.has(id)) {
              allExpenses.delete(id);
            }
          });

          personalLoaded = true;
          checkAllLoaded();
        },
        (err) => {
          console.error("Error fetching personal expenses:", err);
          setError(err.message || "Failed to fetch expenses");
          setLoading(false);
        }
      );

      // Query 2: Group expenses, one listener per group the user belongs to.
      // Security rules only allow a query that filters by a group the user
      // is an active member of, so each group is queried by its own id.
      const groupUnsubscribers: Array<() => void> = [];
      const loadedGroupIds = new Set<string>();
      const markGroupLoaded = (groupId: string) => {
        loadedGroupIds.add(groupId);
        if (loadedGroupIds.size >= userGroupIds.length) {
          groupsLoaded = true;
          checkAllLoaded();
        }
      };

      if (userGroupIds.length > 0) {
        userGroupIds.forEach((groupId) => {
          const groupQuery = query(
            collection(db, "expenses"),
            where("groupId", "==", groupId),
            where("expenseType", "==", "group")
          );

          groupUnsubscribers.push(
            onSnapshot(
              groupQuery,
              (snapshot: QuerySnapshot<DocumentData>) => {
                snapshot.docs.forEach((doc) => {
                  allExpenses.set(doc.id, {
                    id: doc.id,
                    ...doc.data(),
                  } as Expense);
                });

                // Remove this group's expenses that are no longer returned
                const currentIds = new Set(snapshot.docs.map((d) => d.id));
                Array.from(allExpenses.keys()).forEach((id) => {
                  const expense = allExpenses.get(id);
                  if (
                    expense?.expenseType === "group" &&
                    expense.groupId === groupId &&
                    !currentIds.has(id)
                  ) {
                    allExpenses.delete(id);
                  }
                });

                markGroupLoaded(groupId);
              },
              (err) => {
                console.error("Error fetching group expenses:", err);
                // Don't fail completely, just log the error
                markGroupLoaded(groupId);
              }
            )
          );
        });
      } else {
        groupsLoaded = true;
        checkAllLoaded();
      }

      // Cleanup listeners on unmount
      return () => {
        unsubscribePersonal();
        groupUnsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    } catch (err) {
      console.error("Error setting up expenses listener:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch expenses");
      setLoading(false);
    }
  }, [userId, userGroupIds]);

  return {
    expenses,
    loading,
    error,
    deleteExpense,
    updateExpense,
    deleteAllExpenses,
  };
}
