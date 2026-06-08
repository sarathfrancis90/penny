# Repository Guide

## Product

Penny is an AI-assisted expense, group spending, budgeting, income, savings, and conversation product aimed at Canadian self-incorporated software professionals. Core product behavior centers on:

- Capturing expenses from text, image receipts, voice-adjacent chat inputs, and manual forms.
- Classifying expenses into CRA T2125 business categories.
- Supporting personal and group expense workflows.
- Providing mobile-first access with offline-aware Firestore streams.
- Using AI to extract structured expense data and answer finance questions.
- Maintaining observability, admin tooling, and release automation.

## Repository Shape

- `src/` contains the Next.js web app, legacy/web API routes, shared TypeScript types, Firebase clients, server helpers, services, hooks, and UI components.
- `apps/api/` contains the standalone Fastify API used for active mobile backend work.
- `packages/shared/` contains shared contracts reused by the standalone API.
- `mobile/` contains the Flutter iOS/Android app with layer-oriented data/presentation structure, Riverpod providers, Firebase integrations, native project files, and fastlane release automation.
- `database/` contains Firestore rules, indexes, storage rules, and database-focused documentation.
- `docs/` contains historical and current product, technical, launch, implementation, and agent documentation.
- `.github/` contains CI, Firebase deploy, mobile release, and fallback metrics workflows.
- `.cursor/`, `.claude/`, `.githooks/`, and root config files define local agent/editor/testing behavior.

## Runtime Architecture

### Web and Next API

The web application is a Next.js App Router project. `src/app/layout.tsx` wraps the app with theme, authentication, error boundary, analytics, Sentry user context, consent, and Vercel performance components. `src/components/auth-guard.tsx` enforces client-side route access for public and protected pages.

API routes under `src/app/api/**/route.ts` implement the Next/web API surface, including legacy or compatibility behavior for AI analysis, chat, expenses, groups, budgets, conversations, passkeys, account deletion, admin console endpoints, observability proxies, privacy deletion, health checks, and scheduled metrics. Most routes use `withObservability()` from `src/lib/observability/withObservability.ts` for request IDs, logging, spans, and structured error capture.

### Standalone API

The active dedicated API for mobile backend work is the Fastify service under `apps/api`. `apps/api/src/app.ts` builds the app, `apps/api/src/server.ts` starts production, route modules live under `apps/api/src/routes/`, and services live under `apps/api/src/services/`. Route contracts are centralized in `scripts/api/route-surface.ts` and generated to `docs/api/openapi.json`.

### Mobile

The Flutter app starts in `mobile/lib/main.dart`, initializes Firebase, Crashlytics, background messaging, Hive boxes, services, and then launches `PennyApp` from `mobile/lib/app.dart`. Routing is centralized in `mobile/lib/core/router/app_router.dart` with onboarding, auth redirects, guest mode, tab shell routes, and pushed feature routes.

Mobile uses a hybrid backend model:

- Direct Firestore streams/writes for many user-owned resources.
- Standalone Fastify API routes for AI, expense analysis, group operations requiring server authority, and other complex transactions.
- Dio-based HTTP with Firebase ID token injection in `mobile/lib/core/network/api_client.dart`.

### Firebase

Firebase is the shared backend for authentication, Firestore, storage, messaging, Crashlytics, and admin operations. Web server routes use Firebase Admin SDK helpers from `src/lib/firebase-admin.ts`; client code uses `src/lib/firebase.ts`. Mobile uses generated Firebase options and native platform config.

Rules and indexes are part of the product contract:

- Firestore rules: `database/firestore.rules`
- Storage rules: `database/storage.rules`
- Indexes: `database/firestore.indexes.json`

## Core Domains

### Expenses

TypeScript type: `Expense` in `src/lib/types.ts`.

Important web files:

- `src/app/page.tsx` - AI chat-driven expense capture.
- `src/app/api/analyze-expense/route.ts` - AI extraction and categorization.
- `src/app/api/expenses/route.ts` - create and list expenses.
- `src/app/api/expenses/[id]/route.ts` - update/delete/approve/reject expense.
- `src/lib/categories.ts` - canonical CRA categories.
- `src/hooks/useExpenses.ts` - web expense data access.

Important mobile files:

- `mobile/lib/data/models/expense_model.dart`
- `mobile/lib/data/repositories/expense_repository.dart`
- `mobile/lib/presentation/providers/expense_providers.dart`
- `mobile/lib/presentation/screens/expenses/**`
- `mobile/lib/core/constants/categories.dart`

Key contract: category strings must match exactly across web, mobile, AI prompts, and stored data.

### Conversations and AI

TypeScript types: `Conversation`, `ConversationMessage`, `ChatMessage` in `src/lib/types.ts`.

Important web files:

- `src/app/page.tsx`
- `src/app/api/ai-chat/route.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/conversations/**/route.ts`
- `src/hooks/useConversations.ts`
- `src/hooks/useConversationHistory.ts`
- `apps/api/src/routes/ai/routes.ts`
- `apps/api/src/routes/conversations/routes.ts`
- `apps/api/src/services/ai.ts`
- `apps/api/src/services/conversations.ts`

Important mobile files:

- `mobile/lib/data/models/message_model.dart`
- `mobile/lib/data/models/conversation_model.dart`
- `mobile/lib/data/repositories/ai_repository.dart`
- `mobile/lib/data/repositories/conversation_repository.dart`
- `mobile/lib/presentation/providers/chat_provider.dart`
- `mobile/lib/presentation/screens/home/**`

AI routes currently use Gemini via `@google/genai`. API key handling and model selection live in server-side route/service implementations.

### Groups

Types: `Group`, `GroupMember`, `GroupInvitation`, `GroupRole`, and permission helpers in `src/lib/types.ts`.

Important web files:

- `src/app/groups/**`
- `src/app/api/groups/**/route.ts`
- `src/components/groups/group-selector.tsx`
- `src/components/groups/**`
- `src/hooks/useGroups.ts`
- `apps/api/src/routes/groups/routes.ts`
- `apps/api/src/services/groups.ts`
- `apps/api/src/services/firestore-groups.ts`

Important mobile files:

- `mobile/lib/data/models/group_model.dart`
- `mobile/lib/data/models/group_member_model.dart`
- `mobile/lib/data/models/group_activity_model.dart`
- `mobile/lib/data/repositories/group_repository.dart`
- `mobile/lib/presentation/providers/group_providers.dart`
- `mobile/lib/presentation/screens/groups/**`

Key contract: group membership controls access. Any group data route must validate membership server-side or be safely constrained by Firestore rules and query filters.

### Budgets

Types: budget interfaces in `src/lib/types.ts` and mobile `mobile/lib/data/models/budget_model.dart`.

Important files:

- `src/app/api/budgets/**/route.ts`
- `src/app/api/expenses/route.ts` for post-expense budget checks.
- `src/lib/budgetCalculations.ts`
- `src/lib/services/budgetNotificationService.ts`
- `apps/api/src/routes/budgets/routes.ts`
- `apps/api/src/services/budgets.ts`
- `mobile/lib/data/models/budget_model.dart`
- `mobile/lib/data/repositories/budget_repository.dart`
- `mobile/lib/presentation/providers/budget_providers.dart`
- `mobile/lib/presentation/screens/budgets/**`

Key contract: stored budget limit field is `monthlyLimit`, not `limit`.

### Notifications and Push

Types: `src/lib/types/notifications.ts` and mobile notification model files.

Important files:

- `src/app/notifications/**`
- `src/app/api/expenses/route.ts` for group expense notification creation.
- `src/lib/services/notificationService.ts`
- `src/lib/services/pushService.ts`
- `mobile/lib/data/models/notification_model.dart`
- `mobile/lib/data/models/notification_preferences_model.dart`
- `mobile/lib/data/repositories/notification_repository.dart`
- `mobile/lib/data/repositories/notification_preferences_repository.dart`
- `mobile/lib/data/services/push_notification_service.dart`
- `mobile/lib/presentation/screens/notifications/**`

Key contract: notification creation is generally server-side. Firestore rules restrict client-created notifications.

### Income and Savings

Types:

- `src/lib/types/income.ts`
- `src/lib/types/savings.ts`
- `mobile/lib/data/models/income_model.dart`
- `mobile/lib/data/models/savings_model.dart`

Important files:

- `src/app/income/**`
- `src/app/savings/**`
- `src/lib/services/incomeService.ts`
- `src/lib/services/savingsService.ts`
- `mobile/lib/data/repositories/income_repository.dart`
- `mobile/lib/data/repositories/savings_repository.dart`
- `mobile/lib/presentation/providers/income_providers.dart`
- `mobile/lib/presentation/providers/savings_providers.dart`
- `mobile/lib/presentation/screens/income/**`
- `mobile/lib/presentation/screens/savings/**`

These domains are mostly direct Firestore client workflows rather than server API workflows.

### Admin and Observability

Important files:

- `src/app/admin-console/**`
- `src/app/api/admin/**/route.ts`
- `src/lib/admin-auth.ts`
- `src/lib/observability/**`
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- `instrumentation-client.ts`

There are two admin auth models:

- Legacy admin console cookie auth based on HMAC sessions in `src/lib/admin-auth.ts`.
- Firebase custom-claim admin auth used by selected observability/admin proxy routes through `verifyAdmin()` in `src/lib/auth-middleware.ts`.

Agents must not assume one admin auth model protects every admin endpoint.

## Critical Data Flows

### AI Expense Capture

1. User enters text or uploads receipt through `src/app/page.tsx` or mobile chat screens.
2. Client sends data to `src/app/api/analyze-expense/route.ts` for web or `apps/api/src/routes/ai/routes.ts` through mobile `ApiClient`.
3. Route/service constructs a CRA-focused prompt, optionally includes group context, and calls Gemini.
4. Route parses JSON into one or more expense candidates.
5. Web can create expenses through `src/app/api/expenses/route.ts`; mobile may use repository/API paths depending context.
6. Expense write may create group activity, notifications, push messages, and budget checks.

### Mobile Authenticated API Call

1. Mobile repository calls `ApiClient`.
2. Auth interceptor gets current Firebase ID token.
3. Request includes `Authorization: Bearer <token>`.
4. Standalone API route uses `preHandler: app.requireUser`.
5. Server validates token through Firebase Admin and uses `request.user.uid` for authorization.

### Firestore Direct Mobile Read

1. Mobile repository builds a user- or group-scoped query.
2. Firebase client sends query with user auth state.
3. Firestore rules validate ownership or membership.
4. Streams update Riverpod providers and screens.

Because several Firestore rules allow broad list access for authenticated users, mobile queries must keep user/group filters. Do not rely on client-side filtering after a broad query.

### Group Expense Creation

1. Client submits group expense with `groupId`.
2. Server validates that the user is an active member of the group.
3. Expense is written with `isGroupExpense` and group metadata.
4. Group activity and notifications are written for other members.
5. Push notification service sends FCM messages when tokens exist.

## Source of Truth Rules

- Stack versions: root `package.json`, mobile `pubspec.yaml`, `.flutter-version`, lockfiles, and CI workflows are more reliable than old prose docs.
- Runtime behavior: source files are more reliable than planning docs under `docs/superpowers/plans/`.
- Data contracts: `src/lib/types.ts`, mobile model files, and Firebase rules must be reconciled together.
- Security: server-side Firebase Admin checks and Firestore rules both matter. One does not replace the other.
- Mobile/API route behavior: `apps/api/src/routes/**`, `apps/api/src/services/**`, and `scripts/api/route-surface.ts` are the source of truth for active standalone API work.
- Generated agent references: `docs/agents/generated/**` must be regenerated after mobile/API source changes.
- Release behavior: `.github/workflows/mobile-release.yml`, `mobile/CICD.md`, and fastlane files are the practical release source of truth.

## Files Agents Commonly Need Together

When editing expenses:

- `src/lib/types.ts`
- `src/lib/categories.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/expenses/**`
- `apps/api/src/routes/ai/routes.ts`
- `apps/api/src/routes/expenses/routes.ts`
- `apps/api/src/services/expenses.ts`
- `src/hooks/useExpenses.ts`
- `mobile/lib/core/constants/categories.dart`
- `mobile/lib/data/models/expense_model.dart`
- `mobile/lib/data/repositories/expense_repository.dart`
- `mobile/lib/presentation/providers/expense_providers.dart`
- `mobile/lib/presentation/screens/expenses/**`
- `database/firestore.rules`
- `database/firestore.indexes.json`

When editing groups:

- `src/lib/types.ts`
- `src/app/api/groups/**`
- `apps/api/src/routes/groups/routes.ts`
- `apps/api/src/services/groups.ts`
- `src/hooks/useGroups.ts`
- `src/components/groups/**`
- `mobile/lib/data/models/group_model.dart`
- `mobile/lib/data/models/group_member_model.dart`
- `mobile/lib/data/repositories/group_repository.dart`
- `mobile/lib/presentation/providers/group_providers.dart`
- `mobile/lib/presentation/screens/groups/**`
- `database/firestore.rules`

When editing AI:

- `src/app/api/ai-chat/route.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/conversations/**`
- `apps/api/src/routes/ai/routes.ts`
- `apps/api/src/services/ai.ts`
- `apps/api/src/services/gemini-ai.ts`
- `src/app/page.tsx`
- `mobile/lib/data/repositories/ai_repository.dart`
- `src/lib/observability/**`

When editing auth:

- `src/lib/firebase.ts`
- `src/lib/firebase-admin.ts`
- `src/lib/auth-middleware.ts`
- `src/lib/admin-auth.ts`
- `src/components/auth-guard.tsx`
- `src/app/api/passkeys/**`
- `mobile/lib/data/services/auth_service.dart`
- `mobile/lib/presentation/providers/auth_provider.dart`
- `mobile/lib/core/router/app_router.dart`
- `database/firestore.rules`

## Risk Hotspots

- Firestore collection name drift: some web group routes write `groupActivity`, while rules and mobile code refer to `groupActivities`.
- Budget field drift: some budget notification logic references `budget.limit`, while the contract uses `monthlyLimit`.
- Category drift: AI fallback category uses a non-canonical category string in at least one path.
- Documentation drift: older docs mention older framework and model versions.
- Admin auth split: routes do not share one admin authentication mechanism.
- Generated Firebase config files may contain project identifiers and API keys. Do not quote their values in documentation.
