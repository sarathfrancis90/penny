# Observability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-grade observability foundation (crashes, errors, logs, product analytics, session replay, feature flags, performance, App Store/Play Store metrics, alerting, admin dashboard, staging env, privacy/consent) for Penny web + mobile on $0/month free tiers.

**Architecture:** Layered, vendor-redundant, kill-switched by env flag. Sentry + Crashlytics for crashes. PostHog + Firebase Analytics for product analytics (with separation, no double-firing). pino → Axiom for logs. Firebase Performance + Sentry Performance + Vercel Speed Insights for performance. GitHub Actions + Vercel Cron for App Store / Play Store pulls. Discord + GitHub Issues for alerts. Firebase custom claims for admin auth. STRICT PII masking for session replay.

**Tech Stack:** `@sentry/nextjs`, `sentry_flutter`, `posthog-js`, `posthog_flutter`, `firebase_analytics`, `firebase_performance`, `pino`, Axiom, BetterStack Uptime, Cronitor, Vercel Cron.

**Spec reference:** `/Users/sarathfrancis/.claude/plans/plan-thoroughly-and-splendid-raven.md`

---

## Execution discipline

- **Kill-switch pattern (universal):** Every observability module reads `process.env.OBSERVABILITY_ENABLED`. If not `"true"`, initialization becomes a no-op. This lets us merge all code before any external secrets exist and flip live per-env.
- **TDD:** Every code module gets a test first. Components get React Testing Library tests. API wrappers get integration tests.
- **DRY:** A single `Logger` abstraction wraps pino. A single `Analytics` abstraction wraps PostHog. A single `CrashReporter` wraps Sentry.
- **Commit cadence:** Commit per task. Never batch tasks.
- **Branch:** `feat/observability-foundation`. PRs per phase if desired.
- **Test commands:**
  - Web type-check: `npx tsc --noEmit`
  - Web lint: `npm run lint`
  - Web build: `npm run build`
  - Web tests: `npm test` (Jest/Vitest — verify which is configured in Task 1.1)
  - Mobile tests: `cd mobile && flutter test`
  - Mobile analyze: `cd mobile && flutter analyze --no-fatal-infos`

---

## File structure map

### Web (`src/lib/observability/`)
| File | Responsibility |
|---|---|
| `env.ts` | Centralized env-var access with kill-switch + boolean helpers |
| `logger.ts` | pino-based structured logger. Returns scoped loggers per request |
| `requestId.ts` | `x-request-id` header generation + extraction |
| `withObservability.ts` | Higher-order wrapper for API route handlers |
| `sentryBridge.ts` | Initializes Sentry breadcrumbs bridge to logger |
| `posthog.ts` | Client-side PostHog init. Consent-gated |
| `posthogServer.ts` | Server-side PostHog (optional, feature flag evaluations) |
| `featureFlags.ts` | `isFeatureEnabled(flag, userId)` wrapper |
| `analytics.ts` | `track(event, props)` fan-out to PostHog only |
| `consent.ts` | Consent state + cookie read/write |
| `errors.ts` | `reportError(err, context)` + classification helpers |

### Web components
| File | Responsibility |
|---|---|
| `src/components/observability/ErrorBoundary.tsx` | React ErrorBoundary that reports to Sentry |
| `src/components/observability/ConsentBanner.tsx` | EU/CA consent UI |
| `src/components/observability/PostHogProvider.tsx` | Context provider wiring posthog-js |

### Web API routes
| File | Responsibility |
|---|---|
| `src/app/api/healthz/route.ts` | Liveness probe |
| `src/app/api/alerts/discord-forward/route.ts` | Receives alert webhooks → forwards to GH Issues |
| `src/app/api/cron/store-metrics/route.ts` | Vercel Cron; pulls App Store / Play Store data |
| `src/app/api/privacy/delete-my-data/route.ts` | User data deletion across all processors |
| `src/app/api/admin/error-trends/route.ts` | Proxy to Sentry issue API |
| `src/app/api/admin/user-analytics/route.ts` | Proxy to PostHog insights API |
| `src/app/api/admin/store-metrics/route.ts` | Reads Firestore `store_metrics` |
| `src/app/api/admin/uptime/route.ts` | Proxy to BetterStack status API |

### Sentry config (Next.js convention — must be at repo root)
| File | Responsibility |
|---|---|
| `sentry.client.config.ts` | Client-side Sentry init |
| `sentry.server.config.ts` | Server-side Sentry init |
| `sentry.edge.config.ts` | Edge runtime Sentry init |

### Mobile (`mobile/lib/core/observability/`)
| File | Responsibility |
|---|---|
| `env.dart` | Environment + kill-switch for mobile |
| `crash_reporter.dart` | Wraps Sentry + Crashlytics |
| `analytics.dart` | Wraps PostHog (events only) |
| `feature_flags.dart` | PostHog flag evaluation |
| `user_context.dart` | Sets Sentry/PostHog user on auth change |
| `observability_init.dart` | Orchestrates init in main.dart |

### Mobile flavor config
| File | Responsibility |
|---|---|
| `mobile/lib/core/config/flavor_config.dart` | staging vs prod config |
| `mobile/ios/Runner/GoogleService-Info-Staging.plist` | Staging Firebase iOS config |
| `mobile/android/app/google-services-staging.json` | Staging Firebase Android config |

### Admin auth refactor
| File | Responsibility |
|---|---|
| `src/lib/admin-auth.ts` | Replace HMAC with Firebase custom claims |
| `src/lib/admin-auth-legacy.ts` | Keep old HMAC logic behind feature flag during cutover |
| `scripts/grant-admin.ts` | One-off script to set `admin: true` claim |

### CI/CD
| File | Responsibility |
|---|---|
| `.github/workflows/alert-to-issue.yml` | Discord → GH Issue |
| `.github/workflows/store-metrics-fallback.yml` | Nightly cron as safety net |
| `.github/CODEOWNERS` | Require human review on critical paths |
| `.github/pull_request_template.md` | PR checklist |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug template |
| `.github/ISSUE_TEMPLATE/observability_alert.md` | Auto-generated alert template |
| `vercel.json` | Vercel Cron schedule for store-metrics |

### Docs
| File | Responsibility |
|---|---|
| `PRIVACY.md` | User-facing privacy policy |
| `docs/observability/STACK.md` | Runbook |
| `docs/observability/STAGING.md` | Staging promotion runbook |
| `docs/observability/SETUP.md` | One-time setup for Phase 0 (user-executed) |

### Types
| File | Responsibility |
|---|---|
| `src/lib/types/store-metrics.ts` | Store metrics schema |
| `src/lib/types/observability.ts` | Shared observability types |

### Modified files
- `src/app/layout.tsx` — wrap with ErrorBoundary + PostHogProvider + ConsentBanner
- `src/app/dashboard/layout.tsx`, `budgets/layout.tsx`, `groups/layout.tsx`, `income/layout.tsx`, `savings/layout.tsx` — per-route ErrorBoundary
- `src/app/admin-console/page.tsx` — new panels
- `src/app/api/**/route.ts` — wrap with `withObservability`
- `src/components/ExpenseForm.tsx`, `AIChat.tsx`, `BudgetForm.tsx`, `GroupMembersList.tsx` — `data-ph-no-capture`
- `src/lib/admin-auth.ts` — auth migration
- `next.config.ts` — `withSentryConfig`
- `package.json` — new deps
- `mobile/pubspec.yaml` — new deps
- `mobile/lib/main.dart` — wire observability init
- `mobile/lib/app.dart` — user context on auth change
- `mobile/ios/Runner/GoogleService-Info.plist` — flip `IS_ANALYTICS_ENABLED` to `true`
- `mobile/fastlane/Fastfile` — Sentry release + symbol upload lanes
- `.github/workflows/mobile-release.yml` — wire Sentry release
- `.github/workflows/backend-tests.yml` — Sentry source map verification
- `database/firestore.rules` — admin custom claim + store_metrics rules
- `CLAUDE.md` — observability pointers

---

## Phase 0 — Foundation prerequisites (manual user actions)

**This phase is blocking for end-to-end verification but non-blocking for code development.** Every piece of code in Phases 1-9 is designed to no-op gracefully without env vars, so implementation proceeds without waiting. Mark these as done when complete, then set env vars and flip `OBSERVABILITY_ENABLED=true`.

### Task 0.1: Create Sentry account + org + EU-region projects

**User actions (cannot be done from CLI):**
- Sign up at https://sentry.io (select EU region at signup — this is irreversible per account).
- Create org: `penny-ai` (or existing).
- Create 2 projects: `penny-web` (platform: Next.js), `penny-mobile` (platform: Flutter).
- From each project's "Client Keys (DSN)" settings, copy the **DSN URL**.
- From User Settings → Account → API → Auth Tokens, create a token with scopes: `project:read`, `project:releases`, `org:read`. Save as `SENTRY_AUTH_TOKEN`.
- Record:
  - `SENTRY_DSN_WEB`, `SENTRY_DSN_WEB_STAGING` (same project, can use same DSN; env differentiation via `environment` config)
  - `SENTRY_DSN_MOBILE`, `SENTRY_DSN_MOBILE_STAGING`
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG` = `penny-ai`
  - `SENTRY_PROJECT_WEB` = `penny-web`
  - `SENTRY_PROJECT_MOBILE` = `penny-mobile`

- [ ] Completed by user. Values added to a secure password manager.

### Task 0.2: Create PostHog account + EU project

**User actions:**
- Sign up at https://eu.posthog.com (EU region).
- Create project: `penny-prod`. Copy **Project API Key** (starts with `phc_`). Save as `POSTHOG_KEY_WEB` and `POSTHOG_KEY_MOBILE` (same key works for both; `host` determines region).
- Create a second project: `penny-staging`. Copy its API key as `POSTHOG_KEY_WEB_STAGING` + `POSTHOG_KEY_MOBILE_STAGING`.
- From Project Settings → Personal API Keys, create a key with `projects:read` + `insight:read`. Save as `POSTHOG_PERSONAL_API_KEY`.
- Host URL is `https://eu.i.posthog.com`.

- [ ] Completed by user.

### Task 0.3: Create Axiom account + datasets

**User actions:**
- Sign up at https://axiom.co (EU region available at signup).
- Create 2 datasets: `penny-web-prod`, `penny-web-staging`.
- From Settings → API Tokens, create an **Ingest Token** scoped to both datasets. Save as `AXIOM_TOKEN`.
- Record `AXIOM_ORG_ID` (from URL).

- [ ] Completed by user.

### Task 0.4: Create BetterStack Uptime account

**User actions:**
- Sign up at https://betterstack.com/uptime.
- Create workspace `penny`. Don't create monitors yet — `scripts/bootstrap-uptime.ts` (Task 7.x) will do it via API.
- From Team Settings → API Tokens, create token. Save as `BETTERSTACK_API_KEY`.

- [ ] Completed by user.

### Task 0.5: Create Cronitor account

**User actions:**
- Sign up at https://cronitor.io (free tier).
- Create monitor `store-metrics` (type: heartbeat). Copy the ping URL's token segment as `CRONITOR_STORE_METRICS_TOKEN`.
- From Settings → API Keys, copy `CRONITOR_API_KEY`.

- [ ] Completed by user.

### Task 0.6: Create Discord server + webhooks

**User actions:**
- Create Discord server: `Penny Ops` (or use existing personal server).
- Create channels: `#alerts-critical`, `#alerts-warning`, `#alerts-info`, `#store-metrics`, `#deploys`.
- For each channel, Server Settings → Integrations → Webhooks → Create Webhook. Copy URLs:
  - `DISCORD_WEBHOOK_ALERTS_CRITICAL`
  - `DISCORD_WEBHOOK_ALERTS_WARNING`
  - `DISCORD_WEBHOOK_ALERTS_INFO`
  - `DISCORD_WEBHOOK_STORE_METRICS`
  - `DISCORD_WEBHOOK_DEPLOYS`

- [ ] Completed by user.

### Task 0.7: Create `penny-staging` Firebase project

**User actions:**
- Firebase Console → "Add project" → name `penny-staging` → link to Google Analytics.
- Enable: Firestore (prod mode), Auth (Email/Password + Passkeys if using), Storage, Cloud Messaging, Performance Monitoring, Crashlytics, Analytics.
- Project Settings → Service accounts → Generate new private key → download JSON → base64-encode → save as `FIREBASE_SERVICE_ACCOUNT_STAGING_JSON_BASE64`.
- Project Settings → General → Your apps:
  - Add iOS app: bundle ID `com.pennyai.penny.staging`. Download `GoogleService-Info.plist` → rename `GoogleService-Info-Staging.plist`.
  - Add Android app: package name `com.pennyai.penny.staging`. Download `google-services.json` → rename `google-services-staging.json`.
  - Add Web app: name `Penny Web Staging`. Copy all `NEXT_PUBLIC_FIREBASE_*_STAGING` env vars.
- Record:
  - `FIREBASE_PROJECT_ID_STAGING` = `penny-staging`
  - All `NEXT_PUBLIC_FIREBASE_*_STAGING` web config values
  - `FIREBASE_SERVICE_ACCOUNT_STAGING_JSON_BASE64`

- [ ] Completed by user. Plist/JSON files placed at paths documented in Task 3.13 / 3.14.

### Task 0.8: Register staging App Store bundle ID

**User actions (optional until mobile staging testing):**
- Apple Developer → Identifiers → Add → Bundle ID `com.pennyai.penny.staging` (Explicit).
- App Store Connect → Apps → New App → `Penny Staging` → bundle ID `com.pennyai.penny.staging`. (Staging builds will upload to TestFlight but are not published.)

- [ ] Completed by user.

### Task 0.9: Google Play Developer API access

**User actions:**
- Google Play Console → Setup → API access. If not already linked to a Cloud project, link one.
- Create service account (or reuse existing from `PLAY_STORE_KEY_JSON` secret).
- Grant permissions: "View app information (read-only)" + "Manage store listing" on the app.
- Confirm the existing `PLAY_STORE_KEY_JSON` secret includes sufficient permissions for `androidpublisher.reviews.list` and `androidpublisher.applications.get`. If not, generate a new key.
- Save as `GOOGLE_PLAY_API_JSON_BASE64` (base64-encoded).

- [ ] Completed by user.

### Task 0.10: App Store Connect API key for metrics

**User actions:**
- Reuse existing `ASC_API_KEY_P8` + `APP_STORE_CONNECT_KEY_ID` + `APP_STORE_CONNECT_ISSUER_ID` from mobile-release pipeline. Confirm the key has `Sales and Reports` access. If not, generate a new key with `Admin` role (or narrower `Sales`).
- Save keys as:
  - `APP_STORE_CONNECT_KEY_ID`
  - `APP_STORE_CONNECT_ISSUER_ID`
  - `APP_STORE_CONNECT_P8_BASE64`

- [ ] Completed by user.

### Task 0.11: Paste all secrets into GitHub + Vercel

**User actions:**

GitHub repo → Settings → Secrets and variables → Actions → New repository secret. Add every secret listed above.

Vercel project → Settings → Environment Variables. Add the following, **scoped to Production + Preview**:
- `NEXT_PUBLIC_SENTRY_DSN` = `SENTRY_DSN_WEB`
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`
- `NEXT_PUBLIC_POSTHOG_KEY` = `POSTHOG_KEY_WEB`
- `NEXT_PUBLIC_POSTHOG_HOST` = `https://eu.i.posthog.com`
- `POSTHOG_PERSONAL_API_KEY`
- `AXIOM_TOKEN`, `AXIOM_ORG_ID`
- `DISCORD_WEBHOOK_ALERTS_CRITICAL`, `_WARNING`, `_INFO`, `_STORE_METRICS`, `_DEPLOYS`
- `BETTERSTACK_API_KEY`
- `CRONITOR_API_KEY`, `CRONITOR_STORE_METRICS_TOKEN`
- `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_P8_BASE64`
- `GOOGLE_PLAY_API_JSON_BASE64`
- `FIREBASE_SERVICE_ACCOUNT_STAGING_JSON_BASE64`
- Staging-scoped: all `NEXT_PUBLIC_FIREBASE_*_STAGING`
- `OBSERVABILITY_ENABLED` = `false` initially (flip to `true` at end of rollout)
- `OBSERVABILITY_ENV` = `production` / `preview` / `staging` accordingly

Vercel → Integrations → Install **Axiom** → connect to `penny-web-prod` dataset for production environment, `penny-web-staging` for preview. This creates the log drain.

- [ ] Completed by user.

### Task 0.12: Write docs/observability/SETUP.md capturing all above steps

**Files:**
- Create: `docs/observability/SETUP.md`

- [ ] **Step 1: Author the setup runbook**

```markdown
# Observability Setup Runbook (Phase 0)

This runbook captures the one-time manual steps required before
observability code can connect to real services. Execute in order.

## Prerequisites checklist

- [ ] Sentry EU account + projects (0.1)
- [ ] PostHog EU project + personal API key (0.2)
- [ ] Axiom EU datasets (0.3)
- [ ] BetterStack workspace (0.4)
- [ ] Cronitor heartbeat monitor (0.5)
- [ ] Discord server + webhooks (0.6)
- [ ] penny-staging Firebase project + plists (0.7)
- [ ] App Store staging bundle ID (0.8) — optional
- [ ] Google Play service account (0.9)
- [ ] App Store Connect API key (0.10)
- [ ] GitHub + Vercel secrets pasted (0.11)

## Secrets inventory

(Table mirroring plan Task 0.11 with exact env var names.)

## Rotation schedule

- Sentry auth token: 90 days
- PostHog personal API key: 90 days
- Axiom ingest token: 180 days
- Firebase service accounts: 365 days

## Verification

After all secrets pasted, run the smoke test in `docs/observability/STAGING.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/observability/SETUP.md
git commit -m "docs: observability Phase 0 setup runbook"
```

---

## Phase 1 — Crash & error tracking (Sentry + Crashlytics)

### Task 1.1: Verify web test runner and install deps

**Files:**
- Read: `package.json`
- Modify: `package.json`

- [ ] **Step 1: Check package.json for existing test framework**

Run: `cat package.json | grep -E "\"(test|vitest|jest|playwright)\""`
Expected: either a test script exists or none; determine which to add.

- [ ] **Step 2: If no test framework, add Vitest + React Testing Library**

Install:

```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

Create `vitest.config.ts` at repo root:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Install Sentry**

```bash
npm install @sentry/nextjs
```

- [ ] **Step 4: Run the baseline type-check + lint to confirm nothing broke**

```bash
npx tsc --noEmit && npm run lint
```
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "chore(observability): add Vitest + @sentry/nextjs"
```

### Task 1.2: Environment module with kill-switch

**Files:**
- Create: `src/lib/observability/env.ts`
- Create: `src/lib/observability/__tests__/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/__tests__/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isObservabilityEnabled, getObservabilityEnv, getSentryDsn } from '../env';

describe('observability/env', () => {
  const original = { ...process.env };
  beforeEach(() => { process.env = { ...original }; });
  afterEach(() => { process.env = original; });

  it('isObservabilityEnabled returns false when flag unset', () => {
    delete process.env.OBSERVABILITY_ENABLED;
    expect(isObservabilityEnabled()).toBe(false);
  });

  it('isObservabilityEnabled returns true only for literal "true"', () => {
    process.env.OBSERVABILITY_ENABLED = 'true';
    expect(isObservabilityEnabled()).toBe(true);
    process.env.OBSERVABILITY_ENABLED = 'True';
    expect(isObservabilityEnabled()).toBe(false);
    process.env.OBSERVABILITY_ENABLED = '1';
    expect(isObservabilityEnabled()).toBe(false);
  });

  it('getObservabilityEnv defaults to development', () => {
    delete process.env.OBSERVABILITY_ENV;
    expect(getObservabilityEnv()).toBe('development');
  });

  it('getObservabilityEnv returns configured value', () => {
    process.env.OBSERVABILITY_ENV = 'staging';
    expect(getObservabilityEnv()).toBe('staging');
  });

  it('getSentryDsn returns null when absent', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(getSentryDsn()).toBeNull();
  });

  it('getSentryDsn returns string when present', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/2';
    expect(getSentryDsn()).toBe('https://abc@o1.ingest.sentry.io/2');
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

Run: `npm test -- env.test`
Expected: FAIL with "Cannot find module '../env'"

- [ ] **Step 3: Implement env module**

```ts
// src/lib/observability/env.ts
export type ObservabilityEnv = 'development' | 'staging' | 'production' | 'preview';

export function isObservabilityEnabled(): boolean {
  return process.env.OBSERVABILITY_ENABLED === 'true';
}

export function getObservabilityEnv(): ObservabilityEnv {
  const v = process.env.OBSERVABILITY_ENV;
  if (v === 'staging' || v === 'production' || v === 'preview') return v;
  return 'development';
}

export function getSentryDsn(): string | null {
  return process.env.NEXT_PUBLIC_SENTRY_DSN ?? null;
}

export function getSentryAuthToken(): string | null {
  return process.env.SENTRY_AUTH_TOKEN ?? null;
}

export function getSentryOrg(): string | null {
  return process.env.SENTRY_ORG ?? null;
}

export function getSentryProject(): string | null {
  return process.env.SENTRY_PROJECT_WEB ?? null;
}

export function getPostHogKey(): string | null {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY ?? null;
}

export function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
}

export function getRelease(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GITHUB_SHA
    ?? process.env.NEXT_PUBLIC_RELEASE
    ?? 'unknown';
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- env.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/env.ts src/lib/observability/__tests__/env.test.ts
git commit -m "feat(observability): env + kill-switch module"
```

### Task 1.3: Request ID helper

**Files:**
- Create: `src/lib/observability/requestId.ts`
- Create: `src/lib/observability/__tests__/requestId.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/__tests__/requestId.test.ts
import { describe, it, expect } from 'vitest';
import { generateRequestId, extractRequestId, REQUEST_ID_HEADER } from '../requestId';

describe('observability/requestId', () => {
  it('generates UUIDv4-shaped ids', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates distinct ids each call', () => {
    expect(generateRequestId()).not.toBe(generateRequestId());
  });

  it('extracts id from header', () => {
    const h = new Headers({ [REQUEST_ID_HEADER]: 'abc' });
    expect(extractRequestId(h)).toBe('abc');
  });

  it('returns null if header missing', () => {
    expect(extractRequestId(new Headers())).toBeNull();
  });

  it('REQUEST_ID_HEADER is lowercase x-request-id', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- requestId.test`
Expected: FAIL "Cannot find module '../requestId'".

- [ ] **Step 3: Implement**

```ts
// src/lib/observability/requestId.ts
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export function generateRequestId(): string {
  return randomUUID();
}

export function extractRequestId(headers: Headers): string | null {
  return headers.get(REQUEST_ID_HEADER);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- requestId.test`

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/requestId.ts src/lib/observability/__tests__/requestId.test.ts
git commit -m "feat(observability): request id helper"
```

### Task 1.4: pino logger with kill-switch

**Files:**
- Create: `src/lib/observability/logger.ts`
- Create: `src/lib/observability/__tests__/logger.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install pino**

```bash
npm install pino
npm install --save-dev pino-pretty
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/observability/__tests__/logger.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger } from '../logger';

describe('observability/logger', () => {
  beforeEach(() => {
    process.env.OBSERVABILITY_ENABLED = 'true';
  });

  it('createLogger returns a logger with child()', () => {
    const logger = createLogger('test-route');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('child logger inherits bindings', () => {
    const base = createLogger('r');
    const child = base.child({ request_id: 'abc' });
    expect(child.bindings().request_id).toBe('abc');
  });

  it('logger still works when observability disabled (no-op)', () => {
    process.env.OBSERVABILITY_ENABLED = 'false';
    const logger = createLogger('r');
    expect(() => logger.info('hello')).not.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `npm test -- logger.test`

- [ ] **Step 4: Implement**

```ts
// src/lib/observability/logger.ts
import pino, { Logger } from 'pino';
import { getObservabilityEnv, isObservabilityEnabled } from './env';

const isDev = process.env.NODE_ENV !== 'production';

const baseLogger = pino({
  level: isObservabilityEnabled() ? 'info' : 'silent',
  base: {
    env: getObservabilityEnv(),
    service: 'penny-web',
  },
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
      'amount',
      'vendor',
    ],
    censor: '[redacted]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
      }
    : undefined,
});

export function createLogger(route: string): Logger {
  return baseLogger.child({ route });
}

export type { Logger };
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- logger.test`

- [ ] **Step 6: Commit**

```bash
git add src/lib/observability/logger.ts src/lib/observability/__tests__/logger.test.ts package.json package-lock.json
git commit -m "feat(observability): pino structured logger with PII redaction"
```

### Task 1.5: Sentry server config

**Files:**
- Create: `sentry.server.config.ts`

- [ ] **Step 1: Implement**

```ts
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';
import {
  getSentryDsn,
  isObservabilityEnabled,
  getObservabilityEnv,
  getRelease,
} from './src/lib/observability/env';

const dsn = getSentryDsn();

if (isObservabilityEnabled() && dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnv(),
    release: getRelease(),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
}
```

- [ ] **Step 2: Verify build still succeeds**

Run: `npx tsc --noEmit`
Expected: passes (the file type-checks against `@sentry/nextjs`).

- [ ] **Step 3: Commit**

```bash
git add sentry.server.config.ts
git commit -m "feat(sentry): server-side config with kill-switch"
```

### Task 1.6: Sentry edge config

**Files:**
- Create: `sentry.edge.config.ts`

- [ ] **Step 1: Implement**

```ts
// sentry.edge.config.ts
import * as Sentry from '@sentry/nextjs';
import {
  getSentryDsn,
  isObservabilityEnabled,
  getObservabilityEnv,
  getRelease,
} from './src/lib/observability/env';

const dsn = getSentryDsn();
if (isObservabilityEnabled() && dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnv(),
    release: getRelease(),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add sentry.edge.config.ts
git commit -m "feat(sentry): edge config"
```

### Task 1.7: Sentry client config

**Files:**
- Create: `sentry.client.config.ts`

- [ ] **Step 1: Implement**

```ts
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';
import {
  getSentryDsn,
  isObservabilityEnabled,
  getObservabilityEnv,
  getRelease,
} from './src/lib/observability/env';

const dsn = getSentryDsn();
if (isObservabilityEnabled() && dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnv(),
    release: getRelease(),
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllInputs: true,
        maskAllText: false,
        blockAllMedia: true,
      }),
    ],
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add sentry.client.config.ts
git commit -m "feat(sentry): client config with session replay masking"
```

### Task 1.8: Wrap next.config.ts with withSentryConfig

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Read current next.config.ts to know full contents**

Run: `cat next.config.ts`

- [ ] **Step 2: Wrap export with withSentryConfig**

Edit `next.config.ts` — change the final export from `export default withPWA(nextConfig);` (or similar) to:

```ts
import { withSentryConfig } from '@sentry/nextjs';
// ... existing imports and nextConfig definition ...

const baseExport = withPWA(nextConfig); // or whatever was exported

export default withSentryConfig(baseExport, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
```

Keep existing PWA config intact.

- [ ] **Step 3: Confirm type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Confirm build succeeds (takes ~1min)**

Run: `npm run build`
Expected: succeeds. If `SENTRY_AUTH_TOKEN` is unset, `@sentry/nextjs` prints a warning but build succeeds.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts
git commit -m "feat(sentry): wrap next.config with withSentryConfig"
```

### Task 1.9: Error reporting helper

**Files:**
- Create: `src/lib/observability/errors.ts`
- Create: `src/lib/observability/__tests__/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/__tests__/errors.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { reportError, classifyError } from '../errors';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  withScope: vi.fn((cb) => cb({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
}));

describe('observability/errors', () => {
  it('classifyError distinguishes user vs system', () => {
    const userErr = Object.assign(new Error('Bad input'), { code: 'VALIDATION' });
    expect(classifyError(userErr)).toBe('user');
    const sysErr = new Error('Firestore unavailable');
    expect(classifyError(sysErr)).toBe('system');
  });

  it('reportError calls Sentry.captureException when enabled', () => {
    process.env.OBSERVABILITY_ENABLED = 'true';
    reportError(new Error('boom'), { userId: 'u1', route: '/api/x' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('reportError no-ops when disabled', () => {
    process.env.OBSERVABILITY_ENABLED = 'false';
    vi.mocked(Sentry.captureException).mockClear();
    reportError(new Error('boom'), {});
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/observability/errors.ts
import * as Sentry from '@sentry/nextjs';
import { isObservabilityEnabled } from './env';

export type ErrorClass = 'user' | 'system';

export interface ErrorContext {
  userId?: string;
  route?: string;
  requestId?: string;
  extra?: Record<string, unknown>;
}

export function classifyError(err: unknown): ErrorClass {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    if (['VALIDATION', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(code)) {
      return 'user';
    }
  }
  return 'system';
}

export function reportError(err: unknown, ctx: ErrorContext): void {
  if (!isObservabilityEnabled()) return;
  Sentry.withScope((scope) => {
    scope.setTag('error.class', classifyError(err));
    if (ctx.route) scope.setTag('route', ctx.route);
    if (ctx.requestId) scope.setTag('request_id', ctx.requestId);
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.extra) scope.setContext('extra', ctx.extra);
    Sentry.captureException(err);
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- errors.test`

- [ ] **Step 4: Commit**

```bash
git add src/lib/observability/errors.ts src/lib/observability/__tests__/errors.test.ts
git commit -m "feat(observability): error reporter with user/system classification"
```

### Task 1.10: withObservability API route wrapper

**Files:**
- Create: `src/lib/observability/withObservability.ts`
- Create: `src/lib/observability/__tests__/withObservability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/__tests__/withObservability.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { withObservability } from '../withObservability';

vi.mock('@sentry/nextjs', () => ({
  startSpan: vi.fn((_opts, cb) => cb({ setAttribute: vi.fn() })),
  captureException: vi.fn(),
  withScope: vi.fn((cb) => cb({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
}));

const mkReq = () => new NextRequest('http://localhost/api/x');

describe('withObservability', () => {
  it('returns the handler result unchanged on success', async () => {
    const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    const wrapped = withObservability(handler, { route: '/api/x' });
    const res = await wrapped(mkReq());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('adds x-request-id response header', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withObservability(handler, { route: '/api/x' });
    const res = await wrapped(mkReq());
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('captures thrown errors and returns 500 JSON', async () => {
    const handler = vi.fn(async () => { throw new Error('boom'); });
    const wrapped = withObservability(handler, { route: '/api/x' });
    const res = await wrapped(mkReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(body.requestId).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/observability/withObservability.ts
import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createLogger, Logger } from './logger';
import { generateRequestId, extractRequestId, REQUEST_ID_HEADER } from './requestId';
import { reportError } from './errors';
import { isObservabilityEnabled } from './env';

export interface ObservabilityContext {
  route: string;
  logger: Logger;
  requestId: string;
  userId?: string;
}

type Handler = (req: NextRequest, ctx: ObservabilityContext) => Promise<Response> | Response;
type PlainHandler = (req: NextRequest) => Promise<Response> | Response;

export function withObservability(
  handler: Handler | PlainHandler,
  opts: { route: string }
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = extractRequestId(req.headers) ?? generateRequestId();
    const logger = createLogger(opts.route).child({ request_id: requestId });
    const ctx: ObservabilityContext = { route: opts.route, logger, requestId };
    const start = Date.now();

    const execute = async (): Promise<Response> => {
      try {
        logger.info({ method: req.method, url: req.url }, 'request.start');
        const res = await (handler as Handler)(req, ctx);
        const headers = new Headers(res.headers);
        headers.set(REQUEST_ID_HEADER, requestId);
        const duration_ms = Date.now() - start;
        logger.info({ status: res.status, duration_ms }, 'request.end');
        return new Response(res.body, { status: res.status, headers });
      } catch (err) {
        const duration_ms = Date.now() - start;
        logger.error({ err, duration_ms }, 'request.error');
        reportError(err, { route: opts.route, requestId, userId: ctx.userId });
        const errBody = JSON.stringify({ error: 'Internal server error', requestId });
        return new Response(errBody, {
          status: 500,
          headers: { 'Content-Type': 'application/json', [REQUEST_ID_HEADER]: requestId },
        });
      }
    };

    if (!isObservabilityEnabled()) return execute();
    return Sentry.startSpan({ name: opts.route, op: 'http.server' }, () => execute());
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- withObservability.test`

- [ ] **Step 4: Commit**

```bash
git add src/lib/observability/withObservability.ts src/lib/observability/__tests__/withObservability.test.ts
git commit -m "feat(observability): withObservability HOF for API routes"
```

### Task 1.11: Apply withObservability to /api/healthz + smoke test

**Files:**
- Create: `src/app/api/healthz/route.ts`
- Create: `src/app/api/healthz/__tests__/route.test.ts`

- [ ] **Step 1: Write test**

```ts
// src/app/api/healthz/__tests__/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true }) }) }) },
}));

import { GET } from '../route';

describe('/api/healthz', () => {
  it('returns 200 with ok payload', async () => {
    const res = await GET(new NextRequest('http://localhost/api/healthz'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.firestore).toBeDefined();
    expect(body.timestamp).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/app/api/healthz/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { adminDb } from '@/lib/firebase-admin';

async function handler(_req: NextRequest) {
  let firestore: 'ok' | 'error' = 'ok';
  try {
    await adminDb.collection('_healthz').doc('ping').get();
  } catch {
    firestore = 'error';
  }
  return new Response(
    JSON.stringify({ status: firestore === 'ok' ? 'ok' : 'degraded', firestore, timestamp: new Date().toISOString() }),
    { status: firestore === 'ok' ? 200 : 503, headers: { 'Content-Type': 'application/json' } }
  );
}

export const GET = withObservability(handler, { route: '/api/healthz' });
```

- [ ] **Step 3: Run tests**

Run: `npm test -- healthz`

- [ ] **Step 4: Run dev server + hit endpoint manually**

```bash
npm run dev &
sleep 5
curl -sS http://localhost:3000/api/healthz | head -50
kill %1
```
Expected: JSON with `"status":"ok"` and `x-request-id` header present.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/healthz/route.ts src/app/api/healthz/__tests__/route.test.ts
git commit -m "feat: /api/healthz liveness endpoint wired to withObservability"
```

### Task 1.12: React ErrorBoundary component

**Files:**
- Create: `src/components/observability/ErrorBoundary.tsx`
- Create: `src/components/observability/__tests__/ErrorBoundary.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/components/observability/__tests__/ErrorBoundary.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';
import * as Sentry from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

const Bomb = () => { throw new Error('boom'); };

describe('ErrorBoundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders children when no error', () => {
    render(<ErrorBoundary fallbackLabel="Test"><div>child</div></ErrorBoundary>);
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('renders fallback and reports when child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary fallbackLabel="Feature X"><Bomb /></ErrorBoundary>);
    expect(screen.getByText(/Feature X/i)).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/observability/ErrorBoundary.tsx
'use client';

import React, { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
      tags: { boundary: this.props.fallbackLabel ?? 'unknown' },
    });
  }

  handleReset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-900">
        <h2 className="font-semibold mb-2">{this.props.fallbackLabel ?? 'Something went wrong'}</h2>
        <p className="text-sm mb-3">We've been notified. Try refreshing; your data is safe.</p>
        <button onClick={this.handleReset} className="text-sm underline">Retry</button>
      </div>
    );
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- ErrorBoundary`

- [ ] **Step 4: Commit**

```bash
git add src/components/observability/ErrorBoundary.tsx src/components/observability/__tests__/ErrorBoundary.test.tsx
git commit -m "feat(observability): React ErrorBoundary reporting to Sentry"
```

### Task 1.13: Wire root + per-route ErrorBoundary

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/dashboard/layout.tsx` (create if missing)
- Modify: `src/app/budgets/layout.tsx` (create if missing)
- Modify: `src/app/groups/layout.tsx` (create if missing)
- Modify: `src/app/income/layout.tsx` (create if missing)
- Modify: `src/app/savings/layout.tsx` (create if missing)

- [ ] **Step 1: Read `src/app/layout.tsx` to see current shape**

Run: `cat src/app/layout.tsx`

- [ ] **Step 2: Add root ErrorBoundary around children**

In the returned JSX, wrap `{children}` with `<ErrorBoundary fallbackLabel="Application">{children}</ErrorBoundary>`. Add import `import { ErrorBoundary } from '@/components/observability/ErrorBoundary';`.

- [ ] **Step 3: For each feature route, create/modify layout.tsx**

Template (adapt to existing layouts if they exist):

```tsx
// src/app/<feature>/layout.tsx
import { ErrorBoundary } from '@/components/observability/ErrorBoundary';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary fallbackLabel="<Feature Name>">{children}</ErrorBoundary>;
}
```

For each of: dashboard, budgets, groups, income, savings.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/dashboard/layout.tsx src/app/budgets/layout.tsx src/app/groups/layout.tsx src/app/income/layout.tsx src/app/savings/layout.tsx
git commit -m "feat(observability): per-route error boundaries"
```

### Task 1.14: Sentry user context hook (web)

**Files:**
- Create: `src/hooks/useSentryUser.ts`

- [ ] **Step 1: Implement**

```ts
// src/hooks/useSentryUser.ts
'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function useSentryUser() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      Sentry.setUser(user ? { id: user.uid } : null);
    });
    return () => unsub();
  }, []);
}
```

- [ ] **Step 2: Wire into layout**

In `src/app/layout.tsx`, create a client component sibling that calls `useSentryUser()` and include it under the root ErrorBoundary.

```tsx
// src/components/observability/SentryUserBoundary.tsx
'use client';
import { useSentryUser } from '@/hooks/useSentryUser';
export function SentryUserBoundary() {
  useSentryUser();
  return null;
}
```

Add `<SentryUserBoundary />` inside the root layout's `<body>`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSentryUser.ts src/components/observability/SentryUserBoundary.tsx src/app/layout.tsx
git commit -m "feat(sentry): set user id on auth state change"
```

### Task 1.15: Mobile — add sentry_flutter + init

**Files:**
- Modify: `mobile/pubspec.yaml`
- Modify: `mobile/lib/main.dart`
- Create: `mobile/lib/core/observability/env.dart`
- Create: `mobile/lib/core/observability/crash_reporter.dart`

- [ ] **Step 1: Add deps to pubspec.yaml**

Under `dependencies:`:

```yaml
  sentry_flutter: ^9.0.0
```

Run: `cd mobile && flutter pub get`

- [ ] **Step 2: Implement env + crash_reporter**

```dart
// mobile/lib/core/observability/env.dart
class ObservabilityEnv {
  static const bool enabled = bool.fromEnvironment('OBSERVABILITY_ENABLED', defaultValue: false);
  static const String env = String.fromEnvironment('OBSERVABILITY_ENV', defaultValue: 'development');
  static const String sentryDsn = String.fromEnvironment('SENTRY_DSN_MOBILE', defaultValue: '');
  static const String posthogKey = String.fromEnvironment('POSTHOG_KEY_MOBILE', defaultValue: '');
  static const String posthogHost = String.fromEnvironment('POSTHOG_HOST', defaultValue: 'https://eu.i.posthog.com');
  static const String release = String.fromEnvironment('RELEASE', defaultValue: 'unknown');
}
```

```dart
// mobile/lib/core/observability/crash_reporter.dart
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:flutter/foundation.dart';
import 'env.dart';

class CrashReporter {
  static Future<void> init(Future<void> Function() appRunner) async {
    if (!ObservabilityEnv.enabled || ObservabilityEnv.sentryDsn.isEmpty) {
      await appRunner();
      return;
    }
    await SentryFlutter.init(
      (options) {
        options.dsn = ObservabilityEnv.sentryDsn;
        options.environment = ObservabilityEnv.env;
        options.release = ObservabilityEnv.release;
        options.tracesSampleRate = 0.1;
        options.attachScreenshot = false;
        options.sendDefaultPii = false;
        options.beforeSend = (event, {hint}) {
          return event.copyWith(request: event.request?.copyWith(cookies: null, headers: null));
        };
      },
      appRunner: appRunner,
    );
  }

  static Future<void> recordFlutterError(FlutterErrorDetails details) async {
    await Sentry.captureException(details.exception, stackTrace: details.stack);
  }

  static Future<void> recordError(Object err, StackTrace stack) async {
    await Sentry.captureException(err, stackTrace: stack);
  }
}
```

- [ ] **Step 3: Wire into main.dart**

Read current `mobile/lib/main.dart`. Wrap the existing `runApp` call inside `CrashReporter.init(() async { ... runApp(...); });`. Keep existing `FirebaseCrashlytics.instance.recordFlutterFatalError` — Sentry and Crashlytics run parallel.

```dart
// Sketch of the structure — adapt to existing main.dart shape
import 'core/observability/crash_reporter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(...);
  FlutterError.onError = (details) {
    FirebaseCrashlytics.instance.recordFlutterFatalError(details);
    CrashReporter.recordFlutterError(details);
  };
  PlatformDispatcher.instance.onError = (err, stack) {
    FirebaseCrashlytics.instance.recordError(err, stack, fatal: true);
    CrashReporter.recordError(err, stack);
    return true;
  };
  await CrashReporter.init(() async {
    runApp(const ProviderScope(child: PennyApp()));
  });
}
```

- [ ] **Step 4: Run analyzer**

Run: `cd mobile && flutter analyze --no-fatal-infos`
Expected: passes.

- [ ] **Step 5: Run tests**

Run: `cd mobile && flutter test`

- [ ] **Step 6: Commit**

```bash
git add mobile/pubspec.yaml mobile/pubspec.lock mobile/lib/core/observability/ mobile/lib/main.dart
git commit -m "feat(mobile): Sentry init alongside Crashlytics"
```

### Task 1.16: Mobile user context on auth change

**Files:**
- Create: `mobile/lib/core/observability/user_context.dart`
- Modify: `mobile/lib/app.dart` or wherever auth state is observed

- [ ] **Step 1: Implement user context helper**

```dart
// mobile/lib/core/observability/user_context.dart
import 'package:sentry_flutter/sentry_flutter.dart';
import 'env.dart';

class UserContext {
  static Future<void> setUser(String? uid) async {
    if (!ObservabilityEnv.enabled) return;
    if (uid == null) {
      await Sentry.configureScope((s) => s.setUser(null));
    } else {
      await Sentry.configureScope((s) => s.setUser(SentryUser(id: uid)));
    }
  }
}
```

- [ ] **Step 2: Call `UserContext.setUser(...)` on FirebaseAuth state change**

Locate existing auth state stream (likely in a Riverpod `authProvider`). Add a listener that forwards uid to `UserContext.setUser`. Example:

```dart
FirebaseAuth.instance.authStateChanges().listen((user) {
  UserContext.setUser(user?.uid);
});
```

- [ ] **Step 3: Analyze + test**

Run: `cd mobile && flutter analyze --no-fatal-infos && flutter test`

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/core/observability/user_context.dart mobile/lib/
git commit -m "feat(mobile): forward auth uid to Sentry user context"
```

---

## Phase 2 — Structured logging (Axiom via Vercel drain)

Most of this phase was built in Phase 1 (the `logger.ts` module + `withObservability.ts` wrapping). This phase adds Axiom drain configuration and the Sentry↔log breadcrumb bridge.

### Task 2.1: Sentry breadcrumb bridge

**Files:**
- Create: `src/lib/observability/sentryBridge.ts`
- Create: `src/lib/observability/__tests__/sentryBridge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/observability/__tests__/sentryBridge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { bridgeLoggerToSentry } from '../sentryBridge';
import { createLogger } from '../logger';

vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));

describe('sentryBridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards warn to Sentry breadcrumb', () => {
    process.env.OBSERVABILITY_ENABLED = 'true';
    const logger = createLogger('t');
    bridgeLoggerToSentry(logger);
    logger.warn({ foo: 'bar' }, 'hello');
    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
  });

  it('noop when disabled', () => {
    process.env.OBSERVABILITY_ENABLED = 'false';
    const logger = createLogger('t');
    bridgeLoggerToSentry(logger);
    logger.error('nope');
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/observability/sentryBridge.ts
import * as Sentry from '@sentry/nextjs';
import type { Logger } from './logger';
import { isObservabilityEnabled } from './env';

export function bridgeLoggerToSentry(logger: Logger): void {
  if (!isObservabilityEnabled()) return;
  for (const level of ['warn', 'error'] as const) {
    const orig = logger[level].bind(logger);
    // pino allows replacing methods via symbols; here we hook via a wrapper
    (logger as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
      Sentry.addBreadcrumb({
        category: 'logger',
        level: level === 'error' ? 'error' : 'warning',
        message: args.length ? String(args[args.length - 1]) : '',
        data: typeof args[0] === 'object' ? (args[0] as Record<string, unknown>) : undefined,
      });
      return orig(...(args as Parameters<typeof orig>));
    };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- sentryBridge`

- [ ] **Step 4: Wire bridge into `withObservability`**

In `src/lib/observability/withObservability.ts`, after creating the logger (child with request_id), call `bridgeLoggerToSentry(logger)`. Then commit.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/sentryBridge.ts src/lib/observability/__tests__/sentryBridge.test.ts src/lib/observability/withObservability.ts
git commit -m "feat(observability): pino -> Sentry breadcrumb bridge"
```

### Task 2.2: Document Axiom drain setup

**Files:**
- Create: `docs/observability/AXIOM.md`

- [ ] **Step 1: Author**

```markdown
# Axiom log drain

Vercel logs → Axiom ingestion. No code required; Axiom reads Vercel's log drain firehose.

## One-time setup (done by user in Phase 0.11)

1. Vercel Dashboard → penny project → Integrations → Browse marketplace → Axiom.
2. Install. Select datasets `penny-web-prod` for Production and `penny-web-staging` for Preview.
3. No redeploy needed; new runtime logs route automatically.

## Querying

Structured JSON emitted by `src/lib/observability/logger.ts` includes: level, time, env, service, route, request_id, user_id, duration_ms, message, and nested context.

Saved queries (create in Axiom UI):

- `errors-last-1h`: `['penny-web-prod'] | where level == "error" | where _time > ago(1h)`
- `slow-routes-p95-24h`: `['penny-web-prod'] | summarize p95 = percentile(duration_ms, 95) by route | order by p95 desc`
- `user-activity`: parameterized by user_id

## Retention

Free tier: 30 days. No action required.
```

- [ ] **Step 2: Commit**

```bash
git add docs/observability/AXIOM.md
git commit -m "docs(observability): Axiom drain setup + saved queries"
```

### Task 2.3: Wrap all existing API routes with withObservability

**Files:**
- Modify: every `src/app/api/**/route.ts`

- [ ] **Step 1: Enumerate routes**

Run: `find src/app/api -name route.ts`

- [ ] **Step 2: For each route, convert exports to wrapped handlers**

Pattern — for each file, change:

```ts
export async function GET(req: NextRequest) { /* body */ }
export async function POST(req: NextRequest) { /* body */ }
```

To:

```ts
import { withObservability } from '@/lib/observability/withObservability';

async function getHandler(req: NextRequest) { /* body */ }
async function postHandler(req: NextRequest) { /* body */ }

export const GET = withObservability(getHandler, { route: '/api/<path>' });
export const POST = withObservability(postHandler, { route: '/api/<path>' });
```

Where `/api/<path>` matches the route's URL.

**Scope this in batches of 5-10 files per commit.** For each batch: edit, type-check, test, commit.

- [ ] **Step 3: Per batch — type check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Per batch — run tests**

Run: `npm test`

- [ ] **Step 5: Per batch — commit**

```bash
git add src/app/api/<batch>
git commit -m "feat(observability): wrap <batch> routes with withObservability"
```

---

## Phase 3 — Product analytics, session replay, feature flags

### Task 3.1: Install posthog-js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install posthog-js
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add posthog-js"
```

### Task 3.2: Consent state module

**Files:**
- Create: `src/lib/observability/consent.ts`
- Create: `src/lib/observability/__tests__/consent.test.ts`

- [ ] **Step 1: Write test**

```ts
// src/lib/observability/__tests__/consent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getConsentState, setConsentState, isConsentGiven, CONSENT_COOKIE } from '../consent';

describe('consent', () => {
  beforeEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0;`;
  });

  it('returns "unset" when no cookie', () => {
    expect(getConsentState()).toBe('unset');
  });

  it('setConsentState writes cookie and isConsentGiven follows', () => {
    setConsentState('granted');
    expect(getConsentState()).toBe('granted');
    expect(isConsentGiven()).toBe(true);
  });

  it('denied blocks consent', () => {
    setConsentState('denied');
    expect(isConsentGiven()).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/observability/consent.ts
export type ConsentState = 'unset' | 'granted' | 'denied';
export const CONSENT_COOKIE = 'penny_consent';

export function getConsentState(): ConsentState {
  if (typeof document === 'undefined') return 'unset';
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]+)`));
  if (!match) return 'unset';
  const v = decodeURIComponent(match[1]);
  if (v === 'granted' || v === 'denied') return v;
  return 'unset';
}

export function setConsentState(state: 'granted' | 'denied'): void {
  if (typeof document === 'undefined') return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${CONSENT_COOKIE}=${state}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
}

export function isConsentGiven(): boolean {
  return getConsentState() === 'granted';
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm test -- consent
git add src/lib/observability/consent.ts src/lib/observability/__tests__/consent.test.ts
git commit -m "feat(observability): consent state module"
```

### Task 3.3: PostHog init (consent-gated)

**Files:**
- Create: `src/lib/observability/posthog.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/observability/posthog.ts
'use client';
import posthog from 'posthog-js';
import { getPostHogKey, getPostHogHost, isObservabilityEnabled, getObservabilityEnv } from './env';
import { isConsentGiven } from './consent';

let initialized = false;

export function initPostHog(): void {
  if (initialized) return;
  if (!isObservabilityEnabled()) return;
  const key = getPostHogKey();
  if (!key) return;

  posthog.init(key, {
    api_host: getPostHogHost(),
    person_profiles: 'identified_only',
    autocapture: { dom_event_allowlist: ['click', 'change', 'submit'] },
    capture_pageview: true,
    capture_pageleave: true,
    opt_out_capturing_by_default: true,
    persistence: 'localStorage+cookie',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
      blockSelector: '[data-ph-no-capture]',
    },
    loaded: (ph) => {
      if (isConsentGiven()) ph.opt_in_capturing();
      ph.register({ env: getObservabilityEnv() });
    },
  });
  initialized = true;
}

export function identifyUser(uid: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(uid, props);
}

export function resetUser(): void {
  if (!initialized) return;
  posthog.reset();
}

export function onConsentChange(granted: boolean): void {
  if (!initialized) return;
  if (granted) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

export { posthog };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/observability/posthog.ts
git commit -m "feat(observability): PostHog init with consent gating + STRICT masking"
```

### Task 3.4: analytics.ts — track() wrapper

**Files:**
- Create: `src/lib/observability/analytics.ts`
- Create: `src/lib/observability/__tests__/analytics.test.ts`

- [ ] **Step 1: Write test**

```ts
// src/lib/observability/__tests__/analytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track, type TrackableEvent } from '../analytics';

vi.mock('../posthog', () => ({ posthog: { capture: vi.fn() } }));

describe('analytics.track', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts known event types', () => {
    const e: TrackableEvent = 'expense_added';
    expect(() => track(e, { category: 'Meals' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/observability/analytics.ts
import { posthog } from './posthog';
import { isObservabilityEnabled } from './env';

export type TrackableEvent =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'budget_created'
  | 'budget_limit_changed'
  | 'group_created'
  | 'group_member_invited'
  | 'ai_chat_message_sent'
  | 'ai_chat_expense_confirmed'
  | 'savings_goal_created'
  | 'income_source_added';

export function track(event: TrackableEvent, properties: Record<string, unknown> = {}): void {
  if (!isObservabilityEnabled()) return;
  const sanitized = stripPII(properties);
  try { posthog.capture(event, sanitized); } catch { /* silent: never let analytics error bubble */ }
}

function stripPII(props: Record<string, unknown>): Record<string, unknown> {
  const banned = new Set(['amount', 'vendor', 'email', 'password', 'token', 'description']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (banned.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}
```

- [ ] **Step 3: Commit**

```bash
npm test -- analytics
git add src/lib/observability/analytics.ts src/lib/observability/__tests__/analytics.test.ts
git commit -m "feat(observability): track() wrapper with PII strip"
```

### Task 3.5: featureFlags.ts

**Files:**
- Create: `src/lib/observability/featureFlags.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/observability/featureFlags.ts
import { posthog } from './posthog';
import { isObservabilityEnabled } from './env';

export type KnownFlag =
  | 'staging_kill_switch_observability'
  | 'new_ai_model_rollout'
  | 'session_replay_enabled';

export function isFeatureEnabled(flag: KnownFlag): boolean {
  if (!isObservabilityEnabled()) return false;
  try { return posthog.isFeatureEnabled(flag) === true; } catch { return false; }
}

export function getFeatureFlagVariant(flag: KnownFlag): string | boolean | undefined {
  if (!isObservabilityEnabled()) return undefined;
  try { return posthog.getFeatureFlag(flag); } catch { return undefined; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/observability/featureFlags.ts
git commit -m "feat(observability): feature flag wrapper"
```

### Task 3.6: PostHogProvider component

**Files:**
- Create: `src/components/observability/PostHogProvider.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/observability/PostHogProvider.tsx
'use client';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { initPostHog, identifyUser, resetUser } from '@/lib/observability/posthog';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) identifyUser(user.uid);
      else resetUser();
    });
    return () => unsub();
  }, []);
  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/observability/PostHogProvider.tsx
git commit -m "feat(observability): PostHogProvider"
```

### Task 3.7: Consent banner component

**Files:**
- Create: `src/components/observability/ConsentBanner.tsx`
- Create: `src/components/observability/__tests__/ConsentBanner.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/components/observability/__tests__/ConsentBanner.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentBanner } from '../ConsentBanner';
import { CONSENT_COOKIE } from '@/lib/observability/consent';

describe('ConsentBanner', () => {
  beforeEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0;`;
  });

  it('renders when consent is unset', () => {
    render(<ConsentBanner />);
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  });

  it('hides after accept click', async () => {
    render(<ConsentBanner />);
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  });

  it('hides when consent already granted', () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    render(<ConsentBanner />);
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/observability/ConsentBanner.tsx
'use client';
import { useEffect, useState } from 'react';
import { getConsentState, setConsentState } from '@/lib/observability/consent';
import { onConsentChange } from '@/lib/observability/posthog';

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(getConsentState() === 'unset'); }, []);
  if (!visible) return null;

  const handle = (state: 'granted' | 'denied') => () => {
    setConsentState(state);
    onConsentChange(state === 'granted');
    setVisible(false);
  };

  return (
    <div role="region" aria-label="Cookie consent" className="fixed bottom-0 inset-x-0 bg-white border-t p-4 shadow-lg z-50">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm flex-1">
          We use privacy-respecting analytics (PostHog, EU) to improve Penny. Financial data is never sent.{' '}
          <a href="/privacy/data-processors" className="underline">Learn more</a>.
        </p>
        <div className="flex gap-2">
          <button onClick={handle('denied')} className="px-3 py-1.5 text-sm border rounded">Essential only</button>
          <button onClick={handle('granted')} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">Accept all</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Tests + commit**

```bash
npm test -- ConsentBanner
git add src/components/observability/ConsentBanner.tsx src/components/observability/__tests__/ConsentBanner.test.tsx
git commit -m "feat(observability): ConsentBanner component"
```

### Task 3.8: Wire PostHogProvider + ConsentBanner into layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Edit layout**

Import and wrap `{children}` with `<PostHogProvider>...</PostHogProvider>`. Add `<ConsentBanner />` inside body.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/layout.tsx
git commit -m "feat: mount PostHogProvider + ConsentBanner in root layout"
```

### Task 3.9: Tag PII-bearing components with data-ph-no-capture

**Files:**
- Modify: `src/components/ExpenseForm.tsx` (or equivalent)
- Modify: `src/components/AIChat.tsx` (or equivalent)
- Modify: `src/components/BudgetForm.tsx` (or equivalent)
- Modify: `src/components/GroupMembersList.tsx` (or equivalent)
- Modify: any component rendering a dollar amount or vendor name

- [ ] **Step 1: Find candidates**

Run: `grep -rln 'amount\|vendor\|email\|receipt' src/components --include='*.tsx' | head -50`

- [ ] **Step 2: For each relevant component, add `data-ph-no-capture` attribute to sensitive JSX**

Pattern: on any input or text node rendering user financial info:

```tsx
<input data-ph-no-capture type="number" value={amount} onChange={...} />
<span data-ph-no-capture>{vendor}</span>
<img data-ph-no-capture src={receiptUrl} />
```

- [ ] **Step 3: Do a mass grep audit after edits**

Run: `grep -rln 'data-ph-no-capture' src/components | wc -l`
Expected: at least 6 components tagged.

- [ ] **Step 4: Commit**

```bash
git add src/components
git commit -m "feat(observability): tag PII-bearing elements with data-ph-no-capture"
```

### Task 3.10: Fire business events from critical flows

**Files:**
- Modify: components/hooks that create/edit expenses, budgets, groups, AI chat sends, savings goals, income sources

- [ ] **Step 1: For each business event (list below), locate the code path and call `track(...)`**

- `expense_added` — in the expense create hook/handler, after successful Firestore write → `track('expense_added', { category, isGroup: !!groupId })`
- `expense_edited` — in the expense update path → `track('expense_edited', { category })`
- `expense_deleted` — in the expense delete path → `track('expense_deleted', {})`
- `budget_created` — after budget create → `track('budget_created', { scope: 'personal' | 'group', category })`
- `budget_limit_changed` — on update → `track('budget_limit_changed', { category })`
- `group_created` — after `/api/groups` POST success → `track('group_created', { memberCount: 1 })`
- `group_member_invited` — after invitation create → `track('group_member_invited', {})`
- `ai_chat_message_sent` — in AIChat submit handler → `track('ai_chat_message_sent', { hasImage })`
- `ai_chat_expense_confirmed` — when user confirms AI-extracted expense → `track('ai_chat_expense_confirmed', { category })`
- `savings_goal_created` — after create → `track('savings_goal_created', { category, targetAmount: 'redacted' })`
- `income_source_added` — after create → `track('income_source_added', { category, frequency })`

Each call site imports: `import { track } from '@/lib/observability/analytics';`

- [ ] **Step 2: Type-check + test**

```bash
npx tsc --noEmit
npm test
```

- [ ] **Step 3: Commit per logical group (expenses, budgets, groups, ai-chat, savings, income)**

```bash
git add <paths for group>
git commit -m "feat(analytics): instrument <group> business events"
```

### Task 3.11: Mobile — add posthog_flutter + firebase_analytics + firebase_performance

**Files:**
- Modify: `mobile/pubspec.yaml`

- [ ] **Step 1: Add deps**

```yaml
  posthog_flutter: ^5.0.0
  firebase_analytics: ^12.0.0
  firebase_performance: ^0.11.0
```

Run: `cd mobile && flutter pub get`

- [ ] **Step 2: Commit**

```bash
git add mobile/pubspec.yaml mobile/pubspec.lock
git commit -m "chore(mobile): add posthog_flutter + firebase_analytics + firebase_performance"
```

### Task 3.12: Mobile — analytics wrapper

**Files:**
- Create: `mobile/lib/core/observability/analytics.dart`

- [ ] **Step 1: Implement**

```dart
// mobile/lib/core/observability/analytics.dart
import 'package:posthog_flutter/posthog_flutter.dart';
import 'env.dart';

enum TrackableEvent {
  expenseAdded,
  expenseEdited,
  expenseDeleted,
  budgetCreated,
  budgetLimitChanged,
  groupCreated,
  groupMemberInvited,
  aiChatMessageSent,
  aiChatExpenseConfirmed,
  savingsGoalCreated,
  incomeSourceAdded,
}

extension _EventName on TrackableEvent {
  String get eventName {
    switch (this) {
      case TrackableEvent.expenseAdded: return 'expense_added';
      case TrackableEvent.expenseEdited: return 'expense_edited';
      case TrackableEvent.expenseDeleted: return 'expense_deleted';
      case TrackableEvent.budgetCreated: return 'budget_created';
      case TrackableEvent.budgetLimitChanged: return 'budget_limit_changed';
      case TrackableEvent.groupCreated: return 'group_created';
      case TrackableEvent.groupMemberInvited: return 'group_member_invited';
      case TrackableEvent.aiChatMessageSent: return 'ai_chat_message_sent';
      case TrackableEvent.aiChatExpenseConfirmed: return 'ai_chat_expense_confirmed';
      case TrackableEvent.savingsGoalCreated: return 'savings_goal_created';
      case TrackableEvent.incomeSourceAdded: return 'income_source_added';
    }
  }
}

class Analytics {
  static const _banned = {'amount', 'vendor', 'email', 'password', 'token', 'description'};

  static Future<void> track(TrackableEvent event, {Map<String, Object>? properties}) async {
    if (!ObservabilityEnv.enabled || ObservabilityEnv.posthogKey.isEmpty) return;
    final sanitized = <String, Object>{};
    properties?.forEach((k, v) {
      if (!_banned.contains(k.toLowerCase())) sanitized[k] = v;
    });
    try {
      await Posthog().capture(eventName: event.eventName, properties: sanitized);
    } catch (_) { /* silent */ }
  }

  static Future<void> identify(String uid) async {
    if (!ObservabilityEnv.enabled || ObservabilityEnv.posthogKey.isEmpty) return;
    try { await Posthog().identify(userId: uid); } catch (_) {}
  }

  static Future<void> reset() async {
    if (!ObservabilityEnv.enabled || ObservabilityEnv.posthogKey.isEmpty) return;
    try { await Posthog().reset(); } catch (_) {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/lib/core/observability/analytics.dart
git commit -m "feat(mobile): analytics wrapper with PII strip"
```

### Task 3.13: Mobile — flip IS_ANALYTICS_ENABLED + init Firebase Analytics / Performance / PostHog

**Files:**
- Modify: `mobile/ios/Runner/GoogleService-Info.plist`
- Modify: `mobile/lib/main.dart`
- Create: `mobile/lib/core/observability/observability_init.dart`

- [ ] **Step 1: Flip IS_ANALYTICS_ENABLED in plist**

In `mobile/ios/Runner/GoogleService-Info.plist`, change:

```xml
<key>IS_ANALYTICS_ENABLED</key>
<false/>
```

to:

```xml
<key>IS_ANALYTICS_ENABLED</key>
<true/>
```

- [ ] **Step 2: Create observability_init.dart**

```dart
// mobile/lib/core/observability/observability_init.dart
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_performance/firebase_performance.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import 'env.dart';

class ObservabilityInit {
  static Future<void> run() async {
    // Firebase Analytics + Performance auto-init when packages are loaded.
    await FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(ObservabilityEnv.enabled);
    await FirebasePerformance.instance.setPerformanceCollectionEnabled(ObservabilityEnv.enabled);
    if (ObservabilityEnv.enabled && ObservabilityEnv.posthogKey.isNotEmpty) {
      await Posthog().setup(
        PostHogConfig(ObservabilityEnv.posthogKey)
          ..host = ObservabilityEnv.posthogHost
          ..captureApplicationLifecycleEvents = true
          ..sessionReplay = true
          ..sessionReplayConfig.maskAllTexts = true
          ..sessionReplayConfig.maskAllImages = true,
      );
    }
  }
}
```

- [ ] **Step 3: Wire in main.dart**

Inside `CrashReporter.init(...)` inner callback, before `runApp(...)`, call `await ObservabilityInit.run();`.

- [ ] **Step 4: Analyze + test**

Run: `cd mobile && flutter analyze --no-fatal-infos && flutter test`

- [ ] **Step 5: Commit**

```bash
git add mobile/ios/Runner/GoogleService-Info.plist mobile/lib/
git commit -m "feat(mobile): init Firebase Analytics + Performance + PostHog (session replay STRICT)"
```

### Task 3.14: Mobile — feature flags + user identify on auth

**Files:**
- Create: `mobile/lib/core/observability/feature_flags.dart`
- Modify: existing auth listener to call `Analytics.identify` and `UserContext.setUser`

- [ ] **Step 1: feature_flags.dart**

```dart
// mobile/lib/core/observability/feature_flags.dart
import 'package:posthog_flutter/posthog_flutter.dart';
import 'env.dart';

enum KnownFlag {
  stagingKillSwitchObservability,
  newAiModelRollout,
  sessionReplayEnabled,
}

extension _FlagName on KnownFlag {
  String get key {
    switch (this) {
      case KnownFlag.stagingKillSwitchObservability: return 'staging_kill_switch_observability';
      case KnownFlag.newAiModelRollout: return 'new_ai_model_rollout';
      case KnownFlag.sessionReplayEnabled: return 'session_replay_enabled';
    }
  }
}

class FeatureFlags {
  static Future<bool> isEnabled(KnownFlag flag) async {
    if (!ObservabilityEnv.enabled) return false;
    try { return (await Posthog().isFeatureEnabled(flag.key)) ?? false; } catch (_) { return false; }
  }
}
```

- [ ] **Step 2: Update auth listener**

```dart
FirebaseAuth.instance.authStateChanges().listen((user) async {
  if (user != null) {
    await UserContext.setUser(user.uid);
    await Analytics.identify(user.uid);
  } else {
    await UserContext.setUser(null);
    await Analytics.reset();
  }
});
```

- [ ] **Step 3: Analyze + test + commit**

```bash
cd mobile && flutter analyze --no-fatal-infos && flutter test && cd ..
git add mobile/lib/core/observability/
git commit -m "feat(mobile): feature flags + unified auth observability"
```

### Task 3.15: Instrument mobile business events

**Files:**
- Modify: Dart repositories/providers that write expenses, budgets, groups, etc.

- [ ] **Step 1: Mirror web instrumentation**

For each of the 11 events listed in Task 3.10, locate the Dart data path (repository or use case) and call `Analytics.track(TrackableEvent.<name>, properties: {...})` after successful Firestore/API write. Same no-PII rules.

- [ ] **Step 2: Analyze, test, commit per logical group**

```bash
cd mobile && flutter analyze --no-fatal-infos && flutter test && cd ..
git add mobile/lib/
git commit -m "feat(mobile): instrument business events"
```

---

## Phase 4 — Performance monitoring

### Task 4.1: Add Sentry spans around 5 critical API routes

**Files:**
- Modify: `src/app/api/ai-chat/route.ts`
- Modify: `src/app/api/analyze-expense/route.ts`
- Modify: `src/app/api/expenses/route.ts`
- Modify: `src/app/api/groups/route.ts`
- Modify: `src/app/api/budgets/group/route.ts`

- [ ] **Step 1: Add spans in each**

Inside each handler, wrap the most expensive block:

```ts
import * as Sentry from '@sentry/nextjs';

// ...inside handler body after receiving input:
const result = await Sentry.startSpan(
  { name: 'firestore.write', op: 'db' },
  async () => {
    return await adminDb.collection('expenses').add(data);
  }
);
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/ai-chat src/app/api/analyze-expense src/app/api/expenses src/app/api/groups src/app/api/budgets
git commit -m "feat(sentry): custom spans on 5 critical routes"
```

### Task 4.2: Mobile — custom HTTP metrics

**Files:**
- Modify: network layer (likely `mobile/lib/core/network/`)

- [ ] **Step 1: Wrap 3 critical calls with HttpMetric**

```dart
import 'package:firebase_performance/firebase_performance.dart';

Future<Response> tracedPost(String url, dynamic body) async {
  final metric = FirebasePerformance.instance.newHttpMetric(url, HttpMethod.Post);
  await metric.start();
  try {
    final res = await dio.post(url, data: body);
    metric.httpResponseCode = res.statusCode ?? 0;
    metric.responsePayloadSize = res.data.toString().length;
    return res;
  } finally {
    await metric.stop();
  }
}
```

Apply to: AI chat POST, analyze-expense POST, create group expense POST.

- [ ] **Step 2: Analyze + commit**

```bash
cd mobile && flutter analyze --no-fatal-infos && cd ..
git add mobile/lib/core/network/
git commit -m "feat(mobile): Firebase Performance traces on critical HTTP calls"
```

### Task 4.3: Enable Vercel Speed Insights

**Files:**
- Modify: `package.json`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install + wire**

```bash
npm install @vercel/speed-insights
```

In `src/app/layout.tsx`:

```tsx
import { SpeedInsights } from '@vercel/speed-insights/next';
// ... in body:
<SpeedInsights />
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json src/app/layout.tsx
git commit -m "feat: Vercel Speed Insights for Core Web Vitals"
```

---

## Phase 5 — Alerting (Discord + GH Issues)

### Task 5.1: Discord forwarder endpoint

**Files:**
- Create: `src/app/api/alerts/discord-forward/route.ts`
- Create: `src/app/api/alerts/discord-forward/__tests__/route.test.ts`

- [ ] **Step 1: Write test**

```ts
// src/app/api/alerts/discord-forward/__tests__/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

global.fetch = vi.fn(async () => new Response('', { status: 204 }));

describe('POST /api/alerts/discord-forward', () => {
  it('returns 400 on missing signature', async () => {
    const req = new NextRequest('http://localhost/api/alerts/discord-forward', {
      method: 'POST',
      body: JSON.stringify({ severity: 'critical', title: 'x' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/app/api/alerts/discord-forward/route.ts
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { withObservability } from '@/lib/observability/withObservability';

interface AlertPayload {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description?: string;
  source?: string;
  url?: string;
}

async function handler(req: NextRequest) {
  const signature = req.headers.get('x-alert-signature');
  const secret = process.env.ALERT_FORWARD_SECRET;
  if (!secret || !signature) return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 });

  const raw = await req.text();
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return new Response(JSON.stringify({ error: 'Bad signature' }), { status: 401 });
  }

  const payload = JSON.parse(raw) as AlertPayload;
  const webhook = webhookFor(payload.severity);
  if (!webhook) return new Response(JSON.stringify({ error: 'No webhook configured' }), { status: 500 });

  const color = { critical: 0xdc2626, warning: 0xf59e0b, info: 0x3b82f6 }[payload.severity];
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: payload.title,
        description: payload.description,
        color,
        fields: [
          { name: 'Severity', value: payload.severity, inline: true },
          { name: 'Source', value: payload.source ?? 'unknown', inline: true },
        ],
        url: payload.url,
      }],
    }),
  });

  if (payload.severity === 'critical') {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/alerts/create-issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-alert-signature': signature },
      body: raw,
    }).catch(() => {});
  }

  return new Response('', { status: 204 });
}

function webhookFor(severity: 'critical' | 'warning' | 'info') {
  return {
    critical: process.env.DISCORD_WEBHOOK_ALERTS_CRITICAL,
    warning: process.env.DISCORD_WEBHOOK_ALERTS_WARNING,
    info: process.env.DISCORD_WEBHOOK_ALERTS_INFO,
  }[severity];
}

export const POST = withObservability(handler, { route: '/api/alerts/discord-forward' });
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- discord-forward
git add src/app/api/alerts
git commit -m "feat(alerts): Discord forwarder with HMAC signature"
```

### Task 5.2: GH Issue creator endpoint (critical only)

**Files:**
- Create: `src/app/api/alerts/create-issue/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/alerts/create-issue/route.ts
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { withObservability } from '@/lib/observability/withObservability';

async function handler(req: NextRequest) {
  const signature = req.headers.get('x-alert-signature');
  const secret = process.env.ALERT_FORWARD_SECRET;
  if (!secret || !signature) return new Response('', { status: 400 });

  const raw = await req.text();
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return new Response('', { status: 401 });
  }

  const payload = JSON.parse(raw);
  if (payload.severity !== 'critical') return new Response('', { status: 204 });

  const ghToken = process.env.GITHUB_ISSUE_TOKEN;
  const repo = process.env.GITHUB_ISSUE_REPO ?? 'sarathfrancis/penny';
  if (!ghToken) return new Response('', { status: 500 });

  await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `[alert:critical] ${payload.title}`,
      body: `**Severity:** ${payload.severity}\n**Source:** ${payload.source}\n\n${payload.description ?? ''}\n\nOriginal: ${payload.url ?? 'n/a'}`,
      labels: ['observability', 'alert', 'severity:critical'],
    }),
  });

  return new Response('', { status: 204 });
}

export const POST = withObservability(handler, { route: '/api/alerts/create-issue' });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/alerts/create-issue
git commit -m "feat(alerts): GitHub Issue auto-creation on critical"
```

### Task 5.3: Document alert rule configuration

**Files:**
- Create: `docs/observability/ALERTS.md`

- [ ] **Step 1: Author**

```markdown
# Alert rules (configured in each vendor UI)

Vendors send webhooks → `/api/alerts/discord-forward` (signed) → Discord + GH Issues.

## Webhook URL

`https://penny.app/api/alerts/discord-forward`
Sign payloads with HMAC-SHA256 using `ALERT_FORWARD_SECRET`, send as `x-alert-signature` header.

## Sentry rules

(Configure in Sentry UI → Alerts → Create Alert Rule.)

- **New issue in prod (any level)** → POST to forwarder with severity=warning
- **Issue reopens in prod** → severity=critical
- **Error rate > 5% over 1h** → severity=critical
- **Quota > 80% of free tier** → severity=warning

## PostHog rules

- DAU drop > 30% WoW → severity=warning

## Axiom rules

- `5xx rate on /api/* > 1% over 5min` → severity=critical

## Quiet hours

01:00–07:00 America/Toronto. Configure per-alert in each vendor. Critical alerts bypass quiet hours.
```

- [ ] **Step 2: Commit**

```bash
git add docs/observability/ALERTS.md
git commit -m "docs(observability): alert rule reference"
```

---

## Phase 6 — App Store / Play Store metrics

### Task 6.1: Store metrics types

**Files:**
- Create: `src/lib/types/store-metrics.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/types/store-metrics.ts
export interface StoreReview {
  stars: 1 | 2 | 3 | 4 | 5;
  text: string;
  userLocale: string;
  submittedAt: string;
}

export interface StoreMetrics {
  platform: 'ios' | 'android';
  date: string; // yyyy-mm-dd
  installs: number;
  uninstalls: number;
  crashes: number;
  avgRating: number;
  ratingCount: number;
  newRatings: number;
  newReviews: StoreReview[];
  revenueCents?: number;
  fetchedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types/store-metrics.ts
git commit -m "feat(types): store-metrics schema"
```

### Task 6.2: App Store Connect client

**Files:**
- Create: `src/lib/store-metrics/appStoreConnect.ts`
- Create: `src/lib/store-metrics/__tests__/appStoreConnect.test.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/store-metrics/appStoreConnect.ts
import jwt from 'jsonwebtoken';
import type { StoreMetrics, StoreReview } from '@/lib/types/store-metrics';

const P8_B64 = process.env.APP_STORE_CONNECT_P8_BASE64;
const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const APP_ID = process.env.APP_STORE_CONNECT_APP_ID;

function makeToken(): string {
  if (!P8_B64 || !KEY_ID || !ISSUER_ID) throw new Error('App Store Connect creds missing');
  const privateKey = Buffer.from(P8_B64, 'base64').toString('utf8');
  return jwt.sign(
    { iss: ISSUER_ID, exp: Math.floor(Date.now() / 1000) + 20 * 60, aud: 'appstoreconnect-v1' },
    privateKey,
    { algorithm: 'ES256', keyid: KEY_ID }
  );
}

export async function fetchAppStoreMetrics(date: string): Promise<StoreMetrics> {
  const token = makeToken();
  const headers = { Authorization: `Bearer ${token}` };

  const reviewsRes = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/customerReviews?limit=50&sort=-createdDate`,
    { headers }
  );
  const reviewsJson = await reviewsRes.json();
  const newReviews: StoreReview[] = (reviewsJson.data ?? []).map((r: { attributes: { rating: number; body: string; reviewerNickname: string; createdDate: string } }) => ({
    stars: r.attributes.rating as 1 | 2 | 3 | 4 | 5,
    text: r.attributes.body ?? '',
    userLocale: 'unknown',
    submittedAt: r.attributes.createdDate,
  }));

  return {
    platform: 'ios',
    date,
    installs: 0,
    uninstalls: 0,
    crashes: 0,
    avgRating: 0,
    ratingCount: 0,
    newRatings: newReviews.length,
    newReviews,
    fetchedAt: new Date().toISOString(),
  };
}
```

Note: The `/v1/salesReports` endpoint returns a gzipped TSV — additional parsing is out of scope; this first pass ships reviews only.

Run: `npm install jsonwebtoken && npm install --save-dev @types/jsonwebtoken`

- [ ] **Step 2: Write minimal test**

```ts
// src/lib/store-metrics/__tests__/appStoreConnect.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('appStoreConnect', () => {
  beforeEach(() => {
    process.env.APP_STORE_CONNECT_P8_BASE64 = Buffer.from('-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg\n-----END PRIVATE KEY-----').toString('base64');
    process.env.APP_STORE_CONNECT_KEY_ID = 'A';
    process.env.APP_STORE_CONNECT_ISSUER_ID = 'B';
  });
  it('module loads', async () => {
    await expect(import('../appStoreConnect')).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/lib/store-metrics/appStoreConnect.ts src/lib/store-metrics/__tests__/appStoreConnect.test.ts
git commit -m "feat(store-metrics): App Store Connect reviews fetch"
```

### Task 6.3: Google Play client

**Files:**
- Create: `src/lib/store-metrics/googlePlay.ts`

- [ ] **Step 1: Install googleapis**

```bash
npm install googleapis
```

- [ ] **Step 2: Implement**

```ts
// src/lib/store-metrics/googlePlay.ts
import { google } from 'googleapis';
import type { StoreMetrics, StoreReview } from '@/lib/types/store-metrics';

const PKG = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'com.pennyai.penny';

function getAuth() {
  const b64 = process.env.GOOGLE_PLAY_API_JSON_BASE64;
  if (!b64) throw new Error('Google Play creds missing');
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
}

export async function fetchGooglePlayMetrics(date: string): Promise<StoreMetrics> {
  const auth = getAuth();
  const publisher = google.androidpublisher({ version: 'v3', auth });

  const reviewsRes = await publisher.reviews.list({ packageName: PKG, maxResults: 50 });
  const newReviews: StoreReview[] = (reviewsRes.data.reviews ?? []).flatMap((r) => {
    const c = r.comments?.[0]?.userComment;
    if (!c?.starRating) return [];
    return [{
      stars: c.starRating as 1 | 2 | 3 | 4 | 5,
      text: c.text ?? '',
      userLocale: c.reviewerLanguage ?? 'unknown',
      submittedAt: new Date((c.lastModified?.seconds ? Number(c.lastModified.seconds) * 1000 : 0)).toISOString(),
    }];
  });

  return {
    platform: 'android',
    date,
    installs: 0,
    uninstalls: 0,
    crashes: 0,
    avgRating: 0,
    ratingCount: 0,
    newRatings: newReviews.length,
    newReviews,
    fetchedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/lib/store-metrics/googlePlay.ts
git commit -m "feat(store-metrics): Google Play reviews fetch"
```

### Task 6.4: Vercel Cron endpoint

**Files:**
- Create: `src/app/api/cron/store-metrics/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/store-metrics", "schedule": "0 8 * * *" }
  ]
}
```

- [ ] **Step 2: Endpoint**

```ts
// src/app/api/cron/store-metrics/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { fetchAppStoreMetrics } from '@/lib/store-metrics/appStoreConnect';
import { fetchGooglePlayMetrics } from '@/lib/store-metrics/googlePlay';
import { adminDb } from '@/lib/firebase-admin';

async function handler(req: NextRequest) {
  // Vercel Cron auth via `authorization: Bearer <CRON_SECRET>`
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const yesterday = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 10);
  const results: { platform: string; ok: boolean; error?: string }[] = [];

  try {
    const ios = await fetchAppStoreMetrics(yesterday);
    await adminDb.collection('store_metrics').doc(`ios_${yesterday}`).set(ios);
    results.push({ platform: 'ios', ok: true });
  } catch (e) {
    results.push({ platform: 'ios', ok: false, error: (e as Error).message });
  }

  try {
    const android = await fetchGooglePlayMetrics(yesterday);
    await adminDb.collection('store_metrics').doc(`android_${yesterday}`).set(android);
    results.push({ platform: 'android', ok: true });
  } catch (e) {
    results.push({ platform: 'android', ok: false, error: (e as Error).message });
  }

  if (process.env.CRONITOR_STORE_METRICS_TOKEN) {
    await fetch(`https://cronitor.link/p/${process.env.CRONITOR_STORE_METRICS_TOKEN}/store-metrics`).catch(() => {});
  }

  return new Response(JSON.stringify({ date: yesterday, results }), { status: 200 });
}

export const GET = withObservability(handler, { route: '/api/cron/store-metrics' });
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add vercel.json src/app/api/cron/store-metrics
git commit -m "feat(store-metrics): nightly Vercel Cron pulling iOS + Android"
```

### Task 6.5: Fallback GH Actions cron (safety net)

**Files:**
- Create: `.github/workflows/store-metrics-fallback.yml`

- [ ] **Step 1: Author**

```yaml
name: Store metrics fallback

on:
  schedule:
    - cron: '30 9 * * *'  # 1.5h after Vercel cron
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Verify cron wrote today's docs
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
        run: |
          TODAY=$(date -u -d "yesterday" +%F)
          echo "Checking store_metrics/ios_${TODAY} and android_${TODAY}"
          # Using firebase-tools firestore:get to verify
          npm install -g firebase-tools
          firebase firestore:get "store_metrics/ios_${TODAY}" --project $FIREBASE_PROJECT_ID --token $FIREBASE_TOKEN || \
            (curl -X POST -H "Content-Type: application/json" \
              -d "{\"severity\":\"warning\",\"title\":\"Store metrics cron missed\",\"source\":\"gh-actions-fallback\"}" \
              ${{ secrets.DISCORD_WEBHOOK_ALERTS_WARNING }})
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/store-metrics-fallback.yml
git commit -m "feat(ci): fallback alert if Vercel Cron misses a day"
```

---

## Phase 7 — Uptime monitoring

### Task 7.1: Bootstrap BetterStack monitors

**Files:**
- Create: `scripts/bootstrap-uptime.ts`

- [ ] **Step 1: Implement**

```ts
// scripts/bootstrap-uptime.ts
const TOKEN = process.env.BETTERSTACK_API_KEY;
const BASE = 'https://uptime.betterstack.com/api/v2/monitors';

if (!TOKEN) { console.error('BETTERSTACK_API_KEY missing'); process.exit(1); }

const monitors = [
  { url: 'https://penny.app', pronounceable_name: 'web-home', check_frequency: 180 },
  { url: 'https://penny.app/api/healthz', pronounceable_name: 'api-healthz-prod', check_frequency: 180 },
  { url: 'https://staging.penny.app/api/healthz', pronounceable_name: 'api-healthz-staging', check_frequency: 300 },
];

async function main() {
  for (const m of monitors) {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitor_type: 'status', ...m }),
    });
    console.log(m.pronounceable_name, res.status);
  }
}
main();
```

- [ ] **Step 2: Document in SETUP.md**

In `docs/observability/SETUP.md`, add: "After secrets pasted, run `BETTERSTACK_API_KEY=... npx tsx scripts/bootstrap-uptime.ts` once."

- [ ] **Step 3: Commit**

```bash
git add scripts/bootstrap-uptime.ts docs/observability/SETUP.md
git commit -m "feat(uptime): one-off BetterStack bootstrap"
```

---

## Phase 8 — Admin dashboard extension

### Task 8.1: Firebase custom claims auth helper

**Files:**
- Modify: `src/lib/admin-auth.ts`
- Create: `src/lib/admin-auth/__tests__/admin-auth.test.ts`
- Create: `scripts/grant-admin.ts`

- [ ] **Step 1: Read current admin-auth.ts**

Run: `cat src/lib/admin-auth.ts`

- [ ] **Step 2: Refactor — keep old function names but replace bodies**

```ts
// src/lib/admin-auth.ts
import { NextRequest } from 'next/server';
import { adminAuth } from './firebase-admin';

export class AdminAuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) { super(message); }
}

/**
 * Verifies Firebase ID token on the request and asserts admin custom claim.
 * Throws AdminAuthError on failure.
 * Returns the decoded token for caller use.
 */
export async function requireAdmin(req: NextRequest): Promise<{ uid: string; email?: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AdminAuthError(401, 'Missing bearer token');
  }
  const token = authHeader.slice('Bearer '.length);
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new AdminAuthError(401, 'Invalid token');
  }
  if (decoded.admin !== true) {
    throw new AdminAuthError(403, 'Admin claim required');
  }
  return { uid: decoded.uid, email: decoded.email };
}

/**
 * Utility for API routes: wrap with try/catch → returns Response on error.
 */
export async function verifyAdmin(req: NextRequest): Promise<Response | { uid: string; email?: string }> {
  try { return await requireAdmin(req); }
  catch (e) {
    if (e instanceof AdminAuthError) {
      return new Response(JSON.stringify({ error: e.message }), { status: e.status, headers: { 'Content-Type': 'application/json' } });
    }
    throw e;
  }
}
```

- [ ] **Step 3: Write test**

```ts
// src/lib/admin-auth/__tests__/admin-auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(async (t) => {
      if (t === 'admin-token') return { uid: 'u1', email: 'a@b.c', admin: true };
      if (t === 'user-token') return { uid: 'u2', email: 'x@y.z', admin: false };
      throw new Error('bad token');
    }),
  },
}));

import { requireAdmin, AdminAuthError, verifyAdmin } from '../admin-auth';

const mk = (hdr?: string) => new NextRequest('http://localhost/api/admin/x', { headers: hdr ? { authorization: hdr } : undefined });

describe('admin-auth', () => {
  it('throws 401 when no token', async () => {
    await expect(requireAdmin(mk())).rejects.toMatchObject({ status: 401 });
  });
  it('throws 401 on invalid token', async () => {
    await expect(requireAdmin(mk('Bearer garbage'))).rejects.toMatchObject({ status: 401 });
  });
  it('throws 403 when admin claim absent', async () => {
    await expect(requireAdmin(mk('Bearer user-token'))).rejects.toMatchObject({ status: 403 });
  });
  it('returns uid on success', async () => {
    const res = await requireAdmin(mk('Bearer admin-token'));
    expect(res.uid).toBe('u1');
  });
  it('verifyAdmin returns Response on failure', async () => {
    const res = await verifyAdmin(mk());
    expect(res).toBeInstanceOf(Response);
  });
});
```

- [ ] **Step 4: Grant script**

```ts
// scripts/grant-admin.ts
import { adminAuth } from '@/lib/firebase-admin';

async function main() {
  const uid = process.argv[2];
  if (!uid) { console.error('Usage: npx tsx scripts/grant-admin.ts <uid>'); process.exit(1); }
  await adminAuth.setCustomUserClaims(uid, { admin: true });
  await adminAuth.revokeRefreshTokens(uid);
  console.log(`Granted admin + revoked tokens for ${uid}. User must sign in again.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Run tests + commit**

```bash
npm test -- admin-auth
git add src/lib/admin-auth.ts src/lib/admin-auth/ scripts/grant-admin.ts
git commit -m "feat(admin): Firebase custom claims replace HMAC auth"
```

### Task 8.2: Migrate existing admin routes to verifyAdmin

**Files:**
- Modify: `src/app/api/admin/analytics/route.ts`
- Modify: `src/app/api/admin/costs/route.ts`
- Modify: `src/app/api/admin/system/route.ts`
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/app/api/admin/auth/route.ts` (likely removable)

- [ ] **Step 1: Pattern for each admin route**

At the top of each handler:

```ts
import { verifyAdmin } from '@/lib/admin-auth';

async function getHandler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;
  // ...existing handler body, replacing any old HMAC check
}

export const GET = withObservability(getHandler, { route: '/api/admin/<name>' });
```

- [ ] **Step 2: Update client fetch calls to send `Authorization: Bearer <firebaseIdToken>`**

Locate `src/app/admin-console/page.tsx` and/or admin API hooks. Replace cookie-based fetches with:

```ts
const token = await auth.currentUser?.getIdToken();
const res = await fetch('/api/admin/...', { headers: { Authorization: `Bearer ${token}` } });
```

- [ ] **Step 3: Type-check, test, commit**

```bash
npx tsc --noEmit && npm test
git add src/app/api/admin src/app/admin-console
git commit -m "feat(admin): migrate routes + console fetches to Firebase custom claims"
```

### Task 8.3: New admin panel API routes

**Files:**
- Create: `src/app/api/admin/error-trends/route.ts`
- Create: `src/app/api/admin/user-analytics/route.ts`
- Create: `src/app/api/admin/store-metrics/route.ts`
- Create: `src/app/api/admin/uptime/route.ts`

Each route: verify admin → proxy to vendor API → return JSON.

- [ ] **Step 1: error-trends (Sentry)**

```ts
// src/app/api/admin/error-trends/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT_WEB;
  if (!token || !org || !project) return new Response(JSON.stringify({ error: 'Sentry not configured' }), { status: 503 });
  const res = await fetch(`https://sentry.io/api/0/projects/${org}/${project}/issues/?statsPeriod=7d&sort=freq`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export const GET = withObservability(handler, { route: '/api/admin/error-trends' });
```

- [ ] **Step 2: user-analytics (PostHog insights)**

```ts
// src/app/api/admin/user-analytics/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;
  const token = process.env.POSTHOG_PERSONAL_API_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!token || !projectId) return new Response(JSON.stringify({ error: 'PostHog not configured' }), { status: 503 });

  const res = await fetch(`${host}/api/projects/${projectId}/insights/trend/?events=[{"id":"$pageview","name":"$pageview","type":"events"}]&date_from=-7d&interval=day`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export const GET = withObservability(handler, { route: '/api/admin/user-analytics' });
```

- [ ] **Step 3: store-metrics (Firestore read)**

```ts
// src/app/api/admin/store-metrics/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminDb } from '@/lib/firebase-admin';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;
  const snap = await adminDb.collection('store_metrics').orderBy('date', 'desc').limit(30).get();
  const docs = snap.docs.map((d) => d.data());
  return new Response(JSON.stringify({ metrics: docs }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export const GET = withObservability(handler, { route: '/api/admin/store-metrics' });
```

- [ ] **Step 4: uptime (BetterStack)**

```ts
// src/app/api/admin/uptime/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;
  const token = process.env.BETTERSTACK_API_KEY;
  if (!token) return new Response(JSON.stringify({ error: 'BetterStack not configured' }), { status: 503 });
  const res = await fetch('https://uptime.betterstack.com/api/v2/monitors', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export const GET = withObservability(handler, { route: '/api/admin/uptime' });
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/error-trends src/app/api/admin/user-analytics src/app/api/admin/store-metrics src/app/api/admin/uptime
git commit -m "feat(admin): error-trends + user-analytics + store-metrics + uptime panels"
```

### Task 8.4: Admin console UI panels

**Files:**
- Modify: `src/app/admin-console/page.tsx`

- [ ] **Step 1: Add tabs**

Review current tabs. Add four new tabs: Errors, Users, Store, Uptime. Each calls its corresponding admin API via authenticated fetch and renders a simple table.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/admin-console
git commit -m "feat(admin-console): add Errors / Users / Store / Uptime tabs"
```

### Task 8.5: Firestore rules update

**Files:**
- Modify: `database/firestore.rules`

- [ ] **Step 1: Add admin token helper + store_metrics rules**

Add near top-level:

```
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}
```

Update `analytics/{id}` block:

```
match /analytics/{id} {
  allow read: if isAdmin();
  allow write: if false;
}
```

Add new block:

```
match /store_metrics/{id} {
  allow read: if isAdmin();
  allow write: if false;
}
```

- [ ] **Step 2: Commit (deploy happens via firebase-deploy.yml on merge)**

```bash
git add database/firestore.rules
git commit -m "feat(rules): admin custom claim + store_metrics read-only"
```

---

## Phase 9 — Privacy & consent compliance

### Task 9.1: PRIVACY.md

**Files:**
- Create: `PRIVACY.md` (or modify if exists)

- [ ] **Step 1: Author**

```markdown
# Penny Privacy Policy

Penny is operated by [Your Legal Entity]. Last updated: 2026-04-17.

## Data we collect

- Auth: email, password hash (Firebase Auth)
- Expenses: amounts, vendors, categories, dates, receipt images
- Budgets, income, savings goals
- Usage analytics (with your consent)

## Processors

See `/privacy/data-processors` for the authoritative list.

| Processor | Purpose | Region | DPA |
|---|---|---|---|
| Firebase (Google) | Auth, database, storage, push, analytics | US (us-central1) | [link] |
| Sentry | Crash + error reporting | EU (Frankfurt) | [link] |
| PostHog | Product analytics, session replay | EU (Frankfurt) | [link] |
| Axiom | Log aggregation | EU | [link] |
| Vercel | Hosting | Global edge, US primary | [link] |
| BetterStack | Uptime monitoring | EU | [link] |
| Cronitor | Cron heartbeat | US | [link] |
| Google Play | App distribution | US | [link] |
| App Store Connect | App distribution | US | [link] |

## Your rights (PIPEDA + GDPR)

- Access, correct, or delete your data via in-app `Settings → Privacy → Delete my data`.
- Withdraw consent via the cookie banner at any time.

## Contact

[email]
```

- [ ] **Step 2: Commit**

```bash
git add PRIVACY.md
git commit -m "docs(privacy): initial privacy policy with processor list"
```

### Task 9.2: /privacy/data-processors page

**Files:**
- Create: `src/app/privacy/data-processors/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/privacy/data-processors/page.tsx
export const metadata = { title: 'Data processors — Penny' };

const processors = [
  { name: 'Firebase', purpose: 'Auth, database, storage, push, analytics', region: 'US (us-central1)', dpa: 'https://firebase.google.com/support/privacy' },
  { name: 'Sentry', purpose: 'Crash & error reporting', region: 'EU (Frankfurt)', dpa: 'https://sentry.io/legal/dpa/' },
  { name: 'PostHog', purpose: 'Product analytics, session replay', region: 'EU (Frankfurt)', dpa: 'https://posthog.com/dpa' },
  { name: 'Axiom', purpose: 'Log aggregation', region: 'EU', dpa: 'https://www.axiom.co/legal/dpa' },
  { name: 'Vercel', purpose: 'Web hosting', region: 'Global edge (US primary)', dpa: 'https://vercel.com/legal/dpa' },
  { name: 'BetterStack', purpose: 'Uptime monitoring', region: 'EU', dpa: 'https://betterstack.com/legal/dpa' },
  { name: 'Cronitor', purpose: 'Cron heartbeat monitoring', region: 'US', dpa: 'https://cronitor.io/legal/dpa' },
];

export default function DataProcessorsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Data processors</h1>
      <p className="mb-4 text-sm">Penny uses the following third-party processors. Each has a signed Data Processing Agreement on file.</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Processor</th>
            <th className="text-left py-2">Purpose</th>
            <th className="text-left py-2">Region</th>
            <th className="text-left py-2">DPA</th>
          </tr>
        </thead>
        <tbody>
          {processors.map((p) => (
            <tr key={p.name} className="border-b">
              <td className="py-2 font-medium">{p.name}</td>
              <td className="py-2">{p.purpose}</td>
              <td className="py-2">{p.region}</td>
              <td className="py-2"><a href={p.dpa} className="underline" target="_blank" rel="noreferrer">link</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/privacy/data-processors
git commit -m "feat(privacy): public data processors list"
```

### Task 9.3: Delete-my-data endpoint

**Files:**
- Create: `src/app/api/privacy/delete-my-data/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/privacy/delete-my-data/route.ts
import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function handler(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token)).uid; }
  catch { return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 }); }

  // Firestore: delete user-scoped docs across primary collections
  const batches = [
    adminDb.collection('expenses').where('userId', '==', uid).get(),
    adminDb.collection('budgets_personal').where('userId', '==', uid).get(),
    adminDb.collection('income_sources_personal').where('userId', '==', uid).get(),
    adminDb.collection('savings_goals_personal').where('userId', '==', uid).get(),
    adminDb.collection('conversations').where('userId', '==', uid).get(),
    adminDb.collection('notifications').where('userId', '==', uid).get(),
    adminDb.collection('users').where('__name__', '==', uid).get(),
  ];
  const results = await Promise.all(batches);
  for (const snap of results) {
    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Revoke refresh tokens + delete auth record
  await adminAuth.revokeRefreshTokens(uid);
  await adminAuth.deleteUser(uid);

  // Downstream best-effort deletes (fire and forget)
  const deletes: Promise<unknown>[] = [];
  if (process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID) {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
    deletes.push(fetch(`${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/persons/?distinct_id=${uid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
    }));
  }
  if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT_WEB) {
    deletes.push(fetch(`https://sentry.io/api/0/projects/${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT_WEB}/users/${uid}/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
    }));
  }
  await Promise.allSettled(deletes);

  return new Response(JSON.stringify({ status: 'deleted' }), { status: 200 });
}

export const POST = withObservability(handler, { route: '/api/privacy/delete-my-data' });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/privacy/delete-my-data
git commit -m "feat(privacy): delete-my-data endpoint"
```

---

## Phase 10 — CI/CD polish

### Task 10.1: CODEOWNERS

**Files:**
- Create: `.github/CODEOWNERS`

- [ ] **Step 1: Author**

```
# Critical paths require owner review
src/app/api/**          @sarathfrancis
src/lib/observability/  @sarathfrancis
src/lib/admin-auth.ts   @sarathfrancis
database/firestore.rules @sarathfrancis
PRIVACY.md              @sarathfrancis
docs/observability/     @sarathfrancis
```

- [ ] **Step 2: Commit**

```bash
git add .github/CODEOWNERS
git commit -m "chore: CODEOWNERS for critical paths"
```

### Task 10.2: PR template

**Files:**
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Author**

```markdown
## Summary

<!-- 1-3 bullets of what changed and why -->

## Observability checklist

- [ ] No PII added to logs, events, or error reports
- [ ] New API route wrapped with `withObservability`
- [ ] New business event registered in `TrackableEvent` union
- [ ] Feature flag considered for risky changes
- [ ] Privacy impact considered (processor list up to date)

## Test plan

- [ ] Unit tests added/updated
- [ ] Type-check passes (`npx tsc --noEmit`)
- [ ] Lint passes (`npm run lint`)
- [ ] Manual smoke test in staging
```

- [ ] **Step 2: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "chore: PR template with observability checklist"
```

### Task 10.3: Issue templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/observability_alert.md`

- [ ] **Step 1: Author bug_report.md**

```markdown
---
name: Bug report
about: Report a defect
labels: bug
---

## Steps to reproduce
1.

## Expected vs actual

## Environment
- Platform (web / ios / android):
- App version:
- Sentry issue URL (if any):
- Request ID (from Axiom or 500 response):
```

- [ ] **Step 2: Author observability_alert.md**

```markdown
---
name: Observability alert (auto-generated)
about: System alert from monitoring
labels: observability, alert
---

**Severity:**
**Source:**
**Description:**

Links:
- Sentry:
- Axiom:
- PostHog:
```

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE
git commit -m "chore: bug + alert issue templates"
```

### Task 10.4: Mobile release workflow — Sentry release + symbol upload

**Files:**
- Modify: `mobile/fastlane/Fastfile`
- Modify: `.github/workflows/mobile-release.yml`

- [ ] **Step 1: Fastfile lane for Sentry release**

```ruby
# mobile/fastlane/Fastfile — add inside existing file
lane :sentry_release_ios do |opts|
  next if ENV['SENTRY_AUTH_TOKEN'].to_s.empty?
  sentry_create_release(
    auth_token: ENV['SENTRY_AUTH_TOKEN'],
    org_slug: ENV['SENTRY_ORG'],
    project_slug: ENV['SENTRY_PROJECT_MOBILE'],
    version: opts[:version],
    finalize: true,
  )
  sentry_upload_dif(
    auth_token: ENV['SENTRY_AUTH_TOKEN'],
    org_slug: ENV['SENTRY_ORG'],
    project_slug: ENV['SENTRY_PROJECT_MOBILE'],
    path: './build/ios/archive/',
  )
end
```

- [ ] **Step 2: Call from ship lane**

In existing `ship` lane for iOS, after build, before `repair_and_submit`, call `sentry_release_ios(version: app_version)`.

- [ ] **Step 3: mobile-release.yml updates**

In `.github/workflows/mobile-release.yml`, the iOS job's env must include:

```yaml
env:
  SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
  SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
  SENTRY_PROJECT_MOBILE: ${{ secrets.SENTRY_PROJECT_MOBILE }}
```

Add `bundle exec fastlane plugins add sentry` to the bundle install step (or add to `mobile/fastlane/Pluginfile`).

- [ ] **Step 4: Pluginfile**

Add to `mobile/fastlane/Pluginfile`:

```ruby
gem 'fastlane-plugin-sentry'
```

- [ ] **Step 5: Commit**

```bash
git add mobile/fastlane .github/workflows/mobile-release.yml
git commit -m "feat(ci): Sentry release + symbol upload in mobile release pipeline"
```

---

## Self-review notes

(Executor self-check at the end of execution, or during per-phase commits:)

- [ ] Every Phase 1-9 task has at least one test referenced or explicit "no test applicable, manual verification" note.
- [ ] Every module reads `process.env.OBSERVABILITY_ENABLED` or Flutter equivalent before side-effecting.
- [ ] No secrets committed — all values read from env.
- [ ] No PII field names (`amount`, `vendor`, `email`, `description`) appear in tracked event property shapes.
- [ ] `withObservability` applied to every API route under `src/app/api/`.
- [ ] Admin routes all use `verifyAdmin`.
- [ ] Consent banner shown before PostHog init on unset state.

---

## Rollout sequence (after all phases land)

1. User completes Phase 0 (accounts, secrets, staging Firebase).
2. Set Vercel env `OBSERVABILITY_ENABLED=true` on **preview/staging** only.
3. Deploy staging. Run smoke test from `docs/observability/STAGING.md`.
4. If all green for 24h, flip **production** `OBSERVABILITY_ENABLED=true`.
5. Monitor Sentry / PostHog / Axiom quota burn in first 48h.
6. If quota burn > 50% in 48h, tune `tracesSampleRate` / `autocapture` config.
