export type ApiNodeEnv = 'development' | 'test' | 'production';

export interface ApiEnv {
  nodeEnv: ApiNodeEnv;
  port: number;
  serviceName: 'penny-api';
  corsOrigins: string[];
  firebaseProjectId?: string;
  firebaseAuthProjectId?: string;
  firebaseAdminCredentials?: string;
  firestoreProjectId?: string;
  firestoreDatabaseId?: string;
  geminiApiKey?: string;
  cronSecret?: string;
  observabilityEnabled: boolean;
  observabilityEnv: string;
}

function parseNodeEnv(value: string | undefined): ApiNodeEnv {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? 8080);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`PORT must be a positive integer, received ${value}`);
  }
  return parsed;
}

function parseCorsOrigins(value: string | undefined): string[] {
  const fallback = 'http://localhost:3000';
  return (value ?? fallback)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function requireProductionSecret(
  env: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
) {
  if (!env[name]) {
    throw new Error(`${String(name)} is required in production`);
  }
}

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);

  if (nodeEnv === 'production') {
    requireProductionSecret(env, 'GEMINI_API_KEY');
  }

  return {
    nodeEnv,
    port: parsePort(env.PORT),
    serviceName: 'penny-api',
    corsOrigins: parseCorsOrigins(env.API_CORS_ORIGINS),
    firebaseProjectId: env.FIREBASE_PROJECT_ID,
    firebaseAuthProjectId: env.FIREBASE_AUTH_PROJECT_ID,
    firebaseAdminCredentials: env.FIREBASE_ADMIN_CREDENTIALS,
    firestoreProjectId: env.FIRESTORE_PROJECT_ID,
    firestoreDatabaseId: env.FIRESTORE_DATABASE_ID,
    geminiApiKey: env.GEMINI_API_KEY,
    cronSecret: env.CRON_SECRET,
    observabilityEnabled: env.OBSERVABILITY_ENABLED === 'true',
    observabilityEnv: env.OBSERVABILITY_ENV ?? nodeEnv,
  };
}
