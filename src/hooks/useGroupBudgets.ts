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
  const hasGroup = Boolean(groupId);
  const queryKey = `${groupId ?? ""}|${category ?? ""}|${month ?? ""}|${year ?? ""}`;
  const [budgets, setBudgets] = useState<GroupBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    if (!groupId) return;

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
        setError(null);
        setLoadedKey(queryKey);
        setLoading(false);
      },
      (err) => {
        // Silently handle permission-denied errors (user not authorized for this group's budgets)
        if (err.code === "permission-denied") {
          setBudgets([]);
          setError(null);
          setLoadedKey(queryKey);
          setLoading(false);
          return;
        }

        // Only log non-permission errors
        console.error("Error fetching group budgets:", err);
        setError(err.message);
        setLoadedKey(queryKey);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, category, month, year, queryKey]);

  return {
    budgets: hasGroup && loadedKey === queryKey ? budgets : [],
    loading: hasGroup ? loadedKey !== queryKey || loading : false,
    error: hasGroup ? error : null,
  };
}
