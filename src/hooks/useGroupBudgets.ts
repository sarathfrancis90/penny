"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  QueryConstraint,
} from "firebase/firestore";
import { GroupBudget } from "@/lib/types";

/**
 * Hook to fetch group budgets
 * @param groupId - The group's ID
 * @param category - Optional category filter
 * @param month - Optional month filter
 * @param year - Optional year filter
 */
export function useGroupBudgets(
  groupId: string | undefined,
  category?: string,
  month?: number,
  year?: number
) {
  const [budgets, setBudgets] = useState<GroupBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build query
      const constraints: QueryConstraint[] = [
        where("groupId", "==", groupId),
      ];

      if (category) {
        constraints.push(where("category", "==", category));
      }

      if (month !== undefined && year !== undefined) {
        constraints.push(where("period.month", "==", month));
        constraints.push(where("period.year", "==", year));
      }

      const q = query(collection(db, "budgets_group"), ...constraints);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const budgetsData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as GroupBudget[];

          setBudgets(budgetsData);
          setLoading(false);
        },
        (err) => {
          // Suppress permission-denied errors (group might be deleted)
          if (err.code === "permission-denied") {
            console.warn("Permission denied for group budgets:", groupId);
            setBudgets([]);
            setLoading(false);
            return;
          }

          console.error("Error fetching group budgets:", err);
          setError(err.message);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Error setting up group budgets listener:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, [groupId, category, month, year]);

  return { budgets, loading, error };
}

