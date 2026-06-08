# Mobile Active Development Guide

This guide is for agents working on the actively developed Flutter mobile app. Use it before editing `mobile/**` or any API/Firebase contract that mobile consumes.

## Current Source Layout

The current mobile app does not use a `mobile/lib/features/**` source tree. The active layout is:

- `mobile/lib/main.dart` - process startup, Firebase setup, Crashlytics, Hive, FCM, app launch.
- `mobile/lib/app.dart` - root `MaterialApp.router`, themes, localization, app-level error behavior.
- `mobile/lib/core/` - cross-cutting constants, networking, routing, theme, utilities.
- `mobile/lib/data/models/` - Firestore/API serialization contracts.
- `mobile/lib/data/repositories/` - boundary between providers/widgets and Firebase or HTTP APIs.
- `mobile/lib/data/services/` - platform or product services such as auth, storage, export, duplicate detection, push.
- `mobile/lib/domain/` - currently sparse domain layer; do not invent broad abstractions here unless a feature already needs them.
- `mobile/lib/presentation/providers/` - Riverpod providers and state orchestration.
- `mobile/lib/presentation/screens/` - screens grouped by product area.
- `mobile/lib/presentation/widgets/` - reusable app widgets.
- `mobile/android/` and `mobile/ios/` - native platform configuration, signing/project files, platform permissions, generated Firebase config.

Generated source inventory: `docs/agents/generated/MOBILE_FILE_MAP.md`.

## Runtime Startup

Mobile startup begins in `mobile/lib/main.dart`. Before adding initialization logic, inspect the current order because Firebase, Crashlytics, Hive boxes, background messaging, and root app launch can depend on it. Push/local notification permission and token setup is not fully initialized in `main.dart`; it is provided by `pushNotificationInitProvider` and watched from `mobile/lib/presentation/widgets/app_shell.dart`, with guest mode skipped.

Agent rules:

- Do not log or copy values from `mobile/lib/firebase_options.dart`, Android `google-services.json`, or iOS `GoogleService-Info.plist`.
- Keep initialization idempotent where possible; mobile startup runs in test, simulator, and production contexts.
- If a new service needs async initialization, decide whether the app can render before it is ready. Do not block startup for non-critical work.
- Update tests under `mobile/test/` when startup-visible behavior changes.

## Routing and Auth

Routing is centralized in `mobile/lib/core/router/app_router.dart`.

Before adding or changing routes, identify:

- Whether the route is public, auth-only, onboarding-only, guest-accessible, or deep-linkable.
- Whether guest mode can enter the screen and what data it should see.
- Whether auth state, onboarding state, or guest migration should refresh the router.
- Where navigation affordances live, usually `mobile/lib/presentation/widgets/app_shell.dart` or screen-local actions.

Guest-mode caveat: `mobile/lib/core/router/app_router.dart` bypasses auth/onboarding redirects when guest mode is active; it does not maintain a complete route-level guest allowlist. Route work must inspect each screen/provider for guest guards and add explicit guards when a screen should not be guest-accessible.

Auth and guest mode files commonly move together:

- `mobile/lib/data/services/auth_service.dart`
- `mobile/lib/presentation/providers/auth_provider.dart`
- `mobile/lib/presentation/providers/guest_provider.dart`
- `mobile/lib/data/guest/guest_expense_store.dart`
- `mobile/lib/data/guest/guest_migration_service.dart`

## Data Access Pattern

Mobile uses a hybrid backend:

- Direct Firebase client SDK access for many user-owned streams and simple writes.
- Standalone Fastify API calls for AI, server-authoritative group operations, complex transactions, and compatibility routes.

The HTTP client is `mobile/lib/core/network/api_client.dart`. It uses Dio and adds `Authorization: Bearer <Firebase ID token>` when `FirebaseAuth.instance.currentUser` exists.

Mobile API endpoint constants live in `mobile/lib/core/network/api_endpoints.dart`. The generated mobile/API matrix is `docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md`.

Agent rules:

- Do not hardcode raw API paths in widgets or repositories when `ApiEndpoints` already has a constant/function.
- New mobile API calls should go through `ApiClient`, not direct Dio instances.
- If an API path changes, update `ApiEndpoints`, the standalone API route surface, generated docs, and tests together.
- If a mobile query is direct Firestore, verify `database/firestore.rules` and `database/firestore.indexes.json` before changing the query shape.

## Models and Serialization

Mobile data models live under `mobile/lib/data/models/`. They manually map Firestore/API fields, timestamps, enums, status strings, and optional data.

Important model files:

- `mobile/lib/data/models/expense_model.dart`
- `mobile/lib/data/models/budget_model.dart`
- `mobile/lib/data/models/conversation_model.dart`
- `mobile/lib/data/models/message_model.dart`
- `mobile/lib/data/models/group_model.dart`
- `mobile/lib/data/models/group_member_model.dart`
- `mobile/lib/data/models/group_activity_model.dart`
- `mobile/lib/data/models/group_income_model.dart`
- `mobile/lib/data/models/group_savings_model.dart`
- `mobile/lib/data/models/income_model.dart`
- `mobile/lib/data/models/savings_model.dart`
- `mobile/lib/data/models/notification_model.dart`
- `mobile/lib/data/models/notification_preferences_model.dart`

When changing persisted or API-visible fields:

- Update Dart model constructors and `fromFirestore`/`toFirestore` style methods.
- Update TypeScript or standalone API serializers for the same field.
- Update Firestore rules and indexes if access/query shape changes.
- Keep backward-compatible reads for existing documents unless there is an explicit migration.
- Add or update model tests under `mobile/test/unit/models/`.

## Repository Responsibilities

Repositories under `mobile/lib/data/repositories/` are the main data boundary. Keep provider/screen code thin and move Firebase/API orchestration into repositories when it is reused or risk-bearing.

Current repository families:

- AI and conversations: `ai_repository.dart`, `conversation_repository.dart`
- Expenses: `expense_repository.dart`
- Groups: `group_repository.dart`, `group_budget_repository.dart`, `group_income_repository.dart`, `group_savings_repository.dart`
- Personal finance: `budget_repository.dart`, `income_repository.dart`, `savings_repository.dart`
- Notifications: `notification_repository.dart`, `notification_preferences_repository.dart`

Agent rules:

- Do not put multi-document transaction policy in screens.
- Do not broad-read Firestore and filter in memory when a user/group-scoped query is possible.
- For group writes, prefer server API authority unless the existing repository already performs a rules-safe direct write.
- For direct Firestore writes, include the authenticated user or group identifiers required by rules.
- Existing exceptions: some expense and group-member API calls still originate in screens/widgets. Treat them as existing exceptions or migration targets, not as a pattern for new data orchestration.

## Presentation and State

Providers live under `mobile/lib/presentation/providers/`. Screens and widgets should consume providers rather than constructing repositories ad hoc, except in existing isolated widgets that already do so.

Before changing UI state:

- Check loading, empty, error, and offline states.
- Check guest mode.
- Check navigation after success/failure.
- Check whether the same provider is used by multiple screens.
- Preserve existing Material visual patterns and theme tokens from `mobile/lib/core/theme/` and `mobile/lib/core/constants/`.

## Environment Selection

`mobile/lib/core/constants/env_config.dart` selects API base URLs through Dart defines:

- `ENV=dev`
- `ENV=staging`
- `ENV=prod`
- `API_BASE_URL=...` override

Current drift to be aware of: staging points to the Cloud Run API, while the default production value still points to the Vercel app. Before production mobile API cutover work, confirm whether `prod` should point to Cloud Run.

## Native iOS and Android

Use native files only when the task touches platform behavior, app metadata, permissions, signing, or release.

Common native files:

- `mobile/ios/Runner/Info.plist`
- `mobile/ios/Runner/AppDelegate.swift`
- `mobile/ios/Runner/SceneDelegate.swift`
- `mobile/ios/Runner/Runner.entitlements`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/android/app/build.gradle.kts`
- `mobile/android/settings.gradle.kts`

Operational contracts:

- Camera or gallery work must preserve iOS usage strings in `Info.plist` and Android media/camera permissions in `AndroidManifest.xml`.
- Biometric work must preserve `NSFaceIDUsageDescription` and Android biometric permission behavior.
- OAuth/sign-in work must preserve iOS URL scheme configuration and generated Firebase platform config references without copying values into docs or logs.
- Push work must preserve iOS `UIBackgroundModes`, `aps-environment`, Android notification permission, and the provider-based initialization path.
- Android release work must account for `compileSdk`, `targetSdk`, signing config, minification, resource shrinking, and ProGuard rules in `mobile/android/app/build.gradle.kts`.

Never paste generated Firebase config values into docs, comments, logs, or final responses.

## Validation

Use the smallest command set that proves the change:

- Docs/mobile context only: `npm run docs:agents:generate`, `npm run docs:agents:check`, `npm run docs:agents:lint`
- Mobile Dart behavior: `cd mobile && flutter analyze`, then targeted `flutter test`
- Mobile model/repository changes: targeted tests under `mobile/test/unit/models/` or `mobile/test/unit/repositories/`
- Route/auth/guest/full-flow changes: targeted integration tests under `mobile/integration_test` when feasible
- API-visible mobile changes: also run `npm run api:check` and `npm run api:contract`
- Cross-platform data contract changes: run both mobile and API/web checks when feasible

Generated validation reference: `docs/agents/generated/VALIDATION_COMMANDS.md`.
