import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

/**
 * Initialize Firebase Admin SDK
 * Uses environment variables for service account credentials in production
 * Falls back to service account file in development
 */
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    // In production (Vercel), use environment variables
    if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
        adminApp = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log('✅ Firebase Admin initialized with environment credentials');
      } catch (error) {
        console.error('❌ Failed to parse FIREBASE_ADMIN_CREDENTIALS:', error);
        throw new Error('Invalid Firebase Admin credentials');
      }
    }
    // In development, use the service account file
    else if (process.env.NODE_ENV === 'development') {
      try {
        // Dynamic import of service account file (won't exist in production)
        const serviceAccount = require('../../penny-f4acd-firebase-adminsdk-fbsvc-dbfb3efa94.json');
        adminApp = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log('✅ Firebase Admin initialized with local service account');
      } catch (error) {
        console.error('❌ Failed to load service account file:', error);
        throw new Error('Service account file not found');
      }
    } else {
      throw new Error(
        'Firebase Admin credentials not configured. ' +
        'Set FIREBASE_ADMIN_CREDENTIALS environment variable in production.'
      );
    }
  } else {
    adminApp = getApps()[0];
  }

  adminDb = getFirestore(adminApp);
  adminAuth = getAuth(adminApp);

  return { adminApp, adminDb, adminAuth };
}

// Initialize on module load
const { adminApp: app, adminDb: db, adminAuth: auth } = initializeFirebaseAdmin();

export { app as adminApp, db as adminDb, auth as adminAuth };

