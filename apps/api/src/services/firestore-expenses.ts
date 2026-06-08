import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import type {
  CreateExpenseInput,
  DeleteExpenseInput,
  ExpenseService,
  UpdateExpenseInput,
} from './expenses';
import {
  createNoopNotificationService,
  type NotificationService,
  type NotifyGroupMembersInput,
} from './notifications';

function parseExpenseDate(date: string): Timestamp {
  const [year, month, day] = date.split('-').map(Number);
  return Timestamp.fromDate(new Date(year, month - 1, day, 12, 0, 0));
}

async function requireActiveMembership(
  db: Firestore,
  groupId: string,
  userId: string,
) {
  const memberDoc = await db.collection('groupMembers').doc(`${groupId}_${userId}`).get();
  const member = memberDoc.data();
  if (!memberDoc.exists || member?.status !== 'active') {
    throw Object.assign(new Error('Active group membership required'), {
      statusCode: 403,
    });
  }
  return member;
}

function canMutateExpense(expense: FirebaseFirestore.DocumentData, userId: string) {
  if (expense.userId === userId) return true;
  const metadata = expense.groupMetadata;
  return Boolean(expense.groupId && metadata?.approvalStatus);
}

export function createFirestoreExpenseService(
  db: Firestore,
  notifications: NotificationService = createNoopNotificationService(),
): ExpenseService {
  return {
    async createExpense(input: CreateExpenseInput) {
      const now = Timestamp.now();
      const expenseDate = parseExpenseDate(input.date);
      const expenseType = input.groupId ? 'group' : 'personal';

      if (input.groupId) {
        await requireActiveMembership(db, input.groupId, input.userId);
      }

      const expenseRef = db.collection('expenses').doc();

      await db.runTransaction(async (transaction) => {
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
          ...(input.groupId
            ? { groupMetadata: { approvalStatus: 'approved' } }
            : {}),
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
            userName: 'Member',
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
      });

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

      return { id: expenseRef.id };
    },

    async updateExpense(input: UpdateExpenseInput) {
      const expenseRef = db.collection('expenses').doc(input.id);
      const now = Timestamp.now();
      let notificationEvent: NotifyGroupMembersInput | undefined;

      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(expenseRef);
        if (!snapshot.exists) {
          throw Object.assign(new Error('Expense not found'), { statusCode: 404 });
        }

        const existing = snapshot.data() ?? {};
        if (!canMutateExpense(existing, input.userId)) {
          throw Object.assign(new Error('Expense access denied'), {
            statusCode: 403,
          });
        }
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

        if (existing.groupId && existing.expenseType === 'group') {
          const vendor = input.vendor ?? existing.vendor ?? 'expense';
          const amount = input.amount ?? existing.amount;
          const category = input.category ?? existing.category;
          transaction.set(db.collection('groupActivities').doc(), {
            groupId: existing.groupId,
            userId: input.userId,
            userName: 'Member',
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
          throw Object.assign(new Error('Expense not found'), { statusCode: 404 });
        }
        const existing = snapshot.data() ?? {};
        if (!canMutateExpense(existing, input.userId)) {
          throw Object.assign(new Error('Expense access denied'), {
            statusCode: 403,
          });
        }

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
            userName: 'Member',
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
