import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import type {
  CreateExpenseInput,
  DeleteExpenseInput,
  ExpenseService,
  UpdateExpenseInput,
} from './expenses';

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

export function createFirestoreExpenseService(db: Firestore): ExpenseService {
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

      return { id: expenseRef.id };
    },

    async updateExpense(input: UpdateExpenseInput) {
      const expenseRef = db.collection('expenses').doc(input.id);
      const now = Timestamp.now();

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

        const updateData: Record<string, unknown> = {
          updatedAt: now,
          history: FieldValue.arrayUnion({
            action: 'updated',
            by: input.userId,
            at: now,
          }),
        };

        if (input.vendor !== undefined) updateData.vendor = input.vendor;
        if (input.amount !== undefined) updateData.amount = input.amount;
        if (input.date !== undefined) updateData.date = parseExpenseDate(input.date);
        if (input.category !== undefined) updateData.category = input.category;
        if (input.description !== undefined) updateData.description = input.description;

        transaction.update(expenseRef, updateData);
      });

      return { id: input.id };
    },

    async deleteExpense(input: DeleteExpenseInput) {
      const expenseRef = db.collection('expenses').doc(input.id);
      const now = Timestamp.now();

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
        }
      });
    },
  };
}
