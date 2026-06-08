# Standalone API Guide

This guide is for agents working on the active standalone API under `apps/api`. This API is the current dedicated backend for mobile-facing server work.

## Runtime Shape

- Framework: Fastify on Node.js 22.
- App factory: `apps/api/src/app.ts`.
- Production entrypoint: `apps/api/src/server.ts`.
- Env parsing: `apps/api/src/config/env.ts`.
- Container build: `Dockerfile.api`.
- Deployment workflow: `.github/workflows/api-cloud-run-deploy.yml`.
- OpenAPI artifact: `docs/api/openapi.json`.
- Route surface source: `scripts/api/route-surface.ts`.

Generated route reference: `docs/agents/generated/API_ROUTE_SURFACE.md`.

## App Composition

`buildApiApp()` in `apps/api/src/app.ts` creates the Fastify instance, registers core plugins, configures logging/redaction, installs request ID handling, decorates `request.user`, and registers route modules.

Route modules:

- `apps/api/src/routes/ai/routes.ts` - AI chat, expense analysis, conversation title generation.
- `apps/api/src/routes/expenses/routes.ts` - expense create/list/update/delete.
- `apps/api/src/routes/groups/routes.ts` - group list/create/update/delete, members, invitations, archive, leave.
- `apps/api/src/routes/budgets/routes.ts` - personal/group budgets and usage.
- `apps/api/src/routes/conversations/routes.ts` - conversations and messages.
- `apps/api/src/routes/user/routes.ts` - default group preference and account deletion.
- `apps/api/src/routes/compat/routes.ts` - registered compatibility endpoints that intentionally avoid 404s while business logic is still being ported.

Service modules live under `apps/api/src/services/`. Production services are composed in `apps/api/src/services/production.ts`.

Before treating any route as safe or complete, check `docs/agents/KNOWN_GAPS.md`. Some standalone routes are intentionally placeholder/partial while traffic is being migrated from the Next API.

## Authentication and Authorization

Firebase bearer auth is the normal user auth model:

1. Mobile calls `ApiClient`.
2. Dio interceptor attaches `Authorization: Bearer <Firebase ID token>`.
3. Route uses `preHandler: app.requireUser`.
4. `app.requireUser` calls the configured `AuthVerifier`.
5. Production verifier uses Firebase Admin token verification.
6. Routes use `request.user.uid`; request body `userId` is never authoritative when it conflicts with the token.

Agent rules:

- Use `preHandler: app.requireUser` for user-owned or group-owned routes.
- Reject body/query `userId` mismatches with 403, following existing route patterns.
- Validate group membership or role in the service layer before mutating group data.
- Do not rely on Firestore rules for API authorization; Admin SDK bypasses rules.
- Keep cron-only routes separate from Firebase user auth and require `CRON_SECRET`.

## Request and Error Conventions

The app uses JSON responses with request IDs. `jsonError()` in `apps/api/src/app.ts` shapes common errors.

Expected patterns:

- 400 for invalid input.
- 401 for missing/invalid bearer tokens.
- 403 for authenticated user mismatch or authorization failure.
- 404 only for truly missing resources/routes.
- 500 for unexpected server failures, without leaking sensitive details.

Logging redaction currently covers auth headers, cookies, tokens, secrets, passwords, receipt/image data, vendors, and amounts. Do not add logs that bypass these redaction rules.

## AI Routes

AI service contracts are in `apps/api/src/services/ai.ts`; Gemini-backed implementation is in `apps/api/src/services/gemini-ai.ts`.

AI rules:

- Keep Gemini API keys server-side only.
- Normalize categories through `packages/shared/src/categories.ts`.
- Avoid logging raw receipt images, vendor text, descriptions, or precise amounts.
- Keep response shapes compatible with mobile callers in `mobile/lib/data/repositories/ai_repository.dart`.
- Update AI route tests when prompts, request shapes, or response shapes change.

## Firestore and Services

Firestore-backed services live in files named `firestore-*.ts`. These are API-side data contracts and must stay aligned with:

- Mobile models under `mobile/lib/data/models/`.
- Shared categories under `packages/shared/src/categories.ts`.
- Web/shared TypeScript contracts under `src/lib/types.ts` and `src/lib/types/**`.
- Firestore rules and indexes under `database/`.

Agent rules:

- Server writes must include fields needed by mobile direct Firestore reads.
- Group data must validate membership/role before mutation.
- Budget records use `monthlyLimit`; do not introduce `limit` as a replacement field.
- Group activity collection naming must be checked before adding activity behavior.

## Route Surface and OpenAPI

The route surface is intentionally centralized in `scripts/api/route-surface.ts`. It drives:

- API contract generation in `scripts/api/generate-openapi.ts`.
- Parity checks in `scripts/api/compare-old-new.ts`.
- Generated agent docs.

When adding or changing routes:

- Update the Fastify route module.
- Update the service layer under `apps/api/src/services/`.
- Update mobile endpoint constants/callers if mobile will call the route.
- Update `scripts/api/route-surface.ts`.
- Update route tests under the matching `apps/api/src/routes/**/__tests__/` directory.
- Run `npm run api:contract`; commit `docs/api/openapi.json` only if the generated artifact changes.
- Run `npm run docs:agents:generate`, `npm run docs:agents:check`, and `npm run docs:agents:lint` so generated route docs stay current.

## Compatibility Routes

Compatibility and placeholder routes are registered so staged routing tests do not silently 404 while traffic is being moved from the Next app/API to the standalone API. A registered compatibility or placeholder route does not mean full business logic is implemented.

Current compatibility source: `apps/api/src/routes/compat/routes.ts`.

Current standalone API incompleteness to keep visible:

- `GET /api/expenses` returns an empty placeholder list.
- `POST /api/privacy/delete-my-data` and `GET /api/cron/store-metrics` are compatibility placeholders.
- Expense creation does not yet port every Next API side effect such as notifications, push, budget alerts, and approval-required behavior.
- Group update authorization is a known gap; inspect and fix before extending or copying that pattern.

Agent rules:

- Do not treat compatibility responses as complete product behavior.
- When porting a compatibility route, move behavior into an appropriate route/service module and update tests, route surface, OpenAPI, docs, and parity coverage.
- Keep compatibility notes in `docs/api/README.md` current.

## Local Development and Validation

Common commands:

- `npm run api:dev` - run the standalone API locally through `tsx watch`.
- `npm run api:typecheck` - TypeScript check for `apps/api` and `packages/shared`.
- `npm run api:test` - Vitest suite for API and shared packages.
- `npm run api:build` - bundle API to `dist/api`.
- `npm run api:check` - typecheck, tests, and build.
- `npm run api:contract` - verify `docs/api/openapi.json` is current.
- `npm run api:smoke` - smoke deployed API health endpoint.
- `npm run api:parity` - compare old and new API behavior.

Cloud Run deploy verification runs `npm run api:check && npm run api:contract` before container build.

Route-surface validation should prove three things together: Fastify route registration, `scripts/api/route-surface.ts`, and `docs/api/openapi.json`. Do not treat `api:contract` alone as runtime parity; it only checks OpenAPI against the route-surface file.

## Environment and Secrets

Env parsing lives in `apps/api/src/config/env.ts`.

Important variables:

- `PORT`
- `NODE_ENV`
- `API_CORS_ORIGINS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_AUTH_PROJECT_ID`
- `FIREBASE_ADMIN_CREDENTIALS`
- `FIRESTORE_PROJECT_ID`
- `FIRESTORE_DATABASE_ID`
- `GEMINI_API_KEY`
- `CRON_SECRET`
- `OBSERVABILITY_ENABLED`
- `OBSERVABILITY_ENV`

Never copy secret values into docs or logs. Reference variable names and file paths only.

GitHub deploy workflow variables and secrets are defined in `.github/workflows/api-cloud-run-deploy.yml`. When debugging deployment, inspect that workflow for `GCP_PROJECT_ID`, `GCP_REGION`, Artifact Registry, Cloud Run service names, workload identity, deploy service account, runtime service account, Secret Manager names, and optional smoke-test URL.
