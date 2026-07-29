import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { type Auth } from 'firebase-admin/auth';

let adminApp: App;
let adminDb: Firestore;
let adminMessaging: Messaging;
let adminAuthPromise: Promise<Auth> | null = null;

function getAuthClient(): Promise<Auth> {
  if (!adminAuthPromise) {
    adminAuthPromise = (async () => {
      const { getAuth } = await import('firebase-admin/auth');
      return getAuth(adminApp);
    })();
  }
  return adminAuthPromise;
}

/**
 * Initialize Firebase Admin SDK
 * Uses environment variables for service account credentials
 *
 * Set FIREBASE_ADMIN_CREDENTIALS in your .env.local for development:
 * Copy the contents of your service account JSON file as a single-line string
 */
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    if (!process.env.FIREBASE_ADMIN_CREDENTIALS) {
      if (process.env.FIREBASE_ADMIN_ALLOW_BUILD_FALLBACK === 'true') {
        adminApp = initializeApp({
          projectId:
            process.env.FIREBASE_PROJECT_ID ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
            'penny-ci',
        });
        console.log('Firebase Admin initialized with build-only fallback credentials');
      } else {
        throw new Error(
          'FIREBASE_ADMIN_CREDENTIALS environment variable is not set. ' +
          'Please add your Firebase service account JSON to .env.local'
        );
      }
    } else {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
        adminApp = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log('Firebase Admin initialized successfully');
      } catch (error) {
        console.error('Failed to parse FIREBASE_ADMIN_CREDENTIALS:', error);
        throw new Error('Invalid Firebase Admin credentials JSON');
      }
    }
  } else {
    adminApp = getApps()[0];
  }

  adminDb = getFirestore(adminApp);
  adminMessaging = getMessaging(adminApp);

  return { adminApp, adminDb, adminMessaging };
}

// Initialize on module load
const { adminApp: app, adminDb: db, adminMessaging: messaging } = initializeFirebaseAdmin();

const adminAuth = {
  verifyIdToken: (...args: Parameters<Auth['verifyIdToken']>) =>
    getAuthClient().then((client) => client.verifyIdToken(...args)),
  deleteUser: (...args: Parameters<Auth['deleteUser']>) =>
    getAuthClient().then((client) => client.deleteUser(...args)),
  revokeRefreshTokens: (...args: Parameters<Auth['revokeRefreshTokens']>) =>
    getAuthClient().then((client) => client.revokeRefreshTokens(...args)),
  getUser: (...args: Parameters<Auth['getUser']>) =>
    getAuthClient().then((client) => client.getUser(...args)),
  createUser: (...args: Parameters<Auth['createUser']>) =>
    getAuthClient().then((client) => client.createUser(...args)),
  createCustomToken: (...args: Parameters<Auth['createCustomToken']>) =>
    getAuthClient().then((client) => client.createCustomToken(...args)),
} satisfies Pick<
  Auth,
  | 'verifyIdToken'
  | 'deleteUser'
  | 'revokeRefreshTokens'
  | 'getUser'
  | 'createUser'
  | 'createCustomToken'
>;

export { app as adminApp, db as adminDb, adminAuth, messaging as adminMessaging };
