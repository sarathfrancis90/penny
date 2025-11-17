"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Hook to manage user's default group
 * @param userId - The user's ID
 */
export function useDefaultGroup(userId: string | undefined) {
  const [defaultGroupId, setDefaultGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for default group
  useEffect(() => {
    if (!userId) {
      setDefaultGroupId(null);
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, "users", userId);

    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const groupId = userData?.preferences?.defaultGroupId || null;
          setDefaultGroupId(groupId);
        } else {
          setDefaultGroupId(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error listening to default group:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Set default group
  const setDefault = useCallback(
    async (groupId: string | null): Promise<boolean> => {
      if (!userId) {
        setError("User ID is required");
        return false;
      }

      try {
        const response = await fetch("/api/user/default-group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, groupId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to set default group");
        }

        return true;
      } catch (err) {
        console.error("Error setting default group:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [userId]
  );

  // Remove default group
  const removeDefault = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      setError("User ID is required");
      return false;
    }

    try {
      const response = await fetch(
        `/api/user/default-group?userId=${userId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove default group");
      }

      return true;
    } catch (err) {
      console.error("Error removing default group:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  }, [userId]);

  return {
    defaultGroupId,
    loading,
    error,
    setDefault,
    removeDefault,
  };
}

