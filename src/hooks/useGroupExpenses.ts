import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Expense } from "@/lib/types";

export function useGroupExpenses(groupId: string | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Query expenses for this group (no orderBy to avoid composite index requirement)
    const expensesQuery = query(
      collection(db, "expenses"),
      where("groupId", "==", groupId),
      where("expenseType", "==", "group")
    );

    const unsubscribe = onSnapshot(
      expensesQuery,
      (snapshot) => {
        const expensesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Expense[];

        // Sort in memory by date descending
        expensesData.sort((a, b) => {
          return b.date.toMillis() - a.date.toMillis();
        });

        setExpenses(expensesData);
        setLoading(false);
      },
      (err) => {
        // Suppress permission errors (group was likely deleted)
        if (err.code !== 'permission-denied') {
          console.error("Error listening to group expenses:", err);
        }
        // Clear state silently when group is deleted
        setExpenses([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId]);

  return {
    expenses,
    loading,
    error,
  };
}

