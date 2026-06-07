export interface BudgetPeriod {
  month: number;
  year: number;
}

export interface BudgetQueryInput {
  userId: string;
  category?: string;
  month?: number;
  year?: number;
}

export interface GroupBudgetQueryInput extends BudgetQueryInput {
  groupId: string;
}

export interface CreatePersonalBudgetInput {
  userId: string;
  category: string;
  monthlyLimit: number;
  period: BudgetPeriod;
  settings?: Record<string, unknown>;
}

export interface CreateGroupBudgetInput {
  userId: string;
  groupId: string;
  category: string;
  monthlyLimit: number;
  period: BudgetPeriod;
  settings?: Record<string, unknown>;
}

export interface UpdateBudgetInput {
  id: string;
  userId: string;
  monthlyLimit?: number;
  settings?: Record<string, unknown>;
}

export interface BudgetUsageInput {
  userId: string;
  month?: number;
  year?: number;
}

export interface GroupBudgetUsageInput extends BudgetUsageInput {
  groupId: string;
}

export interface BudgetService {
  listPersonalBudgets(input: BudgetQueryInput): Promise<Record<string, unknown>[]>;
  createPersonalBudget(input: CreatePersonalBudgetInput): Promise<Record<string, unknown>>;
  getPersonalBudget(input: { id: string; userId: string }): Promise<Record<string, unknown>>;
  updatePersonalBudget(input: UpdateBudgetInput): Promise<Record<string, unknown>>;
  deletePersonalBudget(input: { id: string; userId: string }): Promise<void>;
  getPersonalBudgetUsage(input: BudgetUsageInput): Promise<Record<string, unknown>[]>;

  listGroupBudgets(input: GroupBudgetQueryInput): Promise<Record<string, unknown>[]>;
  createGroupBudget(input: CreateGroupBudgetInput): Promise<Record<string, unknown>>;
  getGroupBudget(input: { id: string; userId: string }): Promise<Record<string, unknown>>;
  updateGroupBudget(input: UpdateBudgetInput): Promise<Record<string, unknown>>;
  deleteGroupBudget(input: { id: string; userId: string }): Promise<void>;
  getGroupBudgetUsage(input: GroupBudgetUsageInput): Promise<Record<string, unknown>[]>;
}

export function createUnavailableBudgetService(): BudgetService {
  const unavailable = async () => {
    throw Object.assign(new Error('Budget service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    listPersonalBudgets: unavailable,
    createPersonalBudget: unavailable,
    getPersonalBudget: unavailable,
    updatePersonalBudget: unavailable,
    deletePersonalBudget: unavailable,
    getPersonalBudgetUsage: unavailable,
    listGroupBudgets: unavailable,
    createGroupBudget: unavailable,
    getGroupBudget: unavailable,
    updateGroupBudget: unavailable,
    deleteGroupBudget: unavailable,
    getGroupBudgetUsage: unavailable,
  };
}
