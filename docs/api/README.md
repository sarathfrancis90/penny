# Penny Standalone API

This directory documents the standalone API service under `apps/api`. For agentic engineering context, read `docs/agents/STANDALONE_API_GUIDE.md` and `docs/agents/MOBILE_API_CONTRACTS.md` before changing this API.

The standalone API is the active dedicated backend for current mobile server work. The Next.js API under `src/app/api` still exists for web, legacy, and compatibility flows; do not assume mobile should use `src/app/api` unless the current mobile environment configuration or endpoint constants explicitly point there.

## Runtime

- Framework: Fastify on Node.js 22.
- Container entrypoint: `dist/api/server.js`, built from `apps/api/src/server.ts`.
- Deployment target: Cloud Run via `Dockerfile.api`, `cloudbuild.api.yaml`, or `.github/workflows/api-cloud-run-deploy.yml`.
- Firebase Admin uses Application Default Credentials in Cloud Run. Local service-account JSON remains supported through `FIREBASE_ADMIN_CREDENTIALS`.
- `FIREBASE_AUTH_PROJECT_ID` can point token verification at the mobile Firebase project while Firestore remains in the Cloud Run data project.

## Contract Sources

- Fastify app: `apps/api/src/app.ts`
- Production server: `apps/api/src/server.ts`
- Route surface: `scripts/api/route-surface.ts`
- Generated OpenAPI: `docs/api/openapi.json`
- Generated agent route table: `docs/agents/generated/API_ROUTE_SURFACE.md`
- Generated mobile endpoint matrix: `docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md`

## Implemented Service Areas

- Health and readiness: `/api/healthz`, `/api/readyz`.
- Firebase bearer authentication middleware.
- AI: expense analysis, AI chat, conversation title generation.
- Expenses: create, update, delete. Listing keeps the old placeholder behavior.
- Groups: list, create, update, soft delete.
- Budgets: personal/group CRUD and usage.
- Conversations: conversation CRUD and message list/create.
- User preferences: default group get/set/clear.
- Account deletion: Firestore cleanup plus Firebase Auth deletion.

Compatibility routes are registered for privacy deletion and cron metrics so staged routing tests do not silently 404. Group-member/invitation lifecycle plus group archive/leave currently live in `apps/api/src/routes/groups/routes.ts`, not in the compatibility module.

Some standalone routes are partial or placeholders. `GET /api/expenses` returns an empty placeholder list, and expense creation does not yet port every Next API side effect such as notifications, push, budget alerts, and approval-required behavior.

When a route moves from compatibility to full implementation, update the route module, service layer, tests, `scripts/api/route-surface.ts`, `docs/api/openapi.json`, generated agent docs, and this README if the implemented service area changes.

## Required Cloud Run Configuration

Set these environment variables or secrets on the service:

- `NODE_ENV=production`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_AUTH_PROJECT_ID` when mobile/web Firebase Auth tokens are issued by a different Firebase project.
- `FIRESTORE_PROJECT_ID` when Firestore should use a project different from the Cloud Run host project. For the current mobile app, this should stay aligned with the Firebase project used by the generated mobile Firebase config.
- `FIRESTORE_DATABASE_ID` when not using the default Firestore Native database.
- `GEMINI_API_KEY` as a Secret Manager secret.
- `CRON_SECRET` as a Secret Manager secret.
- `API_CORS_ORIGINS` with comma-separated web/mobile origins.

The runtime service account needs Firestore access, Firebase Auth admin permissions for account deletion, and Secret Manager secret access for the configured secrets.

## Validation

Run before deployment:

```bash
npm run docs:auto
npm run api:check
npm run api:contract
npm run typecheck
npm run test
npm run lint
npm run build
```

After deployment:

```bash
API_BASE_URL=https://YOUR-CLOUD-RUN-URL npm run api:smoke
OLD_API_BASE_URL=https://YOUR-NEXT-APP \
NEW_API_BASE_URL=https://YOUR-CLOUD-RUN-URL \
npm run api:parity
```

Add `FIREBASE_ID_TOKEN` and `API_PARITY_USER_ID` to compare authenticated safe GET routes. Set `API_PARITY_MUTATE=true` only against disposable staging data.
