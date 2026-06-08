# Web App Guide

## Stack

The web app is a Next.js App Router application using TypeScript, React 19, Tailwind CSS 4, Firebase, Firebase Admin, Gemini through `@google/genai`, Sentry, PostHog, Vercel Analytics, Dexie, Radix/shadcn-style UI components, and Vitest.

Use `package.json` as the source of truth for versions and scripts.

## Important Entrypoints

- `src/app/layout.tsx` - root layout and providers.
- `src/app/page.tsx` - primary AI chat and expense capture page.
- `src/components/auth-guard.tsx` - client auth routing gate.
- `src/components/app-layout.tsx` - authenticated shell with navigation, header, sync indicator, and user menu.
- `src/lib/firebase.ts` - client Firebase initialization.
- `src/lib/firebase-admin.ts` - server Firebase Admin initialization.
- `src/lib/types.ts` - central TypeScript domain contracts.
- `src/lib/categories.ts` - CRA category constants.

## App Routes

Major pages under `src/app/` include:

- `/` - AI chat and quick expense creation.
- `/dashboard` - dashboard experience.
- `/analytics` - analytics and reporting.
- `/budgets` - budgeting UI.
- `/finances` - finance overview.
- `/income` - income management.
- `/savings` - savings goals.
- `/groups` and group detail/member/invitation routes.
- `/notifications` - notification center.
- `/profile` and `/settings` - user settings.
- `/login`, `/signup`, `/forgot-password`, `/reset-password` - auth pages.
- `/privacy`, `/support`, `/account/delete` - support/privacy flows.
- `/admin-console` - legacy admin console.

Auth behavior is client-enforced in `auth-guard.tsx`. Public routes are explicitly listed there. Do not add a new public page without updating and reviewing `src/components/auth-guard.tsx`.

## API Route Inventory

API routes are implemented by `route.ts` files under `src/app/api/`. Current route areas:

These are the Next.js web/API routes. Active mobile backend work generally targets the standalone Fastify API under `apps/api`; read `STANDALONE_API_GUIDE.md` before changing mobile-facing server behavior.

- `account/delete` - authenticated account deletion.
- `admin/**` - admin analytics, users, config, costs, uptime, error trends, store metrics, system state.
- `ai-chat` - conversational AI.
- `alerts/**` - issue creation and Discord forwarding.
- `analyze-expense` - AI receipt/text extraction.
- `auth/passkey/**` - WebAuthn registration, authentication, listing, deletion, and session creation.
- `budgets/**` - personal and group budget CRUD, usage, alerts.
- `conversations/**` - conversation list/detail/messages/title generation.
- `cron/store-metrics` - scheduled store metric collection.
- `expenses` and `expenses/[id]` - expense CRUD and status changes.
- `groups/**` - group creation, list, detail, archive, leave, invitations, and membership operations.
- `healthz` - health check.
- `privacy/delete-my-data` - privacy deletion flow.
- `user/default-group` - default group state.

When adding an API route:

- Use `withObservability({ route: '<name>' })` unless there is a reason not to.
- Authenticate with `getAuthenticatedUserId(req)` for mobile-compatible bearer token auth when user identity matters.
- Validate group membership server-side before writing group data.
- Avoid accepting `userId` from request body as authority unless the route is intentionally legacy and protected elsewhere.
- Return structured JSON errors and useful status codes.
- Consider Firestore rule compatibility for any client-side follow-up reads.

## Authentication

Web client auth uses Firebase Auth. Server-side user auth is handled by `getAuthenticatedUserId()` in `src/lib/auth-middleware.ts`, which validates Firebase ID tokens from the `Authorization` header through Firebase Admin.

Admin auth has two patterns:

- `src/lib/admin-auth.ts` implements legacy username/password login and signed cookies for `/admin-console` style routes.
- `verifyAdmin()` in `src/lib/auth-middleware.ts` checks Firebase custom claims and is used by selected observability/admin proxy endpoints.

Do not assume admin status is uniformly enforced across all admin routes. Inspect the target route before changing it.

## Data Access Patterns

Client-side hooks live under `src/hooks/`. Common hooks include auth, conversations, expenses, groups, notifications, offline sync, and PWA helpers.

Service modules under `src/lib/services/` encapsulate reusable server/client business logic for budgets, income, savings, notifications, push notifications, cleanup, and related workflows.

The app uses both direct Firestore client access and server API routes. Before changing a data flow, identify whether the current path is:

- Firestore client direct.
- Server route using Firebase Admin.
- Mobile API-compatible route.
- Mixed web-only legacy route.

## UI System

UI components are under `src/components/` and `src/components/ui/`. Styling uses Tailwind CSS 4 and project-level global styles in `src/app/globals.css`.

Important conventions:

- Prefer existing UI components before adding new primitives.
- Toasts are centralized through existing toast/sonner patterns.
- Avoid native browser dialogs for user-facing flows.
- Preserve existing design language unless the task is explicitly redesign work.
- Keep mobile web behavior in mind for primary flows.

## Observability

Observability files are under `src/lib/observability/` plus Sentry instrumentation files at the repo root.

Core behavior:

- `OBSERVABILITY_ENABLED === 'true'` is the main kill switch.
- Sentry is configured for client, server, and edge runtimes.
- PostHog captures typed events and strips known PII keys.
- Pino logging uses redaction rules.
- Middleware wraps API responses with request IDs and structured logging.

When adding telemetry:

- Do not send raw expense descriptions, receipts, vendor text, email addresses, tokens, or precise amounts unless the existing analytics contract explicitly allows it.
- Use typed analytics events in `src/lib/observability/analytics.ts`.
- Prefer route-level observability middleware over ad hoc logging.

## Offline and Local State

The web app includes offline-aware pieces and sync indicators in hooks/components. Search current `src/hooks/` and `src/components/` before changing offline or sync behavior.

Do not change offline behavior casually. Check how pending expenses, conversations, or sync indicators behave before altering Firestore writes or API calls.

## AI Routes

AI behavior currently lives primarily in:

- `src/app/api/ai-chat/route.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/conversations/[conversationId]/generate-title/route.ts`

Agents modifying AI should:

- Keep prompts aligned with Canadian self-employed tax use cases.
- Preserve strict JSON parsing contracts where clients expect structured data.
- Keep model names and API key handling centralized inside route logic.
- Update tests and docs when response shape changes.
- Avoid logging raw receipt images or sensitive finance text.

## Web Validation Commands

Use the smallest relevant set:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

For docs-only changes, these may be unnecessary. For API, type, or UI changes, run at least typecheck and lint when feasible. For behavior changes, add or update Vitest tests under `src/**/__tests__`, `src/**/*.test.ts`, or `src/**/*.test.tsx`.

## Web Change Checklist

- Identify route, hook, service, type, and Firestore rule impact.
- Check mobile contract impact before changing shared data.
- Use `withObservability` for new server routes.
- Confirm auth path and group membership checks.
- Avoid introducing new client-side broad Firestore reads.
- Validate category strings against `src/lib/categories.ts`.
- Update `docs/agents/` when behavior or contracts change.
