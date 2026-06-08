# Mobile API Contracts

This guide documents the contract boundary between the Flutter mobile app and the standalone API.

## Source of Truth

- Mobile endpoint constants: `mobile/lib/core/network/api_endpoints.dart`.
- Mobile HTTP client: `mobile/lib/core/network/api_client.dart`.
- Mobile API matrix: `docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md`.
- Standalone API route surface: `scripts/api/route-surface.ts`.
- Generated API route docs: `docs/agents/generated/API_ROUTE_SURFACE.md`.
- OpenAPI artifact: `docs/api/openapi.json`.
- Standalone API implementation: `apps/api/src/routes/**` and `apps/api/src/services/**`.
- Raw mobile API literal inventory: included in `docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md` as `raw-literal` rows.

## Contract Rule

Any mobile/API contract change must update all affected layers in one change:

- Mobile endpoint constant or caller.
- Standalone API route module.
- Standalone API service/serializer.
- Route surface in `scripts/api/route-surface.ts`.
- OpenAPI artifact if route surface changes.
- Generated agent docs.
- Mobile tests and API tests for changed behavior.
- Firebase rules/indexes if mobile reads or writes Firestore directly after the API call.

Do not update only mobile or only the API unless the other side is provably unaffected.

## Auth Contract

Mobile sends Firebase ID tokens through `Authorization: Bearer <token>`. Standalone API routes that need a user must use `preHandler: app.requireUser`.

Rules:

- API routes must use `request.user.uid` as the authoritative user ID.
- If a legacy/mobile request includes `userId`, the API must reject mismatches with 403.
- Missing or invalid bearer tokens should produce 401 with JSON error shape.
- Mobile callers should not pass secrets, Gemini keys, or admin credentials.
- Guest-mode mobile flows must not call authenticated API routes unless the user is signed in.

## Active Mobile Endpoint Set

The generated matrix lists all current constants and callers. High-level ownership:

- `ApiEndpoints.aiChat` -> standalone AI chat route.
- `ApiEndpoints.analyzeExpense` -> standalone AI expense analysis route.
- `ApiEndpoints.expenses` -> standalone expense route for server-authoritative expense operations.
- `ApiEndpoints.groups`, `groupById`, `groupMembers`, `acceptInvitation` -> standalone group routes.
- `ApiEndpoints.groupBudgets` -> standalone group budget route; generated matrix currently shows no direct mobile caller.
- `ApiEndpoints.generateConversationTitle` -> standalone AI title route.
- Account deletion is currently called through a raw mobile literal and appears in the generated matrix as `raw:/api/account/delete`.
- Existing screen/widget raw calls and path-appended calls are migration targets; do not assume the generated `ApiEndpoints` rows are the complete caller set without checking `raw-literal` rows.

Before adding a new constant, search mobile for direct string paths and consolidate through `ApiEndpoints` when practical.

## Direct Firestore Versus API

Use direct Firestore when the existing mobile repository already performs a rules-safe, user-scoped or group-scoped read/write that benefits from real-time updates or offline behavior.

Use the standalone API when:

- Gemini or another server-only secret is required.
- Firebase Admin authority is required.
- The operation spans multiple documents and must be atomic.
- Group membership/role checks need server authority.
- Notifications, group activity, budget alerts, account deletion, or other side effects must be coordinated.
- The operation must match web/legacy behavior during API cutover.

If unsure, inspect the existing repository for that domain and preserve the current pattern unless there is a clear safety reason to change it.

Current direct-write exceptions to inspect carefully:

- `mobile/lib/data/repositories/group_budget_repository.dart` writes `budgets_group` directly; owner/admin semantics must remain aligned with Firestore rules and API services.
- Some expense and group-member API mutations are still initiated from screens/widgets. Treat these as existing exceptions or migration targets, not a pattern to copy.

## Data Shape Contracts

Mobile Dart models and API serializers must agree on field names, timestamp handling, status strings, category strings, and optional defaults.

Critical contracts:

- Expense categories must match `packages/shared/src/categories.ts`, `src/lib/categories.ts`, and `mobile/lib/core/constants/categories.dart`.
- Budget limit field is `monthlyLimit`.
- Group membership document IDs must use `{groupId}_{userId}` and include role, active status, and permission flags.
- Conversation messages must agree on role names, timestamp fields, attachments, and optional expense data.
- Notification payloads should not contain unnecessary sensitive financial detail.

## Compatibility With Next API

The web app still contains `src/app/api/**` routes. For active mobile work, treat the standalone API under `apps/api` as the target unless mobile `EnvConfig` or endpoint constants explicitly point at the web/Vercel app.

Current environment drift:

- Mobile staging default points at the Cloud Run standalone API.
- Mobile production default points at the Vercel app.

Do not assume production mobile traffic is fully cut over to Cloud Run until `mobile/lib/core/constants/env_config.dart` says so or deployment configuration confirms it.

## Testing and Drift Prevention

Required checks by change type:

- Endpoint constant or route surface changed: `npm run api:contract`, `npm run docs:agents:generate`, `npm run docs:agents:check`.
- Standalone API behavior changed: `npm run api:check`.
- Mobile caller changed: `cd mobile && flutter analyze` and targeted `flutter test`.
- Mobile route/auth/full-flow changed: run targeted integration tests under `mobile/integration_test` when feasible.
- Contract docs changed: `npm run docs:agents:lint`.
- Old/new route migration: use `npm run api:parity` with disposable staging data for mutating comparisons.

Agents should finish by checking `git status --short` and confirming generated docs are committed with any source changes that caused them.
