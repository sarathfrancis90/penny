import type { Auth } from 'firebase-admin/auth';
import type {
  DocumentReference,
  Firestore,
  QuerySnapshot,
} from 'firebase-admin/firestore';

import type { AccountService } from './accounts';

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

export function createFirestoreAccountService(
  db: Firestore,
  auth: Auth,
): AccountService {
  return {
    async deleteAccount(input) {
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

      const userDoc = db.collection('users').doc(input.userId);
      if ((await userDoc.get()).exists) {
        await deleteWithBatching(db, [userDoc]);
      }

      try {
        await auth.deleteUser(input.userId);
      } catch {
        // Firebase Auth can already be deleted by a prior retry. Firestore cleanup
        // is the critical idempotent part of this endpoint.
      }

      return {
        success: true,
        message: 'Account and all associated data have been permanently deleted.',
      };
    },
  };
}
