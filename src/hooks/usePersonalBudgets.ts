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
import { PersonalBudget } from "@/lib/types";

/**
 * Hook to fetch personal budgets for a user
 * @param userId - The user's ID
 * @param category - Optional category filter
 * @param month - Optional month filter
 * @param year - Optional year filter
 */
export function usePersonalBudgets(
  userId: string | undefined,
  category?: string,
  month?: number,
  year?: number
) {
  const [budgets, setBudgets] = useState<PersonalBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build query
      const constraints: QueryConstraint[] = [
        where("userId", "==", userId),
      ];

      if (category) {
        constraints.push(where("category", "==", category));
      }

      if (month !== undefined && year !== undefined) {
        constraints.push(where("period.month", "==", month));
        constraints.push(where("period.year", "==", year));
      }

      const q = query(collection(db, "budgets_personal"), ...constraints);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const budgetsData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as PersonalBudget[];

          setBudgets(budgetsData);
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching personal budgets:", err);
          setError(err.message);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Error setting up personal budgets listener:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, [userId, category, month, year]);

  return { budgets, loading, error };
}

