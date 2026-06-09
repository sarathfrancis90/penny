import { loadApiEnv } from '../config/env';
import { createFirestoreAccountService } from './firestore-accounts';
import { createFirestoreBudgetService } from './firestore-budgets';
import { createFirestoreConversationService } from './firestore-conversations';
import { createFirestoreExpenseService } from './firestore-expenses';
import { createFirestoreGroupService } from './firestore-groups';
import { createFirestoreMobileDataService } from './firestore-mobile-data';
import { createFirestoreUserPreferenceService } from './firestore-user-preferences';
import { createFirestoreNotificationService } from './notifications';
import { initializeFirebaseAdmin } from './firebase-admin';
import { createUnavailableAiService } from './ai';
import { createGeminiAiService } from './gemini-ai';
import type { ApiServices } from './index';
import type { AuthVerifier } from '../app';

export function createProductionServices(): ApiServices {
  const env = loadApiEnv();
  const firebase = initializeFirebaseAdmin();
  const notifications = createFirestoreNotificationService(
    firebase.db,
    firebase.messaging,
  );

  return {
    accounts: createFirestoreAccountService(firebase.db, firebase.auth),
    ai: env.geminiApiKey
      ? createGeminiAiService(env.geminiApiKey)
      : createUnavailableAiService(),
    budgets: createFirestoreBudgetService(firebase.db, notifications),
    conversations: createFirestoreConversationService(firebase.db),
    expenses: createFirestoreExpenseService(firebase.db, notifications),
    groups: createFirestoreGroupService(firebase.db, notifications),
    mobileData: createFirestoreMobileDataService(
      firebase.db,
      firebase.auth,
      firebase.storage,
    ),
    notifications,
    userPreferences: createFirestoreUserPreferenceService(firebase.db),
  };
}

export function createProductionAuthVerifier(): AuthVerifier {
  const firebase = initializeFirebaseAdmin();

  return {
    async verifyIdToken(token) {
      const decoded = await firebase.auth.verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email,
        claims: decoded,
      };
    },
  };
}

export function createProductionReadyCheck(): () => Promise<void> {
  const firebase = initializeFirebaseAdmin();

  return async () => {
    await firebase.db.listCollections();
  };
}
