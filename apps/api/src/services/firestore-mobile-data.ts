import { type Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { type Storage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';

import { writeInChunks } from './batching';
import { parseCalendarDate } from './dates';
import { resolveMemberPermissions } from './group-permissions';
import {
  sanitizeNotificationPreferences,
  sanitizeNotificationSettings,
  sanitizeUserPreferences,
} from './preference-validation';
import type {
  DataScope,
  DuplicateExpenseInput,
  IdInput,
  ListInput,
  MediaUploadInput,
  MobileDataService,
  UpsertInput,
} from './mobile-data';

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, serializeValue(entry)]),
    );
  }
  return value;
}

function serializeDoc(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = serializeValue(doc.data() ?? {}) as Record<string, unknown>;
  return { id: doc.id, ...data };
}

function conflict(message: string) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function parseDate(date: string) {
  const parsed = parseCalendarDate(date);
  if (!parsed) throw badRequest('date must be a valid YYYY-MM-DD date');
  return Timestamp.fromDate(
    new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0),
  );
}

/** Firestore's gRPC NOT_FOUND, raised by update() on a missing document. */
function isFirestoreNotFound(error: unknown) {
  return (error as { code?: unknown } | null)?.code === 5;
}

/** Fields that decide who owns a record or when it was made. */
const PROTECTED_RECORD_FIELDS = [
  'id',
  'userId',
  'groupId',
  'createdAt',
  'createdBy',
  'addedBy',
];

/** Fields of a `users` document that only the server may write. */
const PROTECTED_PROFILE_FIELDS = [
  'id',
  'uid',
  'userId',
  'email',
  'emailVerified',
  'fcmTokens',
  'fcmToken',
  'pushTokens',
  'pushToken',
  'role',
  'roles',
  'isAdmin',
  'admin',
  'claims',
  'customClaims',
  'disabled',
  'createdAt',
];

const MAX_CONTRIBUTION_AMOUNT = 10_000_000;

/**
 * Fields a client may set when creating a record. Ownership, audit
 * timestamps and savings progress are always set by the server.
 */
const CREATABLE_FIELDS = {
  income: [
    'name',
    'category',
    'amount',
    'frequency',
    'isRecurring',
    'recurringDate',
    'isActive',
    'startDate',
    'endDate',
    'description',
    'taxable',
    'netAmount',
    'currency',
    'contributedBy',
    'splitType',
  ],
  savings: [
    'name',
    'category',
    'targetAmount',
    'monthlyContribution',
    'targetDate',
    'startDate',
    'isActive',
    'priority',
    'description',
    'emoji',
    'currency',
    'contributionType',
  ],
} as const;

function pickFields(data: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(data, field) && data[field] !== undefined)
      .map((field) => [field, data[field]]),
  );
}

/**
 * Drops protected fields from a client-supplied update. A dotted key such as
 * `groupId.x` is a field path in `update()`, so its first segment is checked.
 */
function withoutFields(data: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !fields.includes(key.split('.')[0])),
  );
}

function collectionFor(scope: DataScope, domain: 'income' | 'savings') {
  if (domain === 'income') {
    return scope === 'personal' ? 'income_sources_personal' : 'income_sources_group';
  }
  return scope === 'personal' ? 'savings_goals_personal' : 'savings_goals_group';
}

function scopedOwnerField(scope: DataScope) {
  return scope === 'personal' ? 'userId' : 'groupId';
}

export const EXPENSE_PAGE_SIZE = 500;
export const MAX_LISTED_EXPENSES = 10_000;

interface PageableQuery<D> {
  limit(n: number): PageableQuery<D>;
  startAfter(doc: D): PageableQuery<D>;
  get(): Promise<{ docs: D[] }>;
}

/** Reads an ordered query page by page until it is exhausted or `max` is hit. */
export async function collectPages<D>(
  query: PageableQuery<D>,
  pageSize: number,
  max: number,
): Promise<D[]> {
  const all: D[] = [];
  let last: D | undefined;
  while (all.length < max) {
    const take = Math.min(pageSize, max - all.length);
    const page = await (last ? query.startAfter(last) : query).limit(take).get();
    all.push(...page.docs);
    if (page.docs.length < take) break;
    last = page.docs[page.docs.length - 1];
  }
  return all;
}

function safeLimit(limit: unknown, fallback = 100) {
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, 100)
    : fallback;
}

export function createFirestoreMobileDataService(
  db: Firestore,
  auth?: Auth,
  storage?: Storage,
): MobileDataService {
  async function getActiveMembership(groupId: string, userId: string) {
    const doc = await db.collection('groupMembers').doc(`${groupId}_${userId}`).get();
    const data = doc.data();
    if (!doc.exists || data?.status !== 'active') {
      throw forbidden('Active group membership required');
    }
    return data;
  }

  async function requireGroupAdmin(groupId: string, userId: string) {
    const member = await getActiveMembership(groupId, userId);
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw forbidden('Owner or admin access required');
    }
    return member;
  }

  async function getOwnedDoc(collection: string, id: string, userId: string) {
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) throw notFound('Document not found');
    const data = doc.data() ?? {};
    if (data.userId !== userId) throw forbidden('Document access denied');
    return doc;
  }

  async function getScopedDoc(
    collection: string,
    id: string,
    scope: DataScope,
    userId: string,
    requireAdmin = false,
  ) {
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) throw notFound('Document not found');
    const data = doc.data() ?? {};
    if (scope === 'personal') {
      if (data.userId !== userId) throw forbidden('Document access denied');
      return doc;
    }

    const groupId = String(data.groupId ?? '');
    if (!groupId) throw forbidden('Group document is missing groupId');
    if (requireAdmin) await requireGroupAdmin(groupId, userId);
    else await getActiveMembership(groupId, userId);
    return doc;
  }

  async function listScoped(
    scope: DataScope,
    domain: 'income' | 'savings',
    input: ListInput,
  ) {
    const collection = collectionFor(scope, domain);
    let query: Query = db.collection(collection);
    if (scope === 'personal') {
      query = query.where('userId', '==', input.userId);
    } else {
      if (!input.groupId) throw badRequest('groupId is required');
      await getActiveMembership(input.groupId, input.userId);
      query = query.where('groupId', '==', input.groupId);
    }
    if (input.status) query = query.where('status', '==', input.status);
    query = query.limit(safeLimit(input.limit));
    const snap = await query.get();
    return snap.docs.map(serializeDoc);
  }

  async function createScoped(
    scope: DataScope,
    domain: 'income' | 'savings',
    input: UpsertInput,
  ) {
    const collection = collectionFor(scope, domain);
    const now = Timestamp.now();
    const fields = pickFields(input.data, CREATABLE_FIELDS[domain]);
    const data = {
      ...fields,
      ...(domain === 'savings'
        ? { currentAmount: 0, progressPercentage: 0, status: 'active' }
        : {}),
      [scopedOwnerField(scope)]: scope === 'personal' ? input.userId : input.groupId,
      ...(scope === 'group' ? { addedBy: input.userId, createdBy: input.userId } : {}),
      isActive: fields.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      startDate: fields.startDate ?? now,
    };
    if (scope === 'group') {
      if (!input.groupId) throw badRequest('groupId is required');
      await requireGroupAdmin(input.groupId, input.userId);
    }
    const ref = await db.collection(collection).add(data);
    const doc = await ref.get();
    return { id: ref.id, record: serializeDoc(doc) };
  }

  async function updateScoped(
    scope: DataScope,
    domain: 'income' | 'savings',
    input: UpsertInput & { id: string },
  ) {
    const collection = collectionFor(scope, domain);
    const doc = await getScopedDoc(collection, input.id, scope, input.userId, scope === 'group');
    await doc.ref.update({
      ...withoutFields(input.data, PROTECTED_RECORD_FIELDS),
      updatedAt: Timestamp.now(),
    });
    return serializeDoc(await doc.ref.get());
  }

  async function deleteScoped(
    scope: DataScope,
    domain: 'income' | 'savings',
    input: IdInput,
  ) {
    const collection = collectionFor(scope, domain);
    const doc = await getScopedDoc(collection, input.id, scope, input.userId, scope === 'group');
    await doc.ref.delete();
  }

  return {
    async listExpenses(input) {
      let query: Query = db.collection('expenses');
      if (input.groupId) {
        await getActiveMembership(input.groupId, input.userId);
        query = query.where('groupId', '==', input.groupId);
      } else if (input.scope === 'group') {
        throw badRequest('groupId is required for group expenses');
      } else {
        query = query.where('userId', '==', input.userId);
        if (input.scope === 'personal') query = query.where('expenseType', '==', 'personal');
      }
      // Approval only exists on group expenses, and only the group-scoped
      // combination has a composite index.
      if (input.groupId && input.approvalStatus) {
        query = query.where('groupMetadata.approvalStatus', '==', input.approvalStatus);
      }
      if (input.category) query = query.where('category', '==', input.category);
      query = query.orderBy('date', 'desc');
      // The mobile dashboard filters date ranges on the device, so a caller
      // that does not ask for a limit gets the full history, not just the
      // newest page.
      if (input.limit !== undefined) {
        const snap = await query.limit(safeLimit(input.limit)).get();
        return { expenses: snap.docs.map(serializeDoc) };
      }
      const docs = await collectPages(query, EXPENSE_PAGE_SIZE, MAX_LISTED_EXPENSES);
      return { expenses: docs.map(serializeDoc) };
    },

    async getExpense(input) {
      const doc = await db.collection('expenses').doc(input.id).get();
      if (!doc.exists) throw notFound('Expense not found');
      const data = doc.data() ?? {};
      if (data.userId !== input.userId) {
        if (!data.groupId) throw forbidden('Expense access denied');
        await getActiveMembership(String(data.groupId), input.userId);
      }
      return { expense: serializeDoc(doc) };
    },

    async duplicateExpense(input: DuplicateExpenseInput) {
      const expenseDate = parseDate(input.date).toDate();
      const start = new Date(expenseDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(expenseDate);
      end.setHours(23, 59, 59, 999);

      let query: Query = db
        .collection('expenses')
        .where('vendor', '==', input.vendor)
        .where('amount', '==', input.amount)
        .where('date', '>=', Timestamp.fromDate(start))
        .where('date', '<=', Timestamp.fromDate(end));
      if (input.groupId) {
        await getActiveMembership(input.groupId, input.userId);
        query = query.where('groupId', '==', input.groupId);
      } else {
        query = query.where('userId', '==', input.userId);
      }
      const snap = await query.limit(1).get();
      return { duplicate: snap.empty ? null : serializeDoc(snap.docs[0]) };
    },

    async approveExpense(input) {
      const doc = await db.collection('expenses').doc(input.id).get();
      if (!doc.exists) throw notFound('Expense not found');
      const data = doc.data() ?? {};
      if (!data.groupId) throw badRequest('Expense is not a group expense');
      const member = await getActiveMembership(String(data.groupId), input.userId);
      if (!resolveMemberPermissions(member).canApproveExpenses) {
        throw forbidden('No permission to approve expenses');
      }
      await doc.ref.update({
        'groupMetadata.approvalStatus': 'approved',
        'groupMetadata.approvedBy': input.userId,
        'groupMetadata.approvedAt': Timestamp.now(),
        updatedAt: Timestamp.now(),
        history: FieldValue.arrayUnion({
          action: 'approved',
          by: input.userId,
          at: Timestamp.now(),
        }),
      });
      return { success: true };
    },

    async rejectExpense(input) {
      const doc = await db.collection('expenses').doc(input.id).get();
      if (!doc.exists) throw notFound('Expense not found');
      const data = doc.data() ?? {};
      if (!data.groupId) throw badRequest('Expense is not a group expense');
      const member = await getActiveMembership(String(data.groupId), input.userId);
      if (!resolveMemberPermissions(member).canApproveExpenses) {
        throw forbidden('No permission to reject expenses');
      }
      await doc.ref.update({
        'groupMetadata.approvalStatus': 'rejected',
        'groupMetadata.rejectedReason': input.reason ?? '',
        'groupMetadata.rejectedAt': Timestamp.now(),
        updatedAt: Timestamp.now(),
        history: FieldValue.arrayUnion({
          action: 'rejected',
          by: input.userId,
          at: Timestamp.now(),
          changes: { reason: input.reason ?? '' },
        }),
      });
      return { success: true };
    },

    async getGroup(input) {
      await getActiveMembership(input.groupId, input.userId);
      const doc = await db.collection('groups').doc(input.groupId).get();
      if (!doc.exists || doc.data()?.status === 'deleted') return { group: null };
      return { group: serializeDoc(doc) };
    },

    async listGroupActivities(input) {
      await getActiveMembership(input.groupId, input.userId);
      const snap = await db
        .collection('groupActivities')
        .where('groupId', '==', input.groupId)
        .orderBy('createdAt', 'desc')
        .limit(safeLimit(input.limit, 50))
        .get();
      return { activities: snap.docs.map(serializeDoc) };
    },

    async getMyMembership(input) {
      const doc = await db.collection('groupMembers').doc(`${input.groupId}_${input.userId}`).get();
      if (!doc.exists || doc.data()?.status !== 'active') return { membership: null };
      return { membership: serializeDoc(doc) };
    },

    async declineInvitation(input) {
      const doc = await db.collection('groupInvitations').doc(input.id).get();
      if (!doc.exists) throw notFound('Invitation not found');
      const invitation = doc.data() ?? {};
      const invitedEmail =
        typeof invitation.invitedEmail === 'string'
          ? invitation.invitedEmail.trim().toLowerCase()
          : '';
      const callerEmail = input.userEmail?.trim().toLowerCase() ?? '';
      if (!invitedEmail || invitedEmail !== callerEmail) {
        throw forbidden('This invitation is for a different email address');
      }
      // A repeated decline (double tap, retry) is already done.
      if (invitation.status === 'rejected') return { success: true };
      if (invitation.status !== 'pending') {
        throw conflict('This invitation is no longer pending');
      }
      await doc.ref.update({
        status: 'rejected',
        respondedAt: Timestamp.now(),
        respondedBy: input.userId,
      });
      return { success: true };
    },

    async listIncome(input) {
      return { incomeSources: await listScoped(input.scope, 'income', input) };
    },
    async getIncome(input) {
      const doc = await getScopedDoc(
        collectionFor(input.scope, 'income'),
        input.id,
        input.scope,
        input.userId,
      );
      return { incomeSource: serializeDoc(doc) };
    },
    async createIncome(input) {
      const { id, record } = await createScoped(input.scope, 'income', input);
      return { id, incomeSource: record };
    },
    async updateIncome(input) {
      return { incomeSource: await updateScoped(input.scope, 'income', input) };
    },
    async deleteIncome(input) {
      await deleteScoped(input.scope, 'income', input);
      return { success: true };
    },

    async listSavings(input) {
      return { savingsGoals: await listScoped(input.scope, 'savings', input) };
    },
    async getSavings(input) {
      const doc = await getScopedDoc(
        collectionFor(input.scope, 'savings'),
        input.id,
        input.scope,
        input.userId,
      );
      return { savingsGoal: serializeDoc(doc) };
    },
    async createSavings(input) {
      const { id, record } = await createScoped(input.scope, 'savings', input);
      return { id, savingsGoal: record };
    },
    async updateSavings(input) {
      return { savingsGoal: await updateScoped(input.scope, 'savings', input) };
    },
    async contributeSavings(input) {
      if (
        !Number.isFinite(input.amount) ||
        input.amount <= 0 ||
        input.amount > MAX_CONTRIBUTION_AMOUNT
      ) {
        throw badRequest(
          `amount must be a positive number up to ${MAX_CONTRIBUTION_AMOUNT}`,
        );
      }
      const collection = collectionFor(input.scope, 'savings');
      const ref = db.collection(collection).doc(input.id);
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(ref);
        if (!doc.exists) throw notFound('Savings goal not found');
        const data = doc.data() ?? {};
        if (input.scope === 'personal') {
          if (data.userId !== input.userId) throw forbidden('Savings goal access denied');
        } else {
          const member = await getActiveMembership(String(data.groupId), input.userId);
          if (!resolveMemberPermissions(member).canAddExpenses) {
            throw forbidden('No permission to contribute to this savings goal');
          }
        }
        const currentAmount = Number(data.currentAmount ?? 0) + input.amount;
        const targetAmount = Number(data.targetAmount ?? 0);
        const progressPercentage =
          targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
        transaction.update(ref, {
          currentAmount,
          progressPercentage,
          status: progressPercentage >= 100 ? 'achieved' : 'active',
          lastContributionAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });
      return { savingsGoal: serializeDoc(await ref.get()) };
    },
    async deleteSavings(input) {
      await deleteScoped(input.scope, 'savings', input);
      return { success: true };
    },

    async listNotifications(input) {
      const snap = await db
        .collection('notifications')
        .where('userId', '==', input.userId)
        .orderBy('createdAt', 'desc')
        .limit(safeLimit(input.limit, 50))
        .get();
      return { notifications: snap.docs.map(serializeDoc) };
    },
    async markNotificationRead(input) {
      const doc = await getOwnedDoc('notifications', input.id, input.userId);
      await doc.ref.update({ read: true, readAt: Timestamp.now() });
      return { success: true };
    },
    async markAllNotificationsRead(input) {
      const snap = await db
        .collection('notifications')
        .where('userId', '==', input.userId)
        .where('read', '==', false)
        .get();
      const now = Timestamp.now();
      await writeInChunks(db, snap.docs, (batch, doc) => {
        batch.update(doc.ref, { read: true, readAt: now });
      });
      return { success: true };
    },
    async deleteNotification(input) {
      const doc = await getOwnedDoc('notifications', input.id, input.userId);
      await doc.ref.delete();
      return { success: true };
    },

    async getNotificationSettings(input) {
      const doc = await db.collection('userNotificationSettings').doc(input.userId).get();
      return { settings: doc.exists ? serializeDoc(doc) : {} };
    },
    async updateNotificationSettings(input) {
      const data = sanitizeNotificationSettings(input.data);
      const ref = db.collection('userNotificationSettings').doc(input.userId);
      await ref.set({ ...data, updatedAt: Timestamp.now() }, { merge: true });
      return { settings: serializeDoc(await ref.get()) };
    },
    async getNotificationPreferences(input) {
      const doc = await db
        .collection('users')
        .doc(input.userId)
        .collection('notificationPreferences')
        .doc('default')
        .get();
      return { preferences: doc.exists ? serializeDoc(doc) : {} };
    },
    async updateNotificationPreferences(input) {
      const data = sanitizeNotificationPreferences(input.data);
      const ref = db
        .collection('users')
        .doc(input.userId)
        .collection('notificationPreferences')
        .doc('default');
      await ref.set({ ...data, updatedAt: Timestamp.now() }, { merge: true });
      return { preferences: serializeDoc(await ref.get()) };
    },

    async upsertPushToken(input) {
      await db.collection('users').doc(input.userId).set(
        {
          ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
          fcmTokens: {
            [input.deviceId]: {
              token: input.token,
              platform: input.platform,
              createdAt: Timestamp.now(),
              lastRefreshed: Timestamp.now(),
            },
          },
        },
        { merge: true },
      );
      return { success: true };
    },
    async deletePushToken(input) {
      try {
        await db.collection('users').doc(input.userId).update({
          [`fcmTokens.${input.deviceId}`]: FieldValue.delete(),
        });
      } catch (error) {
        // No user document means there is no token left to remove.
        if (!isFirestoreNotFound(error)) throw error;
      }
      return { success: true };
    },

    async getUserProfile(input) {
      const doc = await db.collection('users').doc(input.userId).get();
      return { profile: doc.exists ? serializeDoc(doc) : { id: input.userId } };
    },
    async updateUserProfile(input) {
      // Firestore is the profile everything server-side reads (member names,
      // notification actors), so it is written first and its failure fails
      // the request.
      const ref = db.collection('users').doc(input.userId);
      await ref.set(
        {
          ...withoutFields(input.data, PROTECTED_PROFILE_FIELDS),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      const profile = serializeDoc(await ref.get());

      // The sign-in record only mirrors the name and photo for the app's
      // own display. Syncing it is best effort: an Auth outage or a disabled
      // Identity Toolkit API must not turn a saved profile into a 500.
      const update: Parameters<Auth['updateUser']>[1] = {};
      for (const key of ['displayName', 'photoURL'] as const) {
        const value = input.data[key];
        if (typeof value === 'string') update[key] = value.trim() ? value : null;
        else if (value === null) update[key] = null;
      }
      if (!auth || Object.keys(update).length === 0) return { profile };
      try {
        await auth.updateUser(input.userId, update);
        return { profile, authSynced: true };
      } catch (error) {
        console.error('[MobileDataService] Could not sync the profile to the sign-in record', {
          userId: input.userId,
          code: String((error as { code?: unknown } | null)?.code ?? 'unknown'),
          error: error instanceof Error ? error.message : String(error),
        });
        return { profile, authSynced: false };
      }
    },
    async getUserPreferences(input) {
      const doc = await db.collection('users').doc(input.userId).get();
      return {
        preferences: serializeValue(doc.data()?.preferences ?? {}) as Record<
          string,
          unknown
        >,
      };
    },
    async updateUserPreferences(input) {
      const data = sanitizeUserPreferences(input.data);
      const ref = db.collection('users').doc(input.userId);
      const updates = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [`preferences.${key}`, value]),
      );
      await ref.set({ preferences: data, updatedAt: Timestamp.now() }, { merge: true });
      if (Object.keys(updates).length > 0) {
        await ref.update({ ...updates, updatedAt: Timestamp.now() });
      }
      const doc = await ref.get();
      return {
        preferences: serializeValue(doc.data()?.preferences ?? {}) as Record<
          string,
          unknown
        >,
      };
    },

    async uploadMedia(input: MediaUploadInput) {
      if (!storage) throw Object.assign(new Error('Storage is not configured'), { statusCode: 503 });
      if (!input.contentType.startsWith('image/')) {
        throw badRequest('Only image uploads are supported');
      }
      const buffer = Buffer.from(input.base64, 'base64');
      if (buffer.length > 10 * 1024 * 1024) throw badRequest('File is too large');
      const extension = input.fileName.split('.').pop() ?? 'jpg';
      const path =
        input.kind === 'avatar'
          ? `avatars/${input.userId}/${randomUUID()}.${extension}`
          : `receipts/${input.userId}/${Date.now()}_${randomUUID()}.${extension}`;
      const file = storage.bucket().file(path);
      await file.save(buffer, {
        metadata: {
          contentType: input.contentType,
          metadata: { uploadedBy: input.userId, kind: input.kind },
        },
      });
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
      });
      return { url, path };
    },
    async deleteMedia(input) {
      if (!storage) throw Object.assign(new Error('Storage is not configured'), { statusCode: 503 });
      const allowedPrefix =
        input.kind === 'avatar'
          ? `avatars/${input.userId}/`
          : `receipts/${input.userId}/`;
      if (!input.path.startsWith(allowedPrefix)) {
        throw forbidden('Media path does not belong to authenticated user');
      }
      await storage.bucket().file(input.path).delete({ ignoreNotFound: true });
      return { success: true };
    },
  };
}
