import { afterEach, describe, expect, it } from 'vitest';

import { loadApiEnv } from '../env';

describe('API environment validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses safe defaults outside production', () => {
    process.env = {
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'penny-test',
    };

    expect(loadApiEnv()).toMatchObject({
      nodeEnv: 'test',
      port: 8080,
      serviceName: 'penny-api',
      firebaseProjectId: 'penny-test',
    });
  });

  it('fails fast in production when required secrets are missing', () => {
    process.env = {
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'penny-prod',
    };

    expect(() => loadApiEnv()).toThrow(/GEMINI_API_KEY/);
  });

  it('parses CORS origins and required production settings', () => {
    process.env = {
      NODE_ENV: 'production',
      PORT: '9090',
      FIREBASE_PROJECT_ID: 'penny-prod',
      FIREBASE_AUTH_PROJECT_ID: 'penny-mobile-auth',
      FIRESTORE_PROJECT_ID: 'penny-data',
      FIRESTORE_DATABASE_ID: 'penny-api',
      GEMINI_API_KEY: 'gemini-secret',
      API_CORS_ORIGINS: 'https://app.example.com, https://staging.example.com',
    };

    expect(loadApiEnv()).toMatchObject({
      nodeEnv: 'production',
      port: 9090,
      corsOrigins: ['https://app.example.com', 'https://staging.example.com'],
      firebaseAuthProjectId: 'penny-mobile-auth',
      firestoreProjectId: 'penny-data',
      firestoreDatabaseId: 'penny-api',
      geminiApiKey: 'gemini-secret',
    });
  });
});
