"use client";

import { useEffect, useState } from "react";
import { BudgetUsage } from "@/lib/types";

/**
 * Hook to fetch budget usage (personal or group)
 * @param userId - The user's ID (required for auth)
 * @param type - "personal" or "group"
 * @param groupId - Required if type is "group"
 * @param month - Optional month (defaults to current)
 * @param year - Optional year (defaults to current)
 */
export function useBudgetUsage(
  userId: string | undefined,
  type: "personal" | "group",
  groupId?: string,
  month?: number,
  year?: number
) {
  const [usage, setUsage] = useState<BudgetUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setUsage([]);
      setLoading(false);
      return;
    }

    if (type === "group" && !groupId) {
      setUsage([]);
      setLoading(false);
      return;
    }

    const fetchUsage = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build URL
        const params = new URLSearchParams({ userId });
        if (month !== undefined) params.append("month", month.toString());
        if (year !== undefined) params.append("year", year.toString());

        const url =
          type === "personal"
            ? `/api/budgets/usage/personal?${params}`
            : `/api/budgets/usage/group/${groupId}?${params}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch budget usage: ${response.statusText}`);
        }

        const data = await response.json();
        setUsage(data.usage || []);
      } catch (err) {
        console.error("Error fetching budget usage:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [userId, type, groupId, month, year]);

  return { usage, loading, error };
}

