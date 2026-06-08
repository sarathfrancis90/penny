import {
  Timestamp,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';

import type {
  BudgetPeriod,
  BudgetQueryInput,
  BudgetService,
  BudgetUsageInput,
  CreateGroupBudgetInput,
  CreatePersonalBudgetInput,
  GroupBudgetQueryInput,
  GroupBudgetUsageInput,
  UpdateBudgetInput,
} from './budgets';
import {
  createNoopNotificationService,
  type NotificationService,
} from './notifications';

function currentPeriod(): BudgetPeriod {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function previousPeriod(period: BudgetPeriod): BudgetPeriod {
  return period.month === 1
    ? { month: 12, year: period.year - 1 }
    : { month: period.month - 1, year: period.year };
}

function periodBounds(period: BudgetPeriod) {
  return {
    start: Timestamp.fromDate(new Date(period.year, period.month - 1, 1)),
    end: Timestamp.fromDate(
      new Date(period.year, period.month, 0, 23, 59, 59, 999),
    ),
  };
}

function budgetStatus(percentageUsed: number) {
  if (percentageUsed > 100) return 'over';
  if (percentageUsed >= 91) return 'critical';
  if (percentageUsed >= 71) return 'warning';
  return 'safe';
}

function simpleBudgetUsage(budgetLimit: number, totalSpent: number) {
  const percentageUsed = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;
  return {
    totalSpent,
    remainingAmount: budgetLimit - totalSpent,
    percentageUsed,
    status: budgetStatus(percentageUsed),
  };
}

function calculateTrend(
  currentTotal: number,
  previousTotal: number,
  budgetLimit: number,
  period: BudgetPeriod,
) {
  const comparedToPreviousMonth = previousTotal > 0
    ? ((currentTotal - previousTotal) / previousTotal) * 100
    : 0;
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const currentDay = Math.min(new Date().getDate(), daysInMonth);
  const averageSpendingRate = currentDay > 0 ? currentTotal / currentDay : 0;
  const projectedEndOfMonthTotal =
    currentTotal + averageSpendingRate * (daysInMonth - currentDay);
  const remainingBudget = budgetLimit - currentTotal;

  return {
    comparedToPreviousMonth,
    averageSpendingRate,
    projectedEndOfMonthTotal,
    daysUntilOverBudget:
      projectedEndOfMonthTotal > budgetLimit && averageSpendingRate > 0
        ? Math.ceil(remainingBudget / averageSpendingRate)
        : undefined,
  };
}

function withBudgetFilters(
  query: Query,
  input: BudgetQueryInput | GroupBudgetQueryInput,
) {
  let filtered = query;
  if (input.category) filtered = filtered.where('category', '==', input.category);
  if (input.month && input.year) {
    filtered = filtered
      .where('period.month', '==', input.month)
      .where('period.year', '==', input.year);
  }
  return filtered;
}

async function getActiveMembership(
  db: Firestore,
  groupId: string,
  userId: string,
) {
  const directDoc = await db.collection('groupMembers').doc(`${groupId}_${userId}`).get();
  if (directDoc.exists) {
    const data = directDoc.data() ?? {};
    if (data.status === 'active' || data.status === undefined) return data;
  }

  const query = await db
    .collection('groupMembers')
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  return query.empty ? undefined : query.docs[0].data();
}

async function requireGroupMember(db: Firestore, groupId: string, userId: string) {
  const member = await getActiveMembership(db, groupId, userId);
  if (!member) {
    throw Object.assign(new Error('User is not a member of this group'), {
      statusCode: 403,
    });
  }
  return member;
}

async function requireGroupAdmin(db: Firestore, groupId: string, userId: string) {
  const member = await requireGroupMember(db, groupId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw Object.assign(
      new Error('Only group admins/owners can manage budgets'),
      { statusCode: 403 },
    );
  }
  return member;
}

async function deleteMatchingCache(db: Firestore, filters: Record<string, unknown>) {
  let query: Query = db.collection('budget_usage_cache');
  for (const [field, value] of Object.entries(filters)) {
    query = query.where(field, '==', value);
  }

  const snapshot = await query.get();
  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function getDocumentOrThrow(
  db: Firestore,
  collection: string,
  id: string,
  notFoundMessage = 'Budget not found',
) {
  const doc = await db.collection(collection).doc(id).get();
  if (!doc.exists) {
    throw Object.assign(new Error(notFoundMessage), { statusCode: 404 });
  }
  return doc;
}

async function expensesForPeriod(
  db: Firestore,
  filters: { userId?: string; groupId?: string },
  period: BudgetPeriod,
): Promise<Record<string, unknown>[]> {
  const { start, end } = periodBounds(period);
  let query: Query = db.collection('expenses');
  if (filters.userId) query = query.where('userId', '==', filters.userId);
  if (filters.groupId) query = query.where('groupId', '==', filters.groupId);
  query = query.where('date', '>=', start).where('date', '<=', end);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function totalForCategory(expenses: Record<string, unknown>[], category: string) {
  return expenses
    .filter((expense) => expense.category === category)
    .reduce(
      (sum, expense) =>
        sum + (typeof expense.amount === 'number' ? expense.amount : 0),
      0,
    );
}

async function buildUsage(
  db: Firestore,
  budgets: FirebaseFirestore.QueryDocumentSnapshot[],
  period: BudgetPeriod,
  expenseFilters: { userId?: string; groupId?: string; personalOnly?: boolean },
) {
  const currentExpenses = (await expensesForPeriod(db, expenseFilters, period))
    .filter((expense) => !expenseFilters.personalOnly || !expense.groupId);
  const previousExpenses = (
    await expensesForPeriod(db, expenseFilters, previousPeriod(period))
  ).filter((expense) => !expenseFilters.personalOnly || !expense.groupId);

  return budgets.map((doc) => {
    const budget = doc.data();
    const category = String(budget.category);
    const budgetLimit =
      typeof budget.monthlyLimit === 'number' ? budget.monthlyLimit : 0;
    const categoryExpenses = currentExpenses.filter(
      (expense) => expense.category === category,
    );
    const totalSpent = totalForCategory(currentExpenses, category);
    const previousTotal = totalForCategory(previousExpenses, category);
    const usage = simpleBudgetUsage(budgetLimit, totalSpent);

    return {
      budgetId: doc.id,
      category,
      budgetLimit,
      ...usage,
      expenseCount: categoryExpenses.length,
      trend: calculateTrend(totalSpent, previousTotal, budgetLimit, period),
    };
  });
}

function resolveUsagePeriod(input: BudgetUsageInput | GroupBudgetUsageInput) {
  const fallback = currentPeriod();
  return {
    month: input.month ?? fallback.month,
    year: input.year ?? fallback.year,
  };
}

export function createFirestoreBudgetService(
  db: Firestore,
  notifications: NotificationService = createNoopNotificationService(),
): BudgetService {
  return {
    async listPersonalBudgets(input) {
      const query = withBudgetFilters(
        db.collection('budgets_personal').where('userId', '==', input.userId),
        input,
      );
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },

    async createPersonalBudget(input: CreatePersonalBudgetInput) {
      const existing = await db
        .collection('budgets_personal')
        .where('userId', '==', input.userId)
        .where('category', '==', input.category)
        .where('period.month', '==', input.period.month)
        .where('period.year', '==', input.period.year)
        .limit(1)
        .get();
      if (!existing.empty) {
        throw Object.assign(
          new Error('Budget already exists for this category and period'),
          { statusCode: 409 },
        );
      }

      const now = Timestamp.now();
      const budgetData = {
        userId: input.userId,
        category: input.category,
        monthlyLimit: input.monthlyLimit,
        period: input.period,
        settings: {
          rollover: false,
          alertThreshold: 80,
          notificationsEnabled: true,
          ...input.settings,
        },
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection('budgets_personal').add(budgetData);
      return { id: docRef.id, ...budgetData };
    },

    async getPersonalBudget(input) {
      const doc = await getDocumentOrThrow(db, 'budgets_personal', input.id);
      const budget = doc.data() ?? {};
      if (budget.userId !== input.userId) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
      }
      return { id: doc.id, ...budget };
    },

    async updatePersonalBudget(input: UpdateBudgetInput) {
      const doc = await getDocumentOrThrow(db, 'budgets_personal', input.id);
      const existing = doc.data() ?? {};
      if (existing.userId !== input.userId) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
      }

      const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
      if (input.monthlyLimit !== undefined) {
        updateData.monthlyLimit = input.monthlyLimit;
      }
      if (input.settings) {
        updateData.settings = {
          rollover: existing.settings?.rollover ?? false,
          alertThreshold: existing.settings?.alertThreshold ?? 80,
          notificationsEnabled:
            existing.settings?.notificationsEnabled ?? true,
          ...input.settings,
        };
      }

      await doc.ref.update(updateData);
      const updated = await doc.ref.get();
      return { id: updated.id, ...(updated.data() ?? {}) };
    },

    async deletePersonalBudget(input) {
      const doc = await getDocumentOrThrow(db, 'budgets_personal', input.id);
      const budget = doc.data() ?? {};
      if (budget.userId !== input.userId) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
      }

      await doc.ref.delete();
      await deleteMatchingCache(db, {
        userId: input.userId,
        category: budget.category,
        'period.month': budget.period?.month,
        'period.year': budget.period?.year,
      });
    },

    async getPersonalBudgetUsage(input) {
      const period = resolveUsagePeriod(input);
      const budgetSnapshot = await db
        .collection('budgets_personal')
        .where('userId', '==', input.userId)
        .where('period.month', '==', period.month)
        .where('period.year', '==', period.year)
        .get();

      if (budgetSnapshot.empty) return [];
      return buildUsage(db, budgetSnapshot.docs, period, {
        userId: input.userId,
        personalOnly: true,
      });
    },

    async listGroupBudgets(input) {
      await requireGroupMember(db, input.groupId, input.userId);
      const query = withBudgetFilters(
        db.collection('budgets_group').where('groupId', '==', input.groupId),
        input,
      );
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },

    async createGroupBudget(input: CreateGroupBudgetInput) {
      const member = await requireGroupAdmin(db, input.groupId, input.userId);
      const existing = await db
        .collection('budgets_group')
        .where('groupId', '==', input.groupId)
        .where('category', '==', input.category)
        .where('period.month', '==', input.period.month)
        .where('period.year', '==', input.period.year)
        .limit(1)
        .get();
      if (!existing.empty) {
        throw Object.assign(
          new Error('Budget already exists for this category and period'),
          { statusCode: 409 },
        );
      }

      const now = Timestamp.now();
      const budgetData = {
        groupId: input.groupId,
        category: input.category,
        monthlyLimit: input.monthlyLimit,
        period: input.period,
        setBy: input.userId,
        setByRole: member.role,
        settings: {
          requireApprovalWhenOver: false,
          alertMembers: true,
          alertThreshold: 80,
          ...input.settings,
        },
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection('budgets_group').add(budgetData);
      await notifications.notifyGroupMembers({
        groupId: input.groupId,
        actorUserId: input.userId,
        type: 'group_settings_changed',
        title: 'Group budget created',
        bodyTemplate: `{actor} created a ${input.category} budget for {group}`,
        category: 'group',
        priority: 'low',
        icon: 'budget',
        actionUrl: `/groups/${input.groupId}`,
        relatedId: docRef.id,
        relatedType: 'budget',
        metadata: {
          action: 'created',
          category: input.category,
          monthlyLimit: input.monthlyLimit,
          period: input.period,
        },
      });
      return { id: docRef.id, ...budgetData };
    },

    async getGroupBudget(input) {
      const doc = await getDocumentOrThrow(db, 'budgets_group', input.id);
      const budget = doc.data() ?? {};
      await requireGroupMember(db, String(budget.groupId), input.userId);
      return { id: doc.id, ...budget };
    },

    async updateGroupBudget(input: UpdateBudgetInput) {
      const doc = await getDocumentOrThrow(db, 'budgets_group', input.id);
      const existing = doc.data() ?? {};
      await requireGroupAdmin(db, String(existing.groupId), input.userId);

      const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
      if (input.monthlyLimit !== undefined) {
        updateData.monthlyLimit = input.monthlyLimit;
      }
      if (input.settings) {
        updateData.settings = {
          requireApprovalWhenOver:
            existing.settings?.requireApprovalWhenOver ?? false,
          alertMembers: existing.settings?.alertMembers ?? true,
          alertThreshold: existing.settings?.alertThreshold ?? 80,
          ...input.settings,
        };
      }

      await doc.ref.update(updateData);
      const updated = await doc.ref.get();
      await notifications.notifyGroupMembers({
        groupId: String(existing.groupId),
        actorUserId: input.userId,
        type: 'group_settings_changed',
        title: 'Group budget updated',
        bodyTemplate: `{actor} updated the ${existing.category} budget for {group}`,
        category: 'group',
        priority: 'low',
        icon: 'budget',
        actionUrl: `/groups/${existing.groupId}`,
        relatedId: input.id,
        relatedType: 'budget',
        metadata: {
          action: 'updated',
          category: existing.category,
          monthlyLimit: input.monthlyLimit ?? existing.monthlyLimit,
          settingsChanged: Boolean(input.settings),
        },
      });
      return { id: updated.id, ...(updated.data() ?? {}) };
    },

    async deleteGroupBudget(input) {
      const doc = await getDocumentOrThrow(db, 'budgets_group', input.id);
      const budget = doc.data() ?? {};
      await requireGroupAdmin(db, String(budget.groupId), input.userId);

      await doc.ref.delete();
      await deleteMatchingCache(db, {
        groupId: budget.groupId,
        category: budget.category,
        'period.month': budget.period?.month,
        'period.year': budget.period?.year,
      });
      await notifications.notifyGroupMembers({
        groupId: String(budget.groupId),
        actorUserId: input.userId,
        type: 'group_settings_changed',
        title: 'Group budget deleted',
        bodyTemplate: `{actor} deleted the ${budget.category} budget for {group}`,
        category: 'group',
        priority: 'low',
        icon: 'budget',
        actionUrl: `/groups/${budget.groupId}`,
        relatedId: input.id,
        relatedType: 'budget',
        metadata: {
          action: 'deleted',
          category: budget.category,
          monthlyLimit: budget.monthlyLimit,
          period: budget.period,
        },
      });
    },

    async getGroupBudgetUsage(input) {
      await requireGroupMember(db, input.groupId, input.userId);
      const period = resolveUsagePeriod(input);
      const budgetSnapshot = await db
        .collection('budgets_group')
        .where('groupId', '==', input.groupId)
        .where('period.month', '==', period.month)
        .where('period.year', '==', period.year)
        .get();

      if (budgetSnapshot.empty) return [];
      return buildUsage(db, budgetSnapshot.docs, period, {
        groupId: input.groupId,
      });
    },
  };
}
