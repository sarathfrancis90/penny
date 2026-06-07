import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import type { UserPreferenceService } from './user-preferences';

async function requireActiveMembership(
  db: Firestore,
  groupId: string,
  userId: string,
) {
  const directDoc = await db.collection('groupMembers').doc(`${groupId}_${userId}`).get();
  if (directDoc.exists) {
    const data = directDoc.data() ?? {};
    if (data.status === 'active') return;
  }

  const membership = await db
    .collection('groupMembers')
    .where('groupId', '==', groupId)
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (membership.empty) {
    throw Object.assign(
      new Error('You must be a member of this group to set it as default'),
      { statusCode: 403 },
    );
  }
}

export function createFirestoreUserPreferenceService(
  db: Firestore,
): UserPreferenceService {
  return {
    async getDefaultGroup(input) {
      const userDoc = await db.collection('users').doc(input.userId).get();
      if (!userDoc.exists) {
        throw Object.assign(new Error('User not found'), { statusCode: 404 });
      }
      const user = userDoc.data() ?? {};
      return {
        defaultGroupId:
          typeof user.preferences?.defaultGroupId === 'string'
            ? user.preferences.defaultGroupId
            : null,
      };
    },

    async setDefaultGroup(input) {
      if (input.groupId) {
        await requireActiveMembership(db, input.groupId, input.userId);
      }

      await db
        .collection('users')
        .doc(input.userId)
        .set(
          {
            preferences: { defaultGroupId: input.groupId },
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );

      return {
        success: true,
        defaultGroupId: input.groupId,
      };
    },

    async clearDefaultGroup(input) {
      await db
        .collection('users')
        .doc(input.userId)
        .set(
          {
            preferences: { defaultGroupId: null },
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );

      return {
        success: true,
        defaultGroupId: null,
      };
    },
  };
}
