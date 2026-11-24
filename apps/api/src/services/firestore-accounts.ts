import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
} from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';

import type { AccountService } from './accounts';
import { writeInChunks } from './batching';
import { DEFAULT_ROLE_PERMISSIONS } from './group-permissions';

const USER_SCOPED_COLLECTIONS = [
  { name: 'expenses', field: 'userId' },
  { name: 'budgets_personal', field: 'userId' },
  { name: 'income_sources_personal', field: 'userId' },
  { name: 'savings_goals_personal', field: 'userId' },
  { name: 'notifications', field: 'userId' },
  { name: 'conversations', field: 'userId' },
  { name: 'groupMembers', field: 'userId' },
  { name: 'groupActivities', field: 'userId' },
  { name: 'groupInvitations', field: 'invitedBy' },
  { name: 'passkeys', field: 'userId' },
  { name: 'challenges', field: 'userId' },
] as const;

async function deleteWithBatching(
  db: Firestore,
  references: AsyncIterable<DocumentReference> | DocumentReference[],
) {
  let batch = db.batch();
  let count = 0;

  async function commitIfNeeded(force = false) {
    if (count === 0 || (!force && count < 450)) return;
    await batch.commit();
    batch = db.batch();
    count = 0;
  }

  for await (const ref of references) {
    batch.delete(ref);
    count += 1;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);
}

async function* documentRefsFromSnapshot(snapshot: QuerySnapshot) {
  for (const doc of snapshot.docs) {
    yield doc.ref;
  }
}

async function* conversationAndMessageRefs(snapshot: QuerySnapshot) {
  for (const doc of snapshot.docs) {
    const messages = await doc.ref.collection('messages').get();
    for (const messageDoc of messages.docs) {
      yield messageDoc.ref;
    }
    yield doc.ref;
  }
}

/** Collections whose documents belong to one group through `groupId`. */
const GROUP_SCOPED_COLLECTIONS = [
  'groupMembers',
  'groupInvitations',
  'groupActivities',
  'budgets_group',
  'income_sources_group',
  'savings_goals_group',
] as const;

function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY;
}

/** Longest-standing first: joinedAt, then invitedAt; undated members last. */
function bySeniority(a: DocumentSnapshot, b: DocumentSnapshot) {
  const aData = a.data() ?? {};
  const bData = b.data() ?? {};
  const aTime = Math.min(millis(aData.joinedAt), millis(aData.invitedAt));
  const bTime = Math.min(millis(bData.joinedAt), millis(bData.invitedAt));
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Folders in the storage bucket that hold one user's uploads. */
function userStoragePrefixes(userId: string) {
  return [`receipts/${userId}/`, `avatars/${userId}/`];
}

export function createFirestoreAccountService(
  db: Firestore,
  auth: Auth,
  storage?: Storage,
): AccountService {
  /**
   * Removes a departing user's membership and lowers the group's member
   * count in one transaction; a membership that is no longer active was
   * already uncounted, so it is only deleted.
   */
  async function removeMembership(memberRef: DocumentReference, groupId: string) {
    const groupRef = db.collection('groups').doc(groupId);
    await db.runTransaction(async (transaction) => {
      const [memberDoc, groupDoc] = await Promise.all([
        transaction.get(memberRef),
        transaction.get(groupRef),
      ]);
      if (!memberDoc.exists) return;
      transaction.delete(memberRef);
      if (memberDoc.data()?.status === 'active' && groupDoc.exists) {
        const now = Timestamp.now();
        transaction.update(groupRef, {
          'stats.memberCount': FieldValue.increment(-1),
          'stats.lastActivityAt': now,
          updatedAt: now,
        });
      }
    });
  }

  /**
   * Hard-deletes a group nobody else is active in, with its group-scoped
   * documents. Expenses other (former) members filed under it are kept as
   * their personal expenses, as an owner's group delete does.
   */
  async function deleteAbandonedGroup(groupId: string, userId: string) {
    const now = Timestamp.now();
    const expenses = await db.collection('expenses').where('groupId', '==', groupId).get();
    const othersExpenses = expenses.docs.filter((doc) => doc.data().userId !== userId);
    await writeInChunks(db, othersExpenses, (batch, doc) => {
      batch.update(doc.ref, { groupId: null, expenseType: 'personal', updatedAt: now });
    });
    await writeInChunks(
      db,
      expenses.docs.filter((doc) => doc.data().userId === userId),
      (batch, doc) => batch.delete(doc.ref),
    );
    for (const name of GROUP_SCOPED_COLLECTIONS) {
      const snapshot = await db.collection(name).where('groupId', '==', groupId).get();
      await writeInChunks(db, snapshot.docs, (batch, doc) => batch.delete(doc.ref));
    }
    // Last, so a failure above leaves the group in place for a retry.
    await db.collection('groups').doc(groupId).delete();
  }

  /**
   * A group the departing user owns: it passes to another active owner if
   * there is one, else the longest-standing active admin, else the
   * longest-standing active member of any role.
   * With nobody else active, the group is deleted.
   */
  async function resolveOwnedGroup(groupId: string, userId: string) {
    const active = await db
      .collection('groupMembers')
      .where('groupId', '==', groupId)
      .where('status', '==', 'active')
      .get();
    const others = active.docs
      .filter((doc) => doc.data().userId !== userId)
      .sort(bySeniority);
    // Another owner (several can exist after a promotion) keeps the group.
    const successor =
      others.find((doc) => doc.data().role === 'owner') ??
      others.find((doc) => doc.data().role === 'admin') ??
      others[0];

    if (!successor) {
      await deleteAbandonedGroup(groupId, userId);
      return;
    }

    const successorData = successor.data() ?? {};
    const successorUserId = String(successorData.userId ?? '');
    const groupRef = db.collection('groups').doc(groupId);
    const departingRef = db.collection('groupMembers').doc(`${groupId}_${userId}`);
    const now = Timestamp.now();
    await db.runTransaction(async (transaction) => {
      const [freshSuccessor, departing, groupDoc] = await Promise.all([
        transaction.get(successor.ref),
        transaction.get(departingRef),
        transaction.get(groupRef),
      ]);
      if (freshSuccessor.data()?.status !== 'active') {
        throw new Error('Group ownership successor is no longer active; retry the deletion');
      }
      transaction.update(successor.ref, {
        role: 'owner',
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
        lastActivityAt: now,
      });
      if (departing.exists) transaction.delete(departingRef);
      if (groupDoc.exists) {
        transaction.update(groupRef, {
          createdBy: successorUserId,
          ...(departing.exists && departing.data()?.status === 'active'
            ? { 'stats.memberCount': FieldValue.increment(-1) }
            : {}),
          'stats.lastActivityAt': now,
          updatedAt: now,
        });
      }
    });

    const successorName =
      successorData.userName || successorData.userEmail || 'A member';
    await db.collection('groupActivities').doc().set({
      groupId,
      userId: successorUserId,
      userName: successorName,
      action: 'member_role_changed',
      details: `${successorName} is now the owner because the previous owner deleted their account`,
      metadata: {
        targetUserId: successorUserId,
        targetEmail: successorData.userEmail ?? null,
        oldRole: successorData.role ?? null,
        newRole: 'owner',
        reason: 'previous_owner_deleted_account',
      },
      createdAt: now,
    });
  }

  /** Leaves, hands over or deletes every group the user belongs to. */
  async function detachFromGroups(userId: string) {
    const memberships = await db
      .collection('groupMembers')
      .where('userId', '==', userId)
      .get();
    const ownedGroupIds = new Set<string>();
    for (const doc of memberships.docs) {
      const data = doc.data();
      if (data.role === 'owner' && data.status === 'active') {
        ownedGroupIds.add(String(data.groupId));
      }
    }
    // Groups created by the user whose owner membership is missing.
    const created = await db.collection('groups').where('createdBy', '==', userId).get();
    for (const doc of created.docs) {
      if ((doc.data().status ?? 'active') === 'active') ownedGroupIds.add(doc.id);
    }

    for (const groupId of ownedGroupIds) {
      await resolveOwnedGroup(groupId, userId);
    }
    for (const doc of memberships.docs) {
      const groupId = String(doc.data().groupId ?? '');
      if (ownedGroupIds.has(groupId)) continue;
      await removeMembership(doc.ref, groupId);
    }
  }

  return {
    async deleteAccount(input) {
      const userDoc = db.collection('users').doc(input.userId);
      const profileEmail = (await userDoc.get()).data()?.email;

      // Groups first: an ownership hand-over is logged as a group activity
      // and must not be swept up by the per-user deletes below.
      await detachFromGroups(input.userId);

      for (const { name, field } of USER_SCOPED_COLLECTIONS) {
        const snapshot = await db
          .collection(name)
          .where(field, '==', input.userId)
          .get();

        await deleteWithBatching(
          db,
          name === 'conversations'
            ? conversationAndMessageRefs(snapshot)
            : documentRefsFromSnapshot(snapshot),
        );
      }

      // Invitations addressed to the user carry their email address.
      if (typeof profileEmail === 'string' && profileEmail.trim()) {
        const invitations = await db
          .collection('groupInvitations')
          .where('invitedEmail', '==', profileEmail.trim().toLowerCase())
          .get();
        await deleteWithBatching(db, documentRefsFromSnapshot(invitations));
      }

      // Notification settings live outside the user-scoped collections.
      const preferences = await userDoc.collection('notificationPreferences').get();
      await deleteWithBatching(db, [
        ...preferences.docs.map((doc) => doc.ref),
        db.collection('userNotificationSettings').doc(input.userId),
      ]);

      if ((await userDoc.get()).exists) {
        await deleteWithBatching(db, [userDoc]);
      }

      // Best effort: a storage failure must not block deleting the account,
      // but it is logged so leftover files can be cleaned up.
      if (storage) {
        for (const prefix of userStoragePrefixes(input.userId)) {
          try {
            await storage.bucket().deleteFiles({ prefix });
          } catch (error) {
            console.error('[AccountService] Failed to delete user files:', {
              prefix,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // The app deletes its own sign-in right after this call, so a failure
      // here must not block the user from deleting their account: all their
      // data is already gone. Log it loudly so it can be cleaned up.
      let signInDeleted = true;
      try {
        await auth.deleteUser(input.userId);
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code !== 'auth/user-not-found') {
          signInDeleted = false;
          console.error('[AccountService] Could not delete the sign-in record', {
            userId: input.userId,
            code: String((error as { code?: unknown } | null)?.code ?? 'unknown'),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        success: true,
        message: 'Account and all associated data have been permanently deleted.',
        signInDeleted,
      };
    },
  };
}
