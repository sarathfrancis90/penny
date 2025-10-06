"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trash2, Database, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";

/**
 * DevTools component - Only visible in development mode
 * Provides utilities for testing and data management
 */
export function DevTools() {
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState("");
  const { signOut } = useAuth();
  const router = useRouter();

  // Only show in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const clearIndexedDB = async () => {
    try {
      setMessage("Clearing IndexedDB...");
      
      // Clear all tables in Dexie database
      await db.pendingRequests.clear();
      await db.offlineExpenses.clear();
      
      setMessage("✅ IndexedDB cleared successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error clearing IndexedDB:", error);
      setMessage("❌ Error clearing IndexedDB");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const clearAllLocalData = async () => {
    try {
      setMessage("Clearing all local data...");
      
      // Clear IndexedDB
      await db.pendingRequests.clear();
      await db.offlineExpenses.clear();
      
      // Clear localStorage
      localStorage.clear();
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      setMessage("✅ All local data cleared!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error clearing data:", error);
      setMessage("❌ Error clearing data");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const resetEverything = async () => {
    if (!confirm("⚠️ This will clear ALL local data and sign you out. Continue?")) {
      return;
    }

    setIsResetting(true);
    setMessage("Resetting everything...");

    try {
      // Clear all local data
      await clearAllLocalData();
      
      // Sign out
      await signOut();
      
      setMessage("✅ Reset complete! Redirecting...");
      
      // Redirect to login
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (error) {
      console.error("Error resetting:", error);
      setMessage("❌ Error during reset");
      setIsResetting(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const checkIndexedDBData = async () => {
    try {
      const pendingRequests = await db.pendingRequests.toArray();
      const offlineExpenses = await db.offlineExpenses.toArray();
      
      console.group("📊 IndexedDB Data");
      console.log("Pending Requests:", pendingRequests);
      console.log("Offline Expenses:", offlineExpenses);
      console.groupEnd();
      
      setMessage(`📊 Check console: ${pendingRequests.length} requests, ${offlineExpenses.length} expenses`);
      setTimeout(() => setMessage(""), 5000);
    } catch (error) {
      console.error("Error checking data:", error);
      setMessage("❌ Error checking data");
    }
  };

  return (
    <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <CardTitle className="text-yellow-800 dark:text-yellow-200">
            Dev Tools
          </CardTitle>
        </div>
        <CardDescription className="text-yellow-700 dark:text-yellow-300">
          Development utilities (hidden in production)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <div className="p-3 bg-white dark:bg-slate-800 rounded-md border text-sm">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkIndexedDBData}
            className="w-full"
          >
            <Database className="h-4 w-4 mr-2" />
            Check Data
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearIndexedDB}
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear IndexedDB
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearAllLocalData}
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Local Data
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={resetEverything}
            disabled={isResetting}
            className="w-full"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Reset Everything
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p><strong>Check Data:</strong> Logs IndexedDB contents to console</p>
          <p><strong>Clear IndexedDB:</strong> Removes queued requests/expenses</p>
          <p><strong>Clear Local Data:</strong> Clears IndexedDB + localStorage</p>
          <p><strong>Reset Everything:</strong> Clears all data + signs out</p>
        </div>
      </CardContent>
    </Card>
  );
}
