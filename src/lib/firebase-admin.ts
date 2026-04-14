import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;
let adminMessaging: Messaging;

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
      throw new Error(
        'FIREBASE_ADMIN_CREDENTIALS environment variable is not set. ' +
        'Please add your Firebase service account JSON to .env.local'
      );
    }

    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized successfully');
    } catch (error) {
      console.error('❌ Failed to parse FIREBASE_ADMIN_CREDENTIALS:', error);
      throw new Error('Invalid Firebase Admin credentials JSON');
    }
  } else {
    adminApp = getApps()[0];
  }

  adminDb = getFirestore(adminApp);
  adminAuth = getAuth(adminApp);
  adminMessaging = getMessaging(adminApp);

  return { adminApp, adminDb, adminAuth, adminMessaging };
}

// Initialize on module load
const { adminApp: app, adminDb: db, adminAuth: auth, adminMessaging: messaging } = initializeFirebaseAdmin();

export { app as adminApp, db as adminDb, auth as adminAuth, messaging as adminMessaging };
