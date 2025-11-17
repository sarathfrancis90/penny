"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";

interface ExpenseData {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
  groupId?: string | null;
  groupName?: string | null;
}

interface OfflineSyncResult {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  queueExpenseAnalysis: (
    userId: string,
    text?: string,
    imageBase64?: string
  ) => Promise<number>;
  queueExpenseSave: (
    userId: string,
    expenseData: {
      vendor: string;
      amount: number;
      date: string;
      category: string;
      description?: string;
      groupId?: string | null;
    }
  ) => Promise<number>;
  analyzeExpense: (
    text?: string,
    imageBase64?: string
  ) => Promise<{ success: boolean; data?: ExpenseData | ExpenseData[]; error?: string; multiExpense?: boolean }>;
  saveExpense: (expenseData: {
    vendor: string;
    amount: number;
    date: string;
    category: string;
    description?: string;
    userId: string;
    groupId?: string | null;
    receiptUrl?: string;
    receiptPath?: string;
  }) => Promise<{ success: boolean; id?: string; error?: string }>;
}

export function useOfflineSync(userId: string | undefined): OfflineSyncResult {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);

  // Get pending requests count in real-time
  const pendingAnalysisRequests = useLiveQuery(
    async () => {
      if (!userId) return [];
      return await db.pendingRequests
        .where("userId")
        .equals(userId)
        .and((req) => req.status === "pending")
        .toArray();
    },
    [userId],
    []
  );

  const pendingExpenseSaves = useLiveQuery(
    async () => {
      if (!userId) return [];
      return await db.offlineExpenses
        .where("userId")
        .equals(userId)
        .and((exp) => exp.status === "pending")
        .toArray();
    },
    [userId],
    []
  );

  const pendingCount =
    (pendingAnalysisRequests?.length || 0) + (pendingExpenseSaves?.length || 0);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      console.log("Network: Online");
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log("Network: Offline");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Process pending analysis requests
  const processPendingAnalysisRequests = useCallback(async () => {
    if (!userId || !isOnline || isSyncing) return;

    const pending = await db.pendingRequests
      .where("userId")
      .equals(userId)
      .and((req) => req.status === "pending")
      .toArray();

    if (pending.length === 0) return;

    setIsSyncing(true);
    console.log(`Processing ${pending.length} pending analysis requests...`);

    for (const request of pending) {
      try {
        // Mark as processing
        await db.pendingRequests.update(request.id!, {
          status: "processing",
        });

        // Call the API
        const response = await fetch("/api/analyze-expense", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: request.text,
            imageBase64: request.imageBase64,
          }),
        });

        if (response.ok) {
          // Mark as completed
          await db.pendingRequests.update(request.id!, {
            status: "completed",
          });
          console.log(`Completed analysis request ${request.id}`);
        } else {
          throw new Error(`API returned ${response.status}`);
        }
      } catch (error) {
        console.error(`Failed to process request ${request.id}:`, error);
        await db.pendingRequests.update(request.id!, {
          status: "failed",
          retryCount: request.retryCount + 1,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    setIsSyncing(false);
  }, [userId, isOnline, isSyncing]);

  // Process pending expense saves
  const processPendingExpenseSaves = useCallback(async () => {
    if (!userId || !isOnline || isSyncing) return;

    const pending = await db.offlineExpenses
      .where("userId")
      .equals(userId)
      .and((exp) => exp.status === "pending")
      .toArray();

    if (pending.length === 0) return;

    setIsSyncing(true);
    console.log(`Processing ${pending.length} pending expense saves...`);

    for (const expense of pending) {
      try {
        // Call the API
        const response = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor: expense.vendor,
            amount: expense.amount,
            date: expense.date,
            category: expense.category,
            description: expense.description,
            userId: expense.userId,
          }),
        });

        if (response.ok) {
          // Mark as synced and remove from queue
          await db.offlineExpenses.delete(expense.id!);
          console.log(`Synced expense ${expense.id}`);
        } else {
          throw new Error(`API returned ${response.status}`);
        }
      } catch (error) {
        console.error(`Failed to sync expense ${expense.id}:`, error);
        await db.offlineExpenses.update(expense.id!, {
          status: "failed",
          retryCount: expense.retryCount + 1,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    setIsSyncing(false);
  }, [userId, isOnline, isSyncing]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && !isSyncing) {
      processPendingAnalysisRequests();
      processPendingExpenseSaves();
    }
  }, [isOnline, isSyncing, processPendingAnalysisRequests, processPendingExpenseSaves]);

  // Queue expense analysis (for offline)
  const queueExpenseAnalysis = useCallback(
    async (
      userId: string,
      text?: string,
      imageBase64?: string
    ): Promise<number> => {
      const id = await db.pendingRequests.add({
        userId,
        text,
        imageBase64,
        timestamp: Date.now(),
        status: "pending",
        retryCount: 0,
      });
      console.log(`Queued analysis request ${id} for offline sync`);
      return id;
    },
    []
  );

  // Queue expense save (for offline)
  const queueExpenseSave = useCallback(
    async (
      userId: string,
      expenseData: {
        vendor: string;
        amount: number;
        date: string;
        category: string;
        description?: string;
      }
    ): Promise<number> => {
      const id = await db.offlineExpenses.add({
        userId,
        ...expenseData,
        timestamp: Date.now(),
        status: "pending",
        retryCount: 0,
      });
      console.log(`Queued expense save ${id} for offline sync`);
      return id;
    },
    []
  );

  // Analyze expense (online or queue offline)
  const analyzeExpense = useCallback(
    async (
      text?: string,
      imageBase64?: string
    ): Promise<{ success: boolean; data?: ExpenseData | ExpenseData[]; error?: string; multiExpense?: boolean }> => {
      if (isOnline) {
        // Try online first
        try {
          const response = await fetch("/api/analyze-expense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              text, 
              imageBase64,
              userId, // Pass userId to enable group matching
            }),
          });

          if (response.ok) {
            const result = await response.json();
            return { 
              success: true, 
              data: result.data,
              multiExpense: result.multiExpense || false,
            };
          } else {
            const error = await response.json();
            throw new Error(error.error || "Failed to analyze expense");
          }
        } catch (error) {
          console.error("Analysis failed:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      } else {
        // Queue for offline
        if (userId) {
          await queueExpenseAnalysis(userId, text, imageBase64);
        }
        return {
          success: false,
          error: "You're offline. This request will be processed when you're back online.",
        };
      }
    },
    [isOnline, userId, queueExpenseAnalysis]
  );

  // Save expense (online or queue offline)
  const saveExpense = useCallback(
    async (expenseData: {
      vendor: string;
      amount: number;
      date: string;
      category: string;
      description?: string;
      userId: string;
      groupId?: string | null;
      receiptUrl?: string;
      receiptPath?: string;
    }): Promise<{ success: boolean; id?: string; error?: string }> => {
      if (isOnline) {
        // Try online first
        try {
          const response = await fetch("/api/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(expenseData),
          });

          if (response.ok) {
            const result = await response.json();
            return { success: true, id: result.id };
          } else {
            const error = await response.json();
            throw new Error(error.error || "Failed to save expense");
          }
        } catch (error) {
          console.error("Save failed:", error);
          // Queue for offline if online save fails
          if (userId) {
            await queueExpenseSave(userId, expenseData);
            return {
              success: false,
              error:
                "Failed to save online. Queued for sync when connection is restored.",
            };
          }
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      } else {
        // Queue for offline
        if (userId) {
          await queueExpenseSave(userId, expenseData);
        }
        return {
          success: false,
          error: "You're offline. This expense will be saved when you're back online.",
        };
      }
    },
    [isOnline, userId, queueExpenseSave]
  );

  return {
    isOnline,
    pendingCount,
    isSyncing,
    queueExpenseAnalysis,
    queueExpenseSave,
    analyzeExpense,
    saveExpense,
  };
}
