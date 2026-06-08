# Mobile App Guide

This guide is the quick reference for the Flutter mobile app. For detailed active-development rules, read `docs/agents/MOBILE_ACTIVE_DEVELOPMENT_GUIDE.md`.

## Stack

The mobile app is Flutter with Dart, Riverpod, go_router, Firebase Auth, Cloud Firestore, Firebase Storage, Firebase Messaging, local notifications, Crashlytics, Dio, Hive, fl_chart, and native iOS/Android project files.

Version and tooling sources:

- `mobile/pubspec.yaml` - app version, Dart SDK, dependencies.
- `mobile/.flutter-version` - expected Flutter version for local tooling.
- `mobile/Gemfile` and `mobile/Gemfile.lock` - Ruby/Fastlane tooling.
- `.github/workflows/mobile-tests.yml` - analyze/test automation.
- `.github/workflows/mobile-release.yml` and `.github/workflows/mobile-production-promotion.yml` - release automation.

Generated inventory: `docs/agents/generated/MOBILE_FILE_MAP.md`.

## Entrypoints

- `mobile/lib/main.dart` - Firebase, Crashlytics, Hive, FCM/background messaging, services, and root app launch.
- `mobile/lib/app.dart` - root router app, themes, localization, error widget.
- `mobile/lib/core/router/app_router.dart` - route table, onboarding/auth redirects, guest access, tab shell, pushed routes.
- `mobile/lib/firebase_options.dart` - generated Firebase options. Reference the file path only; do not quote values.

## Current Architecture

The active mobile tree is layer-oriented:

- `mobile/lib/core/` - constants, networking, routing, theme, utilities.
- `mobile/lib/data/models/` - Firestore/API data models.
- `mobile/lib/data/repositories/` - Firebase/API data access boundary.
- `mobile/lib/data/services/` - auth, storage, export, duplicate detection, push, biometrics, OAuth.
- `mobile/lib/data/guest/` - guest expense storage and migration.
- `mobile/lib/domain/` - sparse domain layer reserved for behavior that needs it.
- `mobile/lib/presentation/providers/` - Riverpod state.
- `mobile/lib/presentation/screens/` - product screens.
- `mobile/lib/presentation/widgets/` - shared widgets.

Do not follow old references to a `mobile/lib/features/**` tree; that is not the current mobile source layout.

## Routing and Auth

Routing is centralized in `mobile/lib/core/router/app_router.dart`.

Important behavior:

- Onboarding is checked before normal auth redirects.
- Guest mode can access selected app surfaces.
- Auth state changes refresh the router through the auth provider/notifier path.
- Guest expenses can migrate after sign-in.
- The app shell hosts primary tabs and pushed feature routes.
- Guest mode bypasses auth/onboarding redirects but does not provide a complete route-level allowlist. Route changes must inspect target screens/providers for guest guards.

When adding a route:

- Decide whether it is public, onboarding-only, auth-only, guest-accessible, or deep-linkable.
- Update the centralized router.
- Update navigation affordances in the app shell or feature screen.
- Check guest and signed-in behavior.
- Add or update widget/provider tests when route behavior is non-trivial.

## Hybrid Backend Contract

Mobile intentionally uses both direct Firebase access and server APIs.

Direct Firebase is used for many streams and simple user-owned workflows:

- Expenses through `mobile/lib/data/repositories/expense_repository.dart`.
- Conversations through `mobile/lib/data/repositories/conversation_repository.dart`.
- Budgets through `mobile/lib/data/repositories/budget_repository.dart`.
- Income through `mobile/lib/data/repositories/income_repository.dart`.
- Savings through `mobile/lib/data/repositories/savings_repository.dart`.
- Notifications through `mobile/lib/data/repositories/notification_repository.dart`.
- Group-adjacent reads and selected rules-safe writes through group repositories.

Server APIs are used for AI, server-authoritative operations, and complex transactions:

- AI chat, receipt/text analysis, and conversation title generation through `mobile/lib/data/repositories/ai_repository.dart`.
- Group create/invite/update/member flows through `mobile/lib/data/repositories/group_repository.dart`.
- Expense and group operations that require server side effects through `ApiEndpoints`.

The active dedicated server API is the standalone Fastify API under `apps/api`. The generated endpoint matrix is `docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md`.

## API Client and Environments

`mobile/lib/core/network/api_client.dart` owns Dio configuration and Firebase bearer token injection.

`mobile/lib/core/network/api_endpoints.dart` owns mobile API path constants.

`mobile/lib/core/constants/env_config.dart` selects the base URL:

- `ENV=dev` - local development URL.
- `ENV=staging` - staging Cloud Run API URL.
- `ENV=prod` - current default production URL.
- `API_BASE_URL=...` - explicit override.

Known drift: production currently defaults to the Vercel app while staging points at Cloud Run. Confirm production routing before assuming full mobile API cutover.

## Models and Serialization

Mobile model contracts live under `mobile/lib/data/models/`.

Important models:

- `expense_model.dart`
- `budget_model.dart`
- `conversation_model.dart`
- `message_model.dart`
- `group_model.dart`
- `group_member_model.dart`
- `group_activity_model.dart`
- `group_income_model.dart`
- `group_savings_model.dart`
- `income_model.dart`
- `savings_model.dart`
- `notification_model.dart`
- `notification_preferences_model.dart`

When changing persisted fields:

- Update matching TypeScript/shared/API contracts.
- Update Dart model constructors and serialization/deserialization.
- Update Firestore rules and indexes if query shape changes.
- Update standalone API serializers and service logic.
- Update tests under `mobile/test/unit/models/`, `mobile/test/unit/repositories/`, or matching API tests.
- Regenerate agent docs.

## Categories

Mobile category constants live in `mobile/lib/core/constants/categories.dart`. They must match `packages/shared/src/categories.ts` and `src/lib/categories.ts` exactly. AI output, budget grouping, reports, and Firestore data rely on exact string equality.

## UI and State

Shared mobile themes and constants live under:

- `mobile/lib/core/theme/app_theme.dart`
- `mobile/lib/core/constants/app_colors.dart`
- `mobile/lib/core/constants/app_spacing.dart`

Presentation conventions:

- Use existing widgets under `mobile/lib/presentation/widgets/` before adding new primitives.
- Preserve existing loading, empty, error, success, and sheet patterns.
- Keep business logic out of widgets when repositories/providers are the established boundary.
- Check mobile text fitting, accessibility, touch targets, and theme consistency.

## Native Files and Release

Important native/config files:

- `mobile/android/app/google-services.json` - generated Firebase Android config.
- `mobile/ios/Runner/GoogleService-Info.plist` - generated Firebase iOS config.
- `mobile/ios/Runner/Info.plist` - iOS metadata and permissions.
- `mobile/android/app/src/main/AndroidManifest.xml` - Android metadata and permissions.
- `mobile/ios/Runner.xcodeproj/**` and `mobile/ios/Runner.xcworkspace/**` - Xcode project/workspace metadata.
- `mobile/android/**` - Gradle, manifests, resources.

Operational contracts to preserve:

- Camera/gallery: iOS usage descriptions and Android camera/media permissions.
- Biometrics: iOS Face ID description and Android biometric permission.
- OAuth/sign-in: iOS URL schemes and Firebase config references.
- Push: iOS background/APS settings, Android notification permission, and provider-based app-shell initialization.
- Android release: `compileSdk`, `targetSdk`, signing config, minification, resource shrinking, and ProGuard rules.

Read before release changes:

- `mobile/CICD.md`
- `mobile/PRODUCTION_READINESS.md`
- `.github/workflows/mobile-release.yml`
- `.github/workflows/mobile-production-promotion.yml`
- `mobile/fastlane/Fastfile`
- `mobile/fastlane/Appfile`

Treat generated Firebase files as config artifacts. Do not paste values into docs or logs.

## Validation Commands

Common local commands:

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter test integration_test
```

Agent-doc freshness commands after mobile/API contract changes:

```bash
npm run docs:agents:generate
npm run docs:agents:check
npm run docs:agents:lint
```

API-visible mobile changes should also run:

```bash
npm run api:check
npm run api:contract
```

Only run release build lanes when the task requires it; they can be slow and credential-sensitive.

## Mobile Change Checklist

- Identify whether the data path is Firestore direct, standalone API, or mixed.
- Confirm Firestore rules allow the intended query/write and do not allow unintended access.
- Update matching TypeScript/API contracts when persisted data changes.
- Keep category strings synchronized.
- Check guest mode behavior before changing auth-dependent providers.
- Check onboarding and router redirects after route changes.
- Verify `ApiEndpoints` for any new server route used by mobile.
- Update generated agent docs for mobile/API changes.
- Update release docs if CI, Fastlane, signing, or versioning changes.
