import {
  cert,
  getApp,
  initializeApp,
  type App,
  type AppOptions,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getStorage, type Storage } from 'firebase-admin/storage';

export type FirebaseAdminMode =
  | { mode: 'adc' }
  | { mode: 'service-account-json'; serviceAccount: Record<string, unknown> };

export interface FirebaseAdminServices {
  app: App;
  authApp: App;
  auth: Auth;
  db: Firestore;
  messaging: Messaging;
  storage: Storage;
}

export interface FirebaseProjectConfig {
  authProjectId?: string;
  dataProjectId?: string;
  firestoreDatabaseId?: string;
}

export function resolveFirebaseAdminMode(
  env: Record<string, string | undefined> = process.env,
): FirebaseAdminMode {
  if (!env.FIREBASE_ADMIN_CREDENTIALS) {
    return { mode: 'adc' };
  }

  try {
    return {
      mode: 'service-account-json',
      serviceAccount: JSON.parse(env.FIREBASE_ADMIN_CREDENTIALS),
    };
  } catch {
    throw new Error('Invalid FIREBASE_ADMIN_CREDENTIALS JSON');
  }
}

export function resolveFirebaseProjectConfig(
  env: Record<string, string | undefined> = process.env,
): FirebaseProjectConfig {
  const dataProjectId =
    env.FIRESTORE_PROJECT_ID ??
    env.FIREBASE_PROJECT_ID ??
    env.GOOGLE_CLOUD_PROJECT ??
    env.GCLOUD_PROJECT;

  return {
    authProjectId:
      env.FIREBASE_AUTH_PROJECT_ID ?? env.FIREBASE_PROJECT_ID ?? dataProjectId,
    dataProjectId,
    firestoreDatabaseId:
      !env.FIRESTORE_DATABASE_ID || env.FIRESTORE_DATABASE_ID === '(default)'
        ? undefined
        : env.FIRESTORE_DATABASE_ID,
  };
}

function appOptionsFor(
  mode: FirebaseAdminMode,
  projectId: string | undefined,
): AppOptions {
  return {
    ...(mode.mode === 'service-account-json'
      ? { credential: cert(mode.serviceAccount) }
      : {}),
    ...(projectId ? { projectId } : {}),
  };
}

function getOrInitializeNamedApp(name: string, options: AppOptions): App {
  try {
    return getApp(name);
  } catch {
    return initializeApp(options, name);
  }
}

export function initializeFirebaseAdmin(): FirebaseAdminServices {
  const mode = resolveFirebaseAdminMode();
  const projectConfig = resolveFirebaseProjectConfig();
  const app = getOrInitializeNamedApp(
    'penny-api-data',
    appOptionsFor(mode, projectConfig.dataProjectId),
  );
  const authApp =
    projectConfig.authProjectId &&
    projectConfig.authProjectId !== projectConfig.dataProjectId
      ? getOrInitializeNamedApp(
          'penny-api-auth',
          appOptionsFor(mode, projectConfig.authProjectId),
        )
      : app;

  return {
    app,
    authApp,
    auth: getAuth(authApp),
    db: projectConfig.firestoreDatabaseId
      ? getFirestore(app, projectConfig.firestoreDatabaseId)
      : getFirestore(app),
    messaging: getMessaging(authApp),
    storage: getStorage(app),
  };
}
