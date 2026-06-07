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

- `src/` contains the Next.js web app, API routes, shared TypeScript types, Firebase clients, server helpers, services, hooks, and UI components.
- `mobile/` contains the Flutter app with clean-ish feature layering, Riverpod providers, Firebase integrations, native project files, and fastlane release automation.
- `database/` contains Firestore rules, indexes, storage rules, and database-focused documentation.
- `docs/` contains historical and current product, technical, launch, implementation, and agent documentation.
- `.github/` contains CI, Firebase deploy, mobile release, and fallback metrics workflows.
- `.cursor/`, `.claude/`, `.githooks/`, and root config files define local agent/editor/testing behavior.

## Runtime Architecture

### Web and API

The web application is a Next.js App Router project. `src/app/layout.tsx` wraps the app with theme, authentication, error boundary, analytics, Sentry user context, consent, and Vercel performance components. `src/components/AuthGuard.tsx` enforces client-side route access for public and protected pages.

API routes under `src/app/api/**/route.ts` implement AI analysis, chat, expenses, groups, budgets, conversations, passkeys, account deletion, admin console endpoints, observability proxies, privacy deletion, health checks, and scheduled metrics. Most routes use `withObservability()` from `src/lib/observability/middleware.ts` for request IDs, logging, spans, and structured error capture.

### Mobile

The Flutter app starts in `mobile/lib/main.dart`, initializes Firebase, Crashlytics, background messaging, Hive boxes, services, and then launches `PennyApp` from `mobile/lib/app.dart`. Routing is centralized in `mobile/lib/core/router/app_router.dart` with onboarding, auth redirects, guest mode, tab shell routes, and pushed feature routes.

Mobile uses a hybrid backend model:

- Direct Firestore streams/writes for many user-owned resources.
- Next API routes for AI, expense analysis, group operations requiring server authority, and other complex transactions.
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

- `mobile/lib/features/expenses/data/models/expense.dart`
- `mobile/lib/features/expenses/data/repositories/expense_repository.dart`
- `mobile/lib/features/expenses/presentation/providers/expense_providers.dart`
- `mobile/lib/features/expenses/presentation/screens/**`
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

Important mobile files:

- `mobile/lib/features/chat/data/models/chat_message.dart`
- `mobile/lib/features/chat/data/models/conversation.dart`
- `mobile/lib/features/chat/data/repositories/ai_repository.dart`
- `mobile/lib/features/chat/data/repositories/conversation_repository.dart`
- `mobile/lib/features/chat/presentation/**`

AI routes currently use Gemini via `@google/genai`. API key handling and model selection live in the API route implementations.

### Groups

Types: `Group`, `GroupMember`, `GroupInvitation`, `GroupRole`, and permission helpers in `src/lib/types.ts`.

Important web files:

- `src/app/groups/**`
- `src/app/api/groups/**/route.ts`
- `src/components/GroupSelector.tsx`
- `src/components/groups/**`
- `src/lib/groupService.ts`
- `src/hooks/useGroups.ts`

Important mobile files:

- `mobile/lib/features/groups/data/models/**`
- `mobile/lib/features/groups/data/repositories/group_repository.dart`
- `mobile/lib/features/groups/presentation/**`

Key contract: group membership controls access. Any group data route must validate membership server-side or be safely constrained by Firestore rules and query filters.

### Budgets

Types: budget interfaces in `src/lib/types.ts` and mobile `mobile/lib/features/budgets/data/models/budget.dart`.

Important files:

- `src/app/api/budgets/**/route.ts`
- `src/app/api/expenses/route.ts` for post-expense budget checks.
- `src/lib/budgetCalculations.ts`
- `src/lib/services/budgetNotificationService.ts`
- `mobile/lib/features/budgets/**`

Key contract: stored budget limit field is `monthlyLimit`, not `limit`.

### Notifications and Push

Types: `src/lib/types/notifications.ts` and mobile notification model files.

Important files:

- `src/app/notifications/**`
- `src/app/api/expenses/route.ts` for group expense notification creation.
- `src/lib/services/notificationService.ts`
- `src/lib/services/pushNotificationService.ts`
- `src/lib/fcm.ts`
- `mobile/lib/features/notifications/**`
- `mobile/lib/core/services/fcm_service.dart`

Key contract: notification creation is generally server-side. Firestore rules restrict client-created notifications.

### Income and Savings

Types:

- `src/lib/types/income.ts`
- `src/lib/types/savings.ts`
- `mobile/lib/features/income/data/models/income.dart`
- `mobile/lib/features/savings/data/models/savings_goal.dart`

Important files:

- `src/app/income/**`
- `src/app/savings/**`
- `src/lib/services/incomeService.ts`
- `src/lib/services/savingsService.ts`
- `mobile/lib/features/income/**`
- `mobile/lib/features/savings/**`

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
2. Client sends data to `src/app/api/analyze-expense/route.ts`.
3. Route constructs a CRA-focused prompt, optionally includes group context, and calls Gemini.
4. Route parses JSON into one or more expense candidates.
5. Web can create expenses through `src/app/api/expenses/route.ts`; mobile may use repository/API paths depending context.
6. Expense write may create group activity, notifications, push messages, and budget checks.

### Mobile Authenticated API Call

1. Mobile repository calls `ApiClient`.
2. Auth interceptor gets current Firebase ID token.
3. Request includes `Authorization: Bearer <token>`.
4. Server route calls `getAuthenticatedUserId(req)` from `src/lib/auth-middleware.ts`.
5. Server validates token through Firebase Admin and uses the UID for authorization.

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
- Release behavior: `.github/workflows/mobile-release.yml`, `mobile/CICD.md`, and fastlane files are the practical release source of truth.

## Files Agents Commonly Need Together

When editing expenses:

- `src/lib/types.ts`
- `src/lib/categories.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/expenses/**`
- `src/hooks/useExpenses.ts`
- `mobile/lib/core/constants/categories.dart`
- `mobile/lib/features/expenses/**`
- `database/firestore.rules`
- `database/firestore.indexes.json`

When editing groups:

- `src/lib/types.ts`
- `src/app/api/groups/**`
- `src/lib/groupService.ts`
- `src/hooks/useGroups.ts`
- `src/components/groups/**`
- `mobile/lib/features/groups/**`
- `database/firestore.rules`

When editing AI:

- `src/app/api/ai-chat/route.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/conversations/**`
- `src/app/page.tsx`
- `mobile/lib/features/chat/data/repositories/ai_repository.dart`
- `src/lib/observability/**`

When editing auth:

- `src/lib/firebase.ts`
- `src/lib/firebase-admin.ts`
- `src/lib/auth-middleware.ts`
- `src/lib/admin-auth.ts`
- `src/components/AuthGuard.tsx`
- `src/app/api/passkeys/**`
- `mobile/lib/core/providers/auth_provider.dart`
- `mobile/lib/core/router/app_router.dart`
- `database/firestore.rules`

## Risk Hotspots

- Firestore collection name drift: some web group routes write `groupActivity`, while rules and mobile code refer to `groupActivities`.
- Budget field drift: some budget notification logic references `budget.limit`, while the contract uses `monthlyLimit`.
- Category drift: AI fallback category uses a non-canonical category string in at least one path.
- Documentation drift: older docs mention older framework and model versions.
- Admin auth split: routes do not share one admin authentication mechanism.
- Generated Firebase config files may contain project identifiers and API keys. Do not quote their values in documentation.
