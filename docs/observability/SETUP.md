# Observability Setup Runbook (Phase 0)

One-time manual actions required before the observability stack can connect
to real services. Observability code in the repo is safe to merge without
completing this — every module is gated by `OBSERVABILITY_ENABLED` env var
plus presence of the relevant credential.

## Checklist

- [ ] **0.1** Sentry EU account + projects
- [ ] **0.2** PostHog EU project + personal API key
- [ ] **0.3** Axiom EU datasets
- [ ] **0.4** BetterStack workspace
- [ ] **0.5** Cronitor heartbeat monitor
- [ ] **0.6** Discord server + 5 channel webhooks
- [ ] **0.7** `penny-staging` Firebase project + plists
- [ ] **0.8** App Store staging bundle ID _(optional until mobile staging ready)_
- [ ] **0.9** Google Play Developer API access
- [ ] **0.10** App Store Connect API key
- [ ] **0.11** All secrets pasted into GitHub Actions + Vercel envs
- [ ] **0.12** Firebase custom claim for admin UID (run `scripts/grant-admin.ts`)
- [ ] **0.13** BetterStack monitors bootstrapped (run `scripts/bootstrap-uptime.ts`)
- [ ] **0.14** Axiom Vercel integration installed (logs will start flowing)
- [ ] **0.15** Signed DPAs filed for Sentry, PostHog, Axiom, BetterStack

## Secrets inventory

Paste into GitHub repo → Settings → Secrets and variables → Actions, and
into Vercel project → Settings → Environment Variables (scope: Production + Preview).

### Sentry (EU region)

| Name | Value | Vercel | GH |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | project DSN URL (from `penny-web`) | ✓ | ✓ |
| `SENTRY_AUTH_TOKEN` | API token with `project:releases`, `project:read`, `org:read` | ✓ | ✓ |
| `SENTRY_ORG` | `penny-ai` (your org slug) | ✓ | ✓ |
| `SENTRY_PROJECT_WEB` | `penny-web` | ✓ | ✓ |
| `SENTRY_PROJECT_MOBILE` | `penny-mobile` | — | ✓ |

### PostHog (EU region)

| Name | Value | Vercel | GH |
|---|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | project API key (`phc_…`) | ✓ | — |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` | ✓ | — |
| `POSTHOG_PERSONAL_API_KEY` | personal API key (`phx_…`) | ✓ | — |
| `POSTHOG_PROJECT_ID` | numeric project id (from URL) | ✓ | — |

### Axiom (EU region)

| Name | Value | Vercel | GH |
|---|---|---|---|
| `AXIOM_TOKEN` | ingest token | — | — |
| `AXIOM_DATASET` | `penny-web-prod` / `penny-web-staging` (per env) | — | — |

_Installed via Vercel's Axiom integration, which wires these automatically._

### BetterStack

| Name | Value | Vercel | GH |
|---|---|---|---|
| `BETTERSTACK_API_KEY` | bearer token | ✓ | — |

### Cronitor

| Name | Value | Vercel | GH |
|---|---|---|---|
| `CRONITOR_API_KEY` | API key | — | ✓ |
| `CRONITOR_STORE_METRICS_TOKEN` | heartbeat token segment | ✓ | — |

### Discord

| Name | Value | Vercel | GH |
|---|---|---|---|
| `DISCORD_WEBHOOK_ALERTS_CRITICAL` | webhook URL | ✓ | ✓ |
| `DISCORD_WEBHOOK_ALERTS_WARNING` | webhook URL | ✓ | ✓ |
| `DISCORD_WEBHOOK_ALERTS_INFO` | webhook URL | ✓ | ✓ |
| `DISCORD_WEBHOOK_STORE_METRICS` | webhook URL | ✓ | — |
| `DISCORD_WEBHOOK_DEPLOYS` | webhook URL | — | ✓ |

### GitHub Issue auto-creation

| Name | Value | Vercel | GH |
|---|---|---|---|
| `GITHUB_ISSUE_TOKEN` | PAT with `issues:write` | ✓ | — |
| `GITHUB_ISSUE_REPO` | e.g. `sarathfrancis/penny` | ✓ | — |
| `ALERT_FORWARD_SECRET` | random 32-byte hex — for HMAC signing | ✓ | ✓ |

### Store metrics

| Name | Value | Vercel | GH |
|---|---|---|---|
| `APP_STORE_CONNECT_KEY_ID` | `P97VLS6M6Z` (existing) | ✓ | ✓ |
| `APP_STORE_CONNECT_ISSUER_ID` | existing | ✓ | ✓ |
| `APP_STORE_CONNECT_P8_BASE64` | base64 of `.p8` contents | ✓ | ✓ |
| `APP_STORE_CONNECT_APP_ID` | numeric from ASC | ✓ | — |
| `GOOGLE_PLAY_API_JSON_BASE64` | base64 of service account JSON | ✓ | ✓ |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.pennyai.penny` | ✓ | — |
| `CRON_SECRET` | random 32-byte hex — Vercel sends as Bearer on cron | ✓ | — |

### Firebase staging

| Name | Value | Vercel | GH |
|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_STAGING_JSON_BASE64` | base64 of service account | — | ✓ |
| `NEXT_PUBLIC_FIREBASE_*_STAGING` | all staging web config keys | ✓ (staging env) | — |
| `FIREBASE_PROJECT_ID_STAGING` | `penny-staging` | ✓ | ✓ |

### Kill switch + environment

| Name | Production | Staging | Preview |
|---|---|---|---|
| `OBSERVABILITY_ENABLED` | `true` _(flip last)_ | `true` | `false` until ready |
| `OBSERVABILITY_ENV` | `production` | `staging` | `preview` |

## Bootstrap scripts

After secrets are in place:

```bash
# 1. Grant yourself admin claim (one-off)
FIREBASE_ADMIN_CREDENTIALS='<service account JSON>' npx tsx scripts/grant-admin.ts <your firebase uid>

# 2. Bootstrap BetterStack monitors
BETTERSTACK_API_KEY=... npx tsx scripts/bootstrap-uptime.ts

# 3. Install Axiom via Vercel dashboard (no script — UI-driven)
```

## Rotation schedule

| Secret | Rotate every |
|---|---|
| `SENTRY_AUTH_TOKEN` | 90 days |
| `POSTHOG_PERSONAL_API_KEY` | 90 days |
| `AXIOM_TOKEN` | 180 days |
| `GITHUB_ISSUE_TOKEN` | 90 days (fine-grained PAT auto-expires) |
| Firebase service accounts | 365 days |
| `ALERT_FORWARD_SECRET`, `CRON_SECRET` | on suspected compromise only |

## Verification

After all secrets pasted and `OBSERVABILITY_ENABLED=true` in staging, run the
smoke test in `docs/observability/STAGING.md`.
