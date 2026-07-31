import { describe, expect, it } from 'vitest';

import {
  resolveFirebaseAdminMode,
  resolveFirebaseProjectConfig,
} from '../firebase-admin';

describe('Firebase Admin service configuration', () => {
  it('uses Cloud Run application default credentials when no JSON is provided', () => {
    expect(resolveFirebaseAdminMode({})).toEqual({ mode: 'adc' });
  });

  it('uses local JSON credentials when provided', () => {
    expect(
      resolveFirebaseAdminMode({
        FIREBASE_ADMIN_CREDENTIALS: '{"project_id":"penny-test"}',
      }),
    ).toEqual({
      mode: 'service-account-json',
      serviceAccount: { project_id: 'penny-test' },
    });
  });

  it('fails fast on invalid local JSON credentials', () => {
    expect(() =>
      resolveFirebaseAdminMode({ FIREBASE_ADMIN_CREDENTIALS: 'not-json' }),
    ).toThrow(/Invalid FIREBASE_ADMIN_CREDENTIALS/);
  });

  it('uses the same project for auth and data by default', () => {
    expect(resolveFirebaseProjectConfig({ FIREBASE_PROJECT_ID: 'penny-data' }))
      .toEqual({
        authProjectId: 'penny-data',
        dataProjectId: 'penny-data',
        storageBucket: 'penny-data.firebasestorage.app',
        firestoreDatabaseId: undefined,
      });
  });

  it('can verify auth tokens from a different Firebase project', () => {
    expect(
      resolveFirebaseProjectConfig({
        FIREBASE_AUTH_PROJECT_ID: 'penny-mobile-auth',
        FIRESTORE_PROJECT_ID: 'penny-data',
        FIRESTORE_DATABASE_ID: 'penny-api',
      }),
    ).toEqual({
      authProjectId: 'penny-mobile-auth',
      dataProjectId: 'penny-data',
      storageBucket: 'penny-data.firebasestorage.app',
      firestoreDatabaseId: 'penny-api',
    });
  });

  it('uses FIREBASE_STORAGE_BUCKET when provided', () => {
    expect(
      resolveFirebaseProjectConfig({
        FIREBASE_PROJECT_ID: 'penny-data',
        FIREBASE_STORAGE_BUCKET: 'my-custom-bucket.appspot.com',
      }),
    ).toMatchObject({
      dataProjectId: 'penny-data',
      storageBucket: 'my-custom-bucket.appspot.com',
    });
  });

  it('falls back when no project id is available', () => {
    expect(resolveFirebaseProjectConfig({})).toMatchObject({
      dataProjectId: undefined,
      storageBucket: undefined,
    });
  });

  it('treats the default Firestore database marker as the SDK default', () => {
    expect(
      resolveFirebaseProjectConfig({
        FIREBASE_PROJECT_ID: 'penny-data',
        FIRESTORE_DATABASE_ID: '(default)',
      }),
    ).toMatchObject({
      dataProjectId: 'penny-data',
      firestoreDatabaseId: undefined,
    });
  });
});
