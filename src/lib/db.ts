import Dexie, { Table } from "dexie";

// Define the structure for pending expense analysis requests
export interface PendingExpenseRequest {
  id?: number; // Auto-incremented primary key
  userId: string;
  text?: string;
  imageBase64?: string;
  timestamp: number;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  error?: string;
}

// Define the structure for offline saved expenses
export interface OfflineExpense {
  id?: number; // Auto-incremented primary key
  userId: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  timestamp: number;
  status: "pending" | "synced" | "failed";
  retryCount: number;
  error?: string;
}

// Extend Dexie with our custom tables
export class PennyDatabase extends Dexie {
  // Declare table types
  pendingRequests!: Table<PendingExpenseRequest, number>;
  offlineExpenses!: Table<OfflineExpense, number>;

  constructor() {
    super("pennyDB");

    // Define database schema
    this.version(1).stores({
      pendingRequests: "++id, userId, timestamp, status",
      offlineExpenses: "++id, userId, timestamp, status",
    });
  }
}

// Create a singleton instance
export const db = new PennyDatabase();
