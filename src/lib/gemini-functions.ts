/**
 * Gemini Function Declarations for AI Agent
 * 
 * These function schemas define what the AI can do beyond expense creation.
 * Users can ask questions like:
 * - "How much have I spent on food this month?"
 * - "Show me my grocery expenses from last week"
 * - "Am I within budget for dining out?"
 * - "What are my top spending categories?"
 */

// Function declaration types for Gemini AI
export const GEMINI_FUNCTIONS = [
  {
    name: "get_budget_status",
    description: "Get current budget usage and remaining amounts for categories. Use this when user asks about budget, spending limits, or how much they have left to spend.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Specific expense category to check (optional). If not provided, returns all budgets. Examples: 'Food & Dining', 'Transportation', 'Entertainment'",
        },
        groupId: {
          type: "string",
          description: "Group ID for group budgets (optional). If not provided, returns personal budgets.",
        },
        period: {
          type: "string",
          enum: ["current", "last_month", "last_3_months"],
          description: "Time period to check. Defaults to 'current' month.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_expense_summary",
    description: "Get total expenses and count for a date range. Use this when user asks about total spending, expense count, or spending over time.",
    parameters: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
        groupId: {
          type: "string",
          description: "Filter by group ID (optional)",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_category_breakdown",
    description: "Get spending breakdown by category with amounts and percentages. Use this when user asks about spending patterns, top categories, or category comparisons.",
    parameters: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
        groupId: {
          type: "string",
          description: "Filter by group ID (optional)",
        },
        limit: {
          type: "number",
          description: "Number of top categories to return (default: 10)",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_group_expenses",
    description: "Get expenses for a specific group. Use this when user asks about group spending, shared expenses, or expenses in a particular group.",
    parameters: {
      type: "object",
      properties: {
        groupId: {
          type: "string",
          description: "Group ID to fetch expenses for",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (optional)",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of expenses to return (default: 50)",
        },
      },
      required: ["groupId"],
    },
  },
  {
    name: "search_expenses",
    description: "Search and filter expenses by vendor, category, amount range, or date range. Use this for specific expense lookups.",
    parameters: {
      type: "object",
      properties: {
        vendor: {
          type: "string",
          description: "Vendor name to search for (partial match)",
        },
        category: {
          type: "string",
          description: "Category to filter by",
        },
        minAmount: {
          type: "number",
          description: "Minimum expense amount",
        },
        maxAmount: {
          type: "number",
          description: "Maximum expense amount",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
        groupId: {
          type: "string",
          description: "Filter by group ID (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recent_expenses",
    description: "Get the most recent expenses. Use this when user asks 'what are my recent expenses', 'show my last expenses', etc.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent expenses to return (default: 10)",
        },
        groupId: {
          type: "string",
          description: "Filter by group ID (optional)",
        },
      },
      required: [],
    },
  },
  {
    name: "compare_periods",
    description: "Compare spending between two time periods. Use this when user asks about spending trends, comparisons like 'this month vs last month', or changes over time.",
    parameters: {
      type: "object",
      properties: {
        period1Start: {
          type: "string",
          description: "Start date of first period (YYYY-MM-DD)",
        },
        period1End: {
          type: "string",
          description: "End date of first period (YYYY-MM-DD)",
        },
        period2Start: {
          type: "string",
          description: "Start date of second period (YYYY-MM-DD)",
        },
        period2End: {
          type: "string",
          description: "End date of second period (YYYY-MM-DD)",
        },
        category: {
          type: "string",
          description: "Specific category to compare (optional)",
        },
        groupId: {
          type: "string",
          description: "Filter by group ID (optional)",
        },
      },
      required: ["period1Start", "period1End", "period2Start", "period2End"],
    },
  },
] as const;

// Type definitions for function parameters
export type BudgetStatusParams = {
  category?: string;
  groupId?: string;
  period?: "current" | "last_month" | "last_3_months";
};

export type ExpenseSummaryParams = {
  startDate: string;
  endDate: string;
  groupId?: string;
};

export type CategoryBreakdownParams = {
  startDate: string;
  endDate: string;
  groupId?: string;
  limit?: number;
};

export type GroupExpensesParams = {
  groupId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type SearchExpensesParams = {
  vendor?: string;
  category?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  groupId?: string;
  limit?: number;
};

export type RecentExpensesParams = {
  limit?: number;
  groupId?: string;
};

export type ComparePeriodsParams = {
  period1Start: string;
  period1End: string;
  period2Start: string;
  period2End: string;
  category?: string;
  groupId?: string;
};

// Union type for all function parameters
export type FunctionParams =
  | BudgetStatusParams
  | ExpenseSummaryParams
  | CategoryBreakdownParams
  | GroupExpensesParams
  | SearchExpensesParams
  | RecentExpensesParams
  | ComparePeriodsParams;

// Function names enum
export enum GeminiFunctionName {
  GET_BUDGET_STATUS = "get_budget_status",
  GET_EXPENSE_SUMMARY = "get_expense_summary",
  GET_CATEGORY_BREAKDOWN = "get_category_breakdown",
  GET_GROUP_EXPENSES = "get_group_expenses",
  SEARCH_EXPENSES = "search_expenses",
  GET_RECENT_EXPENSES = "get_recent_expenses",
  COMPARE_PERIODS = "compare_periods",
}

