"use client";

import { useMemo } from "react";
import { useExpenses } from "./useExpenses";
import { useAuth } from "./useAuth";

interface GroupStats {
  [groupId: string]: {
    expenseCount: number;
    totalAmount: number;
  };
}

/**
 * Hook to calculate real-time stats for all groups
 * Uses the user's expenses to compute accurate counts and totals
 */
export function useGroupStats(): GroupStats {
  const { user } = useAuth();
  const { expenses } = useExpenses(user?.uid);

  const groupStats = useMemo(() => {
    const stats: GroupStats = {};

    // Filter and aggregate group expenses
    expenses.forEach((expense) => {
      if (expense.expenseType === "group" && expense.groupId) {
        if (!stats[expense.groupId]) {
          stats[expense.groupId] = {
            expenseCount: 0,
            totalAmount: 0,
          };
        }
        stats[expense.groupId].expenseCount++;
        stats[expense.groupId].totalAmount += expense.amount;
      }
    });

    return stats;
  }, [expenses]);

  return groupStats;
}

