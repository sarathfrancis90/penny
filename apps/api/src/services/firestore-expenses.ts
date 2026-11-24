import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

import { formatCalendarDate, isExpenseDateString, parseCalendarDate } from './dates';
import type {
  CreateExpenseInput,
  DeleteExpenseInput,
  ExpenseService,
  UpdateExpenseInput,
} from './expenses';
import { resolveMemberPermissions } from './group-permissions';
import {
  createNoopNotificationService,
  type NotificationService,
  type NotifyGroupMembersInput,
} from './notifications';

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function invalidDate() {
  return httpError(400, 'date must be a valid YYYY-MM-DD date');
}

/** Stored at local noon so the calendar day survives time-zone conversion. */
function parseExpenseDate(date: string): Timestamp {
  const parsed = parseCalendarDate(date);
  if (!parsed) throw invalidDate();
  return Timestamp.fromDate(new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
}

function storedDateString(value: unknown): string | undefined {
  if (!(value instanceof Timestamp)) return undefined;
  const date = value.toDate();
  return formatCalendarDate({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

async function requireActiveMembership(db: Firestore, groupId: string, userId: string) {
  const memberDoc = await db.collection('groupMembers').doc(`${groupId}_${userId}`).get();
  const member = memberDoc.data();
  if (!memberDoc.exists || member?.status !== 'active') {
    throw httpError(403, 'Active group membership required');
  }
  return member;
}

/**
 * Personal expenses belong to their creator. Group expenses need an active
 * membership and follow the same rules as database/firestore.rules: edit
 * your own with canEditOwnExpenses or anyone's with canEditAllExpenses;
 * delete your own, or anyone's with canDeleteExpenses.
 */
async function assertCanMutateExpense(
  db: Firestore,
  transaction: FirebaseFirestore.Transaction,
  expense: FirebaseFirestore.DocumentData,
  userId: string,
  action: 'edit' | 'delete',
) {
  const isOwnExpense = expense.userId === userId;
  if (!expense.groupId) {
    if (!isOwnExpense) throw httpError(403, 'Expense access denied');
    return undefined;
  }

  const memberDoc = await transaction.get(
    db.collection('groupMembers').doc(`${expense.groupId}_${userId}`),
  );
  const member = memberDoc.data();
  if (!memberDoc.exists || member?.status !== 'active') {
    throw httpError(403, 'Expense access denied');
  }
  const permissions = resolveMemberPermissions(member);
  const allowed =
    action === 'edit'
      ? (isOwnExpense && permissions.canEditOwnExpenses) || permissions.canEditAllExpenses
      : isOwnExpense || permissions.canDeleteExpenses;
  if (!allowed) throw httpError(403, 'Expense access denied');
  return member;
}

/** Name shown in the group activity feed for a member. */
function memberName(member: FirebaseFirestore.DocumentData | undefined): string {
  for (const value of [member?.userName, member?.userEmail]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'Member';
}

/**
 * Sends a budget alert when this expense takes the person's monthly budget
 * for its category past the alert threshold (budget_warning) or past the
 * limit (budget_exceeded). Each fires once: only when the expense is the one
 * that crosses the line. Spending counts every expense the person added in
 * that category and month, as the app's budget screen does. Never throws:
 * a failed alert must not fail the expense.
 */
async function checkPersonalBudget(
  db: Firestore,
  notifications: NotificationService,
  input: { userId: string; category: string; date: string; amount: number },
) {
  try {
    const parsed = parseCalendarDate(input.date);
    if (!parsed || !(input.amount > 0)) return;
    const budgets = await db
      .collection('budgets_personal')
      .where('userId', '==', input.userId)
      .where('category', '==', input.category)
      .where('period.month', '==', parsed.month)
      .where('period.year', '==', parsed.year)
      .limit(1)
      .get();
    const budgetDoc = budgets.docs[0];
    const budget = budgetDoc?.data();
    if (!budgetDoc || !budget || budget.settings?.notificationsEnabled === false) return;
    const limit = typeof budget.monthlyLimit === 'number' ? budget.monthlyLimit : 0;
    if (!(limit > 0)) return;
    const thresholdPercent =
      typeof budget.settings?.alertThreshold === 'number' ? budget.settings.alertThreshold : 80;

    const start = Timestamp.fromDate(new Date(parsed.year, parsed.month - 1, 1));
    const end = Timestamp.fromDate(new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999));
    const expenses = await db
      .collection('expenses')
      .where('userId', '==', input.userId)
      .where('category', '==', input.category)
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();
    const after = expenses.docs.reduce((sum, doc) => {
      const amount = doc.data().amount;
      return sum + (typeof amount === 'number' ? amount : 0);
    }, 0);
    const before = after - input.amount;
    const warnAt = (limit * thresholdPercent) / 100;

    const exceeded = before < limit && after >= limit;
    const warned = !exceeded && before < warnAt && after >= warnAt;
    if (!exceeded && !warned) return;

    const money = (value: number) => `$${value.toFixed(2)}`;
    const monthName = new Date(parsed.year, parsed.month - 1, 1).toLocaleString('en-CA', {
      month: 'long',
    });
    await notifications.notifyUsers({
      userIds: [input.userId],
      type: exceeded ? 'budget_exceeded' : 'budget_warning',
      title: exceeded ? 'Budget exceeded' : 'Budget alert',
      body: exceeded
        ? `You've spent ${money(after)} of your ${money(limit)} ${input.category} budget for ${monthName}.`
        : `You've used ${Math.floor((after / limit) * 100)}% of your ${money(limit)} ${input.category} budget for ${monthName}.`,
      category: 'budget',
      priority: exceeded ? 'high' : 'medium',
      icon: 'budget',
      actionUrl: '/budgets',
      relatedId: budgetDoc.id,
      relatedType: 'budget',
      metadata: {
        budgetId: budgetDoc.id,
        category: input.category,
        spent: after,
        limit,
        thresholdPercent,
        month: parsed.month,
        year: parsed.year,
      },
    });
  } catch (error) {
    console.error('[Budgets] Could not check the budget for an alert:', error);
  }
}

/** Same user + same clientRequestId always maps to the same document. */
function idempotentExpenseId(userId: string, clientRequestId: string) {
  const digest = createHash('sha256').update(`${userId}:${clientRequestId}`).digest('hex');
  return `cr_${digest.slice(0, 32)}`;
}

export function createFirestoreExpenseService(
  db: Firestore,
  notifications: NotificationService = createNoopNotificationService(),
): ExpenseService {
  return {
    async createExpense(input: CreateExpenseInput) {
      const now = Timestamp.now();
      if (!isExpenseDateString(input.date)) throw invalidDate();
      const expenseDate = parseExpenseDate(input.date);
      let groupMember: FirebaseFirestore.DocumentData | undefined;
      const expenseType = input.groupId ? 'group' : 'personal';

      if (input.groupId) {
        const member = await requireActiveMembership(db, input.groupId, input.userId);
        if (!resolveMemberPermissions(member).canAddExpenses) {
          throw httpError(403, 'No permission to add expenses to this group');
        }
        groupMember = member;
        const group = await db.collection('groups').doc(input.groupId).get();
        const status = group.data()?.status;
        if (!group.exists || status === 'deleted') {
          throw httpError(404, 'Group not found');
        }
        if (status === 'archived') {
          throw httpError(409, 'This group is archived, so expenses can no longer be added to it');
        }
      }

      const expenseRef = input.clientRequestId
        ? db.collection('expenses').doc(idempotentExpenseId(input.userId, input.clientRequestId))
        : db.collection('expenses').doc();

      // A retried request finds the document its first attempt wrote. The
      // read happens inside the transaction, so two concurrent attempts
      // cannot both create it.
      const replayed = await db.runTransaction(async (transaction) => {
        if (input.clientRequestId) {
          const existing = await transaction.get(expenseRef);
          if (existing.exists) {
            if (existing.data()?.userId !== input.userId) {
              throw httpError(409, 'clientRequestId is already in use');
            }
            return true;
          }
        }

        const expenseData = {
          vendor: input.vendor,
          amount: input.amount,
          category: input.category,
          date: expenseDate,
          description: input.description ?? '',
          userId: input.userId,
          receiptUrl: input.receiptUrl ?? null,
          receiptPath: input.receiptPath ?? null,
          groupId: input.groupId ?? null,
          expenseType,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'synced',
          history: [{ action: 'created', by: input.userId, at: now }],
          ...(input.groupId ? { groupMetadata: { approvalStatus: 'approved' } } : {}),
        };

        transaction.set(expenseRef, expenseData);

        if (input.groupId) {
          const groupRef = db.collection('groups').doc(input.groupId);
          transaction.update(groupRef, {
            'stats.expenseCount': FieldValue.increment(1),
            'stats.totalAmount': FieldValue.increment(input.amount),
            'stats.lastActivityAt': now,
            updatedAt: now,
          });

          transaction.set(db.collection('groupActivities').doc(), {
            groupId: input.groupId,
            userId: input.userId,
            userName: memberName(groupMember),
            action: 'expense_added',
            details: `Added expense at ${input.vendor}`,
            metadata: {
              expenseId: expenseRef.id,
              vendor: input.vendor,
              amount: input.amount,
              category: input.category,
            },
            createdAt: now,
          });
        }
        return false;
      });

      if (replayed) return { id: expenseRef.id };

      if (input.groupId) {
        await notifications.notifyGroupMembers({
          groupId: input.groupId,
          actorUserId: input.userId,
          type: 'group_expense_added',
          title: 'New expense added',
          bodyTemplate: `{actor} added $${input.amount.toFixed(2)} at ${input.vendor}`,
          category: 'group',
          priority: 'medium',
          icon: 'money',
          actionUrl: `/groups/${input.groupId}`,
          relatedId: expenseRef.id,
          relatedType: 'expense',
          metadata: {
            expenseId: expenseRef.id,
            vendor: input.vendor,
            amount: input.amount,
            category: input.category,
          },
        });
      }

      await checkPersonalBudget(db, notifications, {
        userId: input.userId,
        category: input.category,
        date: input.date,
        amount: input.amount,
      });

      return { id: expenseRef.id };
    },

    async updateExpense(input: UpdateExpenseInput) {
      const expenseRef = db.collection('expenses').doc(input.id);
      const now = Timestamp.now();
      let notificationEvent: NotifyGroupMembersInput | undefined;

      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(expenseRef);
        if (!snapshot.exists) {
          throw Object.assign(new Error('Expense not found'), {
            statusCode: 404,
          });
        }

        const existing = snapshot.data() ?? {};
        const actor = await assertCanMutateExpense(db, transaction, existing, input.userId, 'edit');
        const changes: string[] = [];

        const updateData: Record<string, unknown> = {
          updatedAt: now,
          history: FieldValue.arrayUnion({
            action: 'updated',
            by: input.userId,
            at: now,
          }),
        };

        if (input.vendor !== undefined) {
          updateData.vendor = input.vendor;
          changes.push('vendor');
        }
        if (input.amount !== undefined) {
          updateData.amount = input.amount;
          changes.push('amount');
        }
        if (input.date !== undefined) {
          // Resending the stored date is always fine, so an expense saved
          // with an out-of-range year can still have its other fields edited.
          if (!isExpenseDateString(input.date) && input.date !== storedDateString(existing.date)) {
            throw invalidDate();
          }
          updateData.date = parseExpenseDate(input.date);
          changes.push('date');
        }
        if (input.category !== undefined) {
          updateData.category = input.category;
          changes.push('category');
        }
        if (input.description !== undefined) {
          updateData.description = input.description;
          changes.push('description');
        }

        transaction.update(expenseRef, updateData);

        if (
          existing.groupId &&
          input.amount !== undefined &&
          typeof existing.amount === 'number' &&
          input.amount !== existing.amount
        ) {
          transaction.update(db.collection('groups').doc(existing.groupId), {
            'stats.totalAmount': FieldValue.increment(input.amount - existing.amount),
            'stats.lastActivityAt': now,
            updatedAt: now,
          });
        }

        if (existing.groupId && existing.expenseType === 'group') {
          const vendor = input.vendor ?? existing.vendor ?? 'expense';
          const amount = input.amount ?? existing.amount;
          const category = input.category ?? existing.category;
          transaction.set(db.collection('groupActivities').doc(), {
            groupId: existing.groupId,
            userId: input.userId,
            userName: memberName(actor),
            action: 'expense_updated',
            details: `Updated expense at ${vendor}`,
            metadata: {
              expenseId: input.id,
              vendor,
              amount,
              category,
              changes,
            },
            createdAt: now,
          });

          notificationEvent = {
            groupId: String(existing.groupId),
            actorUserId: input.userId,
            type: 'group_expense_updated',
            title: 'Expense updated',
            bodyTemplate: `{actor} updated ${vendor}${changes.length > 0 ? ` (${changes.join(', ')})` : ''}`,
            category: 'group',
            priority: 'medium',
            icon: 'edit',
            actionUrl: `/groups/${existing.groupId}`,
            relatedId: input.id,
            relatedType: 'expense',
            metadata: {
              expenseId: input.id,
              vendor,
              amount,
              category,
              changes,
            },
          };
        }
      });

      if (notificationEvent) {
        await notifications.notifyGroupMembers(notificationEvent);
      }

      return { id: input.id };
    },

    async deleteExpense(input: DeleteExpenseInput) {
      const expenseRef = db.collection('expenses').doc(input.id);
      const now = Timestamp.now();
      let notificationEvent: NotifyGroupMembersInput | undefined;

      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(expenseRef);
        if (!snapshot.exists) {
          throw Object.assign(new Error('Expense not found'), {
            statusCode: 404,
          });
        }
        const existing = snapshot.data() ?? {};
        const actor = await assertCanMutateExpense(
          db,
          transaction,
          existing,
          input.userId,
          'delete',
        );

        transaction.delete(expenseRef);

        if (existing.groupId && typeof existing.amount === 'number') {
          transaction.update(db.collection('groups').doc(existing.groupId), {
            'stats.expenseCount': FieldValue.increment(-1),
            'stats.totalAmount': FieldValue.increment(-existing.amount),
            'stats.lastActivityAt': now,
            updatedAt: now,
          });

          transaction.set(db.collection('groupActivities').doc(), {
            groupId: existing.groupId,
            userId: input.userId,
            userName: memberName(actor),
            action: 'expense_deleted',
            details: `Deleted expense at ${existing.vendor ?? 'expense'}`,
            metadata: {
              expenseId: input.id,
              vendor: existing.vendor,
              amount: existing.amount,
              category: existing.category,
            },
            createdAt: now,
          });

          notificationEvent = {
            groupId: String(existing.groupId),
            actorUserId: input.userId,
            type: 'group_expense_deleted',
            title: 'Expense deleted',
            bodyTemplate: `{actor} deleted $${existing.amount.toFixed(2)} at ${existing.vendor ?? 'expense'}`,
            category: 'group',
            priority: 'medium',
            icon: 'delete',
            actionUrl: `/groups/${existing.groupId}`,
            relatedId: input.id,
            relatedType: 'expense',
            metadata: {
              expenseId: input.id,
              vendor: existing.vendor,
              amount: existing.amount,
              category: existing.category,
            },
          };
        }
      });

      if (notificationEvent) {
        await notifications.notifyGroupMembers(notificationEvent);
      }
    },
  };
}
