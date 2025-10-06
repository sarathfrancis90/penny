"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Expense } from "@/lib/types";

export function useExpenses(userId: string | undefined) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
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

  return { expenses, loading, error };
}
