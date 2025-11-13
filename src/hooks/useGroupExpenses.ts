import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
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

    // Query expenses for this group
    const expensesQuery = query(
      collection(db, "expenses"),
      where("groupId", "==", groupId),
      where("expenseType", "==", "group"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      expensesQuery,
      (snapshot) => {
        const expensesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Expense[];

        setExpenses(expensesData);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to group expenses:", err);
        setError(err.message);
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

