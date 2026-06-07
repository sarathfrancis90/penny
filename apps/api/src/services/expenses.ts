export interface CreateExpenseInput {
  userId: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  receiptUrl?: string;
  receiptPath?: string;
  groupId?: string | null;
}

export interface UpdateExpenseInput {
  id: string;
  userId: string;
  vendor?: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string;
}

export interface DeleteExpenseInput {
  id: string;
  userId: string;
}

export interface ExpenseService {
  createExpense(input: CreateExpenseInput): Promise<{ id: string }>;
  updateExpense(input: UpdateExpenseInput): Promise<{ id: string }>;
  deleteExpense(input: DeleteExpenseInput): Promise<void>;
}

export function createUnavailableExpenseService(): ExpenseService {
  const unavailable = async () => {
    throw Object.assign(new Error('Expense service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    createExpense: unavailable,
    updateExpense: unavailable,
    deleteExpense: unavailable,
  };
}
