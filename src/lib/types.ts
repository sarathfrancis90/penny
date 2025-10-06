import { Timestamp } from "firebase/firestore";

/**
 * Expense data structure for tracking business expenses
 */
export interface Expense {
  id: string;
  userId: string;
  vendor: string;
  amount: number;
  category: string;
  date: Timestamp;
  description?: string;
  receiptUrl?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Offline sync fields
  syncStatus?: "pending" | "synced" | "error";
  localId?: string; // For offline-first functionality
}

/**
 * Chat message structure for the AI chat interface
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Timestamp;
  // Optional fields for expense-related messages
  expenseData?: Partial<Expense>;
  imageUrl?: string;
  status?: "pending" | "confirmed" | "rejected";
  metadata?: {
    processingTime?: number;
    model?: string;
    confidence?: number;
  };
}

/**
 * User profile data structure
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  preferences?: {
    currency?: string;
    fiscalYearEnd?: string;
    defaultCategories?: string[];
  };
}

/**
 * Expense summary for dashboard analytics
 */
export interface ExpenseSummary {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

/**
 * Form data for manual expense entry
 */
export interface ExpenseFormData {
  vendor: string;
  amount: string;
  category: string;
  date: string;
  description?: string;
  notes?: string;
}
