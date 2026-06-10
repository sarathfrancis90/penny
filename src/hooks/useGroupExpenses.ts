import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Expense } from "@/lib/types";

export function useGroupExpenses(groupId: string | null) {
  const hasGroup = Boolean(groupId);
  const queryKey = groupId ?? "";
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    if (!groupId) return;

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
        setError(null);
        setLoadedKey(queryKey);
        setLoading(false);
      },
      (err) => {
        // Suppress permission errors (group was likely deleted)
        if (err.code !== 'permission-denied') {
          console.error("Error listening to group expenses:", err);
        }
        // Clear state silently when group is deleted
        setExpenses([]);
        setLoadedKey(queryKey);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, queryKey]);

  return {
    expenses: hasGroup && loadedKey === queryKey ? expenses : [],
    loading: hasGroup ? loadedKey !== queryKey || loading : false,
    error: hasGroup ? error : null,
  };
}
