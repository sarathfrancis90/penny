#!/usr/bin/env tsx
/**
 * One-shot bootstrap: reads .env.observability.setup, creates derived
 * resources (Cronitor heartbeat, BetterStack monitors, Firebase admin claim),
 * pushes all secrets to Vercel + GitHub Actions.
 *
 * Idempotent: re-runs are safe. Uses `?upsert=true` for Vercel, 422-as-OK
 * for Cronitor/BetterStack, and gh CLI (idempotent by nature) for GitHub.
 *
 * Usage:  npx tsx scripts/bootstrap-accounts.ts
 */

import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { homedir } from 'os';
import { resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// ---------- utilities ----------

const ENV_FILE = resolve(process.cwd(), '.env.observability.setup');
const FIREBASE_ADMIN_JSON_PATH = resolve(
  homedir(),
  'Downloads/penny-f4acd-firebase-adminsdk-fbsvc-ba2fe4564a.json',
);
const USER_EMAIL = 'sarathfrancis90@gmail.com';
const APP_STORE_CONNECT_APP_ID = '6761629879';
const GOOGLE_PLAY_PACKAGE_NAME = 'com.pennyai.penny';
const GITHUB_REPO = 'sarathfrancis90/penny';

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(`Env file not found at ${path}`);
  }
  const out: Record<string, string> = {};
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Tolerant of "VERCEL_TOKEN=VERCEL_TOKEN=vcp_..." duplication
    const dup = `${key}=`;
    if (value.startsWith(dup)) value = value.slice(dup.length).trim();
    out[key] = value;
  }
  return out;
}

function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

function banner(label: string) {
  console.log(`\n▶ ${label}`);
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function warn(msg: string) {
  console.log(`  ⚠ ${msg}`);
}
function fail(msg: string) {
  console.log(`  ✗ ${msg}`);
}

// Never print secret values — show only key names + short fingerprint.
function fp(v: string): string {
  return v ? `${v.slice(0, 6)}…${v.slice(-4)}` : '(empty)';
}

// ---------- parse + validate ----------

const env = readEnvFile(ENV_FILE);

const REQUIRED = [
  'DISCORD_WEBHOOK_ALERTS_CRITICAL',
  'DISCORD_WEBHOOK_ALERTS_WARNING',
  'DISCORD_WEBHOOK_ALERTS_INFO',
  'DISCORD_WEBHOOK_STORE_METRICS',
  'DISCORD_WEBHOOK_DEPLOYS',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_DSN_MOBILE',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT_WEB',
  'SENTRY_PROJECT_MOBILE',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'POSTHOG_PERSONAL_API_KEY',
  'POSTHOG_PROJECT_ID',
  'AXIOM_TOKEN',
  'BETTERSTACK_API_KEY',
  'CRONITOR_SDK_INTEGRATION',
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'GITHUB_PAT',
];

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error('Missing required keys in .env.observability.setup:');
  for (const k of missing) console.error(`  - ${k}`);
  process.exit(1);
}

banner('Parsed env file');
ok(`Keys present: ${Object.keys(env).length}`);

// Auto-generate shared secrets
env.ALERT_FORWARD_SECRET = generateSecret();
env.CRON_SECRET = generateSecret();
env.CRONITOR_API_KEY = env.CRONITOR_SDK_INTEGRATION;
env.APP_STORE_CONNECT_APP_ID = APP_STORE_CONNECT_APP_ID;
env.GOOGLE_PLAY_PACKAGE_NAME = GOOGLE_PLAY_PACKAGE_NAME;
env.GITHUB_ISSUE_REPO = GITHUB_REPO;
env.NEXT_PUBLIC_APP_URL = 'https://penny.app';

ok(`Generated ALERT_FORWARD_SECRET (${fp(env.ALERT_FORWARD_SECRET)})`);
ok(`Generated CRON_SECRET (${fp(env.CRON_SECRET)})`);

// ---------- Firebase: grant admin ----------

async function grantFirebaseAdmin(): Promise<string> {
  banner('Firebase: grant admin custom claim');
  if (!existsSync(FIREBASE_ADMIN_JSON_PATH)) {
    throw new Error(
      `Firebase Admin SDK JSON not found at ${FIREBASE_ADMIN_JSON_PATH}`,
    );
  }
  const creds = JSON.parse(readFileSync(FIREBASE_ADMIN_JSON_PATH, 'utf8'));
  if (getApps().length === 0) {
    initializeApp({ credential: cert(creds) });
  }
  const auth = getAuth();
  const user = await auth.getUserByEmail(USER_EMAIL);
  ok(`Resolved UID for ${USER_EMAIL}: ${user.uid}`);

  if (user.customClaims?.admin === true) {
    ok('admin: true already set — skipping update');
  } else {
    await auth.setCustomUserClaims(user.uid, {
      ...(user.customClaims ?? {}),
      admin: true,
    });
    await auth.revokeRefreshTokens(user.uid);
    ok('Set admin: true + revoked refresh tokens');
  }
  env.FIREBASE_UID = user.uid;
  // Also compose production service account for Vercel reuse
  env.FIREBASE_ADMIN_CREDENTIALS = readFileSync(
    FIREBASE_ADMIN_JSON_PATH,
    'utf8',
  ).replace(/\n/g, '');
  return user.uid;
}

// ---------- Cronitor: create heartbeat ----------

async function cronitorCreateHeartbeat(): Promise<string> {
  banner('Cronitor: create store-metrics heartbeat');
  const apiKey = env.CRONITOR_API_KEY;
  const basic = Buffer.from(`${apiKey}:`).toString('base64');

  // Cronitor v3: PUT /api/monitors is upsert by key
  const monitor = {
    type: 'heartbeat',
    name: 'store-metrics',
    key: 'store-metrics',
    notify: [],
    schedule: 'every 24 hours',
    grace_seconds: 3600,
  };

  const res = await fetch('https://cronitor.io/api/monitors', {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(monitor),
  });

  if (!res.ok) {
    const body = await res.text();
    fail(`Cronitor PUT /monitors returned ${res.status}: ${body.slice(0, 200)}`);
    throw new Error('Cronitor bootstrap failed');
  }

  const data = (await res.json()) as { key?: string };
  const token = data.key ?? 'store-metrics';
  env.CRONITOR_STORE_METRICS_TOKEN = token;
  ok(`Heartbeat monitor created/updated — token=${token}`);
  return token;
}

// ---------- BetterStack: create monitors ----------

interface BetterStackMonitorConfig {
  url: string;
  pronounceable_name: string;
  check_frequency: number;
  monitor_type: 'status' | 'expected_status_code';
  expected_status_codes?: number[];
}

async function betterStackCreateMonitors() {
  banner('BetterStack: create monitors');
  const token = env.BETTERSTACK_API_KEY;
  const monitors: BetterStackMonitorConfig[] = [
    {
      monitor_type: 'status',
      url: 'https://penny.app/api/healthz',
      pronounceable_name: 'prod-api-healthz',
      check_frequency: 180,
    },
    {
      monitor_type: 'expected_status_code',
      url: 'https://penny.app',
      pronounceable_name: 'prod-web-home',
      check_frequency: 180,
      expected_status_codes: [200, 304],
    },
  ];

  for (const m of monitors) {
    const res = await fetch(
      'https://uptime.betterstack.com/api/v2/monitors',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(m),
      },
    );
    if (res.status === 201) ok(`created: ${m.pronounceable_name}`);
    else if (res.status === 422) ok(`already exists: ${m.pronounceable_name}`);
    else {
      const body = await res.text();
      warn(
        `${m.pronounceable_name} returned ${res.status}: ${body.slice(0, 120)}`,
      );
    }
  }
}

// ---------- Axiom: ensure datasets ----------

async function axiomEnsureDatasets() {
  banner('Axiom: ensure datasets');
  const token = env.AXIOM_TOKEN;
  // Detect region. EU tokens start with xaat- in both regions so we try both.
  const endpoints = ['https://api.axiom.co', 'https://api.eu.axiom.co'];
  let workingBase: string | null = null;
  for (const base of endpoints) {
    const res = await fetch(`${base}/v1/datasets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      workingBase = base;
      break;
    }
  }
  if (!workingBase) {
    warn('Could not list Axiom datasets — token may be ingest-only. Skipping.');
    return;
  }
  ok(`Axiom API reachable at ${workingBase}`);

  for (const name of ['penny-web-prod', 'penny-web-staging']) {
    const res = await fetch(`${workingBase}/v1/datasets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description: 'Penny web logs' }),
    });
    if (res.status === 200 || res.status === 201) ok(`dataset created: ${name}`);
    else if (res.status === 409 || res.status === 422)
      ok(`dataset already exists: ${name}`);
    else {
      const body = await res.text();
      warn(`${name}: ${res.status} ${body.slice(0, 120)}`);
    }
  }
}

// ---------- Vercel: push env vars ----------

interface VercelEnvVar {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type?: 'encrypted' | 'plain';
}

async function vercelUpsertEnv(v: VercelEnvVar) {
  const projectId = env.VERCEL_PROJECT_ID;
  const teamId = env.VERCEL_TEAM_ID;
  const token = env.VERCEL_TOKEN;
  const q = teamId
    ? `?teamId=${encodeURIComponent(teamId)}&upsert=true`
    : '?upsert=true';
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env${q}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: v.key,
        value: v.value,
        type: v.type ?? 'encrypted',
        target: v.target,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    warn(`${v.key}: ${res.status} ${body.slice(0, 160)}`);
    return false;
  }
  return true;
}

async function pushVercelVars() {
  banner('Vercel: upserting env vars');
  const allEnvs: ('production' | 'preview' | 'development')[] = [
    'production',
    'preview',
    'development',
  ];
  const prodOnly: typeof allEnvs = ['production'];
  const prev: typeof allEnvs = ['preview'];

  // Public vars are non-secret, use type: 'plain' so client-side Next.js can embed them.
  const plainPublic: Array<[string, string | undefined]> = [
    ['NEXT_PUBLIC_SENTRY_DSN', env.NEXT_PUBLIC_SENTRY_DSN],
    ['NEXT_PUBLIC_POSTHOG_KEY', env.NEXT_PUBLIC_POSTHOG_KEY],
    ['NEXT_PUBLIC_POSTHOG_HOST', env.NEXT_PUBLIC_POSTHOG_HOST],
    ['NEXT_PUBLIC_APP_URL', env.NEXT_PUBLIC_APP_URL],
  ];
  const encrypted: Array<[string, string | undefined]> = [
    ['SENTRY_AUTH_TOKEN', env.SENTRY_AUTH_TOKEN],
    ['SENTRY_ORG', env.SENTRY_ORG],
    ['SENTRY_PROJECT_WEB', env.SENTRY_PROJECT_WEB],
    ['POSTHOG_PERSONAL_API_KEY', env.POSTHOG_PERSONAL_API_KEY],
    ['POSTHOG_PROJECT_ID', env.POSTHOG_PROJECT_ID],
    ['AXIOM_TOKEN', env.AXIOM_TOKEN],
    ['BETTERSTACK_API_KEY', env.BETTERSTACK_API_KEY],
    ['CRONITOR_API_KEY', env.CRONITOR_API_KEY],
    ['CRONITOR_STORE_METRICS_TOKEN', env.CRONITOR_STORE_METRICS_TOKEN],
    ['DISCORD_WEBHOOK_ALERTS_CRITICAL', env.DISCORD_WEBHOOK_ALERTS_CRITICAL],
    ['DISCORD_WEBHOOK_ALERTS_WARNING', env.DISCORD_WEBHOOK_ALERTS_WARNING],
    ['DISCORD_WEBHOOK_ALERTS_INFO', env.DISCORD_WEBHOOK_ALERTS_INFO],
    ['DISCORD_WEBHOOK_STORE_METRICS', env.DISCORD_WEBHOOK_STORE_METRICS],
    ['ALERT_FORWARD_SECRET', env.ALERT_FORWARD_SECRET],
    ['CRON_SECRET', env.CRON_SECRET],
    ['GITHUB_ISSUE_TOKEN', env.GITHUB_PAT],
    ['GITHUB_ISSUE_REPO', env.GITHUB_ISSUE_REPO],
    ['APP_STORE_CONNECT_APP_ID', env.APP_STORE_CONNECT_APP_ID],
    ['GOOGLE_PLAY_PACKAGE_NAME', env.GOOGLE_PLAY_PACKAGE_NAME],
  ];

  let okCount = 0;
  let failCount = 0;
  for (const [k, v] of plainPublic) {
    if (!v) continue;
    const r = await vercelUpsertEnv({
      key: k,
      value: v,
      target: allEnvs,
      type: 'plain',
    });
    r ? okCount++ : failCount++;
  }
  for (const [k, v] of encrypted) {
    if (!v) continue;
    const r = await vercelUpsertEnv({ key: k, value: v, target: allEnvs });
    r ? okCount++ : failCount++;
  }

  // Kill switch — OFF everywhere until manually flipped to true on prod.
  // Prod-only deployment: no staging env, no preview observability.
  await vercelUpsertEnv({
    key: 'OBSERVABILITY_ENABLED',
    value: 'false',
    target: allEnvs,
    type: 'plain',
  });
  await vercelUpsertEnv({
    key: 'OBSERVABILITY_ENV',
    value: 'production',
    target: prodOnly,
    type: 'plain',
  });
  await vercelUpsertEnv({
    key: 'OBSERVABILITY_ENV',
    value: 'preview',
    target: prev,
    type: 'plain',
  });

  // Axiom dataset: single dataset for all envs (prod-only deployment).
  // Log entries are tagged with env=production|preview|development for filtering.
  await vercelUpsertEnv({
    key: 'AXIOM_DATASET',
    value: 'penny-web-prod',
    target: allEnvs,
    type: 'plain',
  });

  ok(`Vercel upserts: ${okCount} ok, ${failCount} failed`);
}

// ---------- GitHub: push secrets via gh CLI ----------

function ghSecretSet(name: string, value: string): boolean {
  const r = spawnSync(
    'gh',
    ['secret', 'set', name, '--repo', GITHUB_REPO, '--body', value],
    { env: { ...process.env, GH_TOKEN: env.GITHUB_PAT }, stdio: 'pipe' },
  );
  if (r.status === 0) return true;
  warn(
    `gh secret set ${name}: ${(r.stderr ?? '').toString().slice(0, 200)}`,
  );
  return false;
}

function pushGitHubSecrets() {
  banner('GitHub Actions: push secrets');
  const secrets: Record<string, string | undefined> = {
    // Sentry release + symbol upload in CI
    SENTRY_AUTH_TOKEN: env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: env.SENTRY_ORG,
    SENTRY_PROJECT_WEB: env.SENTRY_PROJECT_WEB,
    SENTRY_PROJECT_MOBILE: env.SENTRY_PROJECT_MOBILE,
    SENTRY_DSN_MOBILE: env.SENTRY_DSN_MOBILE,
    // Cronitor for fallback workflows
    CRONITOR_API_KEY: env.CRONITOR_API_KEY,
    // Store metrics fallback workflow
    DISCORD_WEBHOOK_ALERTS_WARNING: env.DISCORD_WEBHOOK_ALERTS_WARNING,
    DISCORD_WEBHOOK_DEPLOYS: env.DISCORD_WEBHOOK_DEPLOYS,
    // Shared bootstrap secret (also in Vercel)
    ALERT_FORWARD_SECRET: env.ALERT_FORWARD_SECRET,
  };
  let okCount = 0;
  let failCount = 0;
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) continue;
    ghSecretSet(k, v) ? okCount++ : failCount++;
  }
  ok(`gh secret set: ${okCount} ok, ${failCount} failed`);
}

// ---------- main ----------

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Observability bootstrap                              ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  await grantFirebaseAdmin();
  await cronitorCreateHeartbeat();
  await betterStackCreateMonitors();
  await axiomEnsureDatasets();
  await pushVercelVars();
  pushGitHubSecrets();

  banner('Summary');
  ok('Firebase admin claim granted');
  ok(`Cronitor heartbeat token: ${env.CRONITOR_STORE_METRICS_TOKEN}`);
  ok('BetterStack monitors registered');
  ok('Vercel env vars upserted');
  ok('GitHub Actions secrets set');
  console.log('');
  console.log('Next steps (manual):');
  console.log('  1. Sign out + sign back in to Penny for the admin claim');
  console.log('     to appear in your ID token.');
  console.log('  2. Smoke-test locally: set OBSERVABILITY_ENABLED=true in');
  console.log('     .env.local, run `npm run dev`, trigger test events, verify');
  console.log('     they appear in Sentry / PostHog / Axiom.');
  console.log('  3. Merge PR #2 — prod deploy goes out with kill switch OFF.');
  console.log('  4. Flip OBSERVABILITY_ENABLED=true in Vercel Production env');
  console.log('     once ready. Monitor closely for first 24h.');
}

main().catch((e) => {
  console.error('\nBootstrap failed:', e);
  process.exit(1);
});
