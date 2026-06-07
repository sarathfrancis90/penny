import {
  createUnavailableAccountService,
  type AccountService,
} from './accounts';
import { createUnavailableAiService, type AiService } from './ai';
import {
  createUnavailableBudgetService,
  type BudgetService,
} from './budgets';
import {
  createUnavailableConversationService,
  type ConversationService,
} from './conversations';
import {
  createUnavailableExpenseService,
  type ExpenseService,
} from './expenses';
import { createUnavailableGroupService, type GroupService } from './groups';
import {
  createUnavailableUserPreferenceService,
  type UserPreferenceService,
} from './user-preferences';

export interface ApiServices {
  accounts: AccountService;
  ai: AiService;
  budgets: BudgetService;
  conversations: ConversationService;
  expenses: ExpenseService;
  groups: GroupService;
  userPreferences: UserPreferenceService;
}

export function createDefaultServices(): ApiServices {
  return {
    accounts: createUnavailableAccountService(),
    ai: createUnavailableAiService(),
    budgets: createUnavailableBudgetService(),
    conversations: createUnavailableConversationService(),
    expenses: createUnavailableExpenseService(),
    groups: createUnavailableGroupService(),
    userPreferences: createUnavailableUserPreferenceService(),
  };
}
