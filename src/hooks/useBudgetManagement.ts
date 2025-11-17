"use client";

import { useState } from "react";
import { PersonalBudget, GroupBudget, BudgetPeriod } from "@/lib/types";

/**
 * Hook to manage budget CRUD operations
 * @param userId - The user's ID
 */
export function useBudgetManagement(userId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a personal budget
   */
  const createPersonalBudget = async (
    category: string,
    monthlyLimit: number,
    period: BudgetPeriod,
    settings?: {
      rollover?: boolean;
      alertThreshold?: number;
      notificationsEnabled?: boolean;
    }
  ): Promise<PersonalBudget | null> => {
    if (!userId) {
      setError("User ID is required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/budgets/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          category,
          monthlyLimit,
          period,
          settings,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create budget");
      }

      const budget = await response.json();
      return budget;
    } catch (err) {
      console.error("Error creating personal budget:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update a personal budget
   */
  const updatePersonalBudget = async (
    budgetId: string,
    updates: {
      monthlyLimit?: number;
      settings?: {
        rollover?: boolean;
        alertThreshold?: number;
        notificationsEnabled?: boolean;
      };
    }
  ): Promise<PersonalBudget | null> => {
    if (!userId) {
      setError("User ID is required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/budgets/personal/${budgetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...updates,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update budget");
      }

      const budget = await response.json();
      return budget;
    } catch (err) {
      console.error("Error updating personal budget:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Delete a personal budget
   */
  const deletePersonalBudget = async (budgetId: string): Promise<boolean> => {
    if (!userId) {
      setError("User ID is required");
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/budgets/personal/${budgetId}?userId=${userId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete budget");
      }

      return true;
    } catch (err) {
      console.error("Error deleting personal budget:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create a group budget (admin only)
   */
  const createGroupBudget = async (
    groupId: string,
    category: string,
    monthlyLimit: number,
    period: BudgetPeriod,
    settings?: {
      requireApprovalWhenOver?: boolean;
      alertMembers?: boolean;
      alertThreshold?: number;
    }
  ): Promise<GroupBudget | null> => {
    if (!userId) {
      setError("User ID is required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/budgets/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          groupId,
          category,
          monthlyLimit,
          period,
          settings,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create group budget");
      }

      const budget = await response.json();
      return budget;
    } catch (err) {
      console.error("Error creating group budget:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update a group budget (admin only)
   */
  const updateGroupBudget = async (
    budgetId: string,
    updates: {
      monthlyLimit?: number;
      settings?: {
        requireApprovalWhenOver?: boolean;
        alertMembers?: boolean;
        alertThreshold?: number;
      };
    }
  ): Promise<GroupBudget | null> => {
    if (!userId) {
      setError("User ID is required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/budgets/group/${budgetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...updates,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update group budget");
      }

      const budget = await response.json();
      return budget;
    } catch (err) {
      console.error("Error updating group budget:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Delete a group budget (admin only)
   */
  const deleteGroupBudget = async (budgetId: string): Promise<boolean> => {
    if (!userId) {
      setError("User ID is required");
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/budgets/group/${budgetId}?userId=${userId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete group budget");
      }

      return true;
    } catch (err) {
      console.error("Error deleting group budget:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    createPersonalBudget,
    updatePersonalBudget,
    deletePersonalBudget,
    createGroupBudget,
    updateGroupBudget,
    deleteGroupBudget,
  };
}

