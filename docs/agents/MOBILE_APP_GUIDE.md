# Mobile App Guide

## Stack

The mobile app is Flutter with Dart, Riverpod, go_router, Firebase Auth, Cloud Firestore, Firebase Storage, Crashlytics, Messaging, Dio, Hive, and native iOS/Android project files.

Version sources:

- `mobile/pubspec.yaml` - app version, Dart SDK, dependencies.
- `mobile/.flutter-version` - expected Flutter version for local tooling.
- `mobile/Gemfile` and `mobile/Gemfile.lock` - Ruby/Fastlane tooling.
- `.github/workflows/mobile-release.yml` - release automation.

## Entrypoints

- `mobile/lib/main.dart` - initialization of Firebase, Crashlytics, Hive, FCM, services, and root app launch.
- `mobile/lib/app.dart` - `MaterialApp.router`, themes, error widget, and localization setup.
- `mobile/lib/core/router/app_router.dart` - route table, onboarding/auth redirects, tab shell, and pushed routes.
- `mobile/lib/firebase_options.dart` - generated Firebase options. Treat as generated config and do not quote sensitive values.

## Architecture

The mobile tree is organized by core infrastructure and feature modules:

- `mobile/lib/core/` - constants, errors, network client, providers, router, services, themes, utilities, widgets.
- `mobile/lib/features/auth/` - auth screens and models.
- `mobile/lib/features/chat/` - AI chat, conversation models, repositories, providers, widgets, and screens.
- `mobile/lib/features/expenses/` - expense model, repository, providers, screens, widgets.
- `mobile/lib/features/groups/` - groups, invitations, members, repositories, providers, screens, widgets.
- `mobile/lib/features/budgets/` - budgets model/repository/providers/screens.
- `mobile/lib/features/income/` - income model/repository/providers/screens/widgets.
- `mobile/lib/features/savings/` - savings model/repository/providers/screens/widgets.
- `mobile/lib/features/notifications/` - notifications model/repository/providers/screen/widgets.
- `mobile/lib/features/dashboard/`, `home/`, `profile/`, `settings/`, `onboarding/` - supporting product surfaces.

Feature repositories are the boundary between UI/providers and Firebase/API data access. Keep business logic out of widgets where practical.

## Routing and Auth

Routing is centralized in `mobile/lib/core/router/app_router.dart`.

Important behavior:

- Onboarding is checked before normal auth redirects.
- Guest mode is supported and can access selected app surfaces.
- Auth state changes trigger router refresh through `AuthStateNotifier`.
- Guest expenses are migrated to Firestore after sign-in.
- The tab shell includes home, dashboard, finances, groups, and profile-style routes.

When adding a route:

- Add the route to the centralized router.
- Decide whether it is onboarding-only, auth-only, guest-accessible, or public.
- Check whether route refresh behavior needs to know about new auth/onboarding state.
- Add any required navigation entry through existing navigation widgets.

## Hybrid Backend Contract

Mobile intentionally uses both direct Firebase access and server APIs.

Direct Firebase is used for many streams and simple user-owned writes:

- Expenses through `ExpenseRepository` for many personal/group operations.
- Conversations through `ConversationRepository`.
- Budgets through `BudgetRepository`.
- Income through `IncomeRepository`.
- Savings through `SavingsRepository`.
- Notifications through `NotificationRepository`.
- Many group reads and selected simple updates.

Server APIs are used when server authority, AI, or complex transactions are needed:

- AI chat and expense analysis through `AiRepository`.
- Group create/invite/update flows through `GroupRepository`.
- Routes listed in `mobile/lib/core/network/api_endpoints.dart`.

HTTP calls use `mobile/lib/core/network/api_client.dart`, which injects the Firebase ID token as a bearer token. Server routes receiving mobile calls should validate with `getAuthenticatedUserId(req)`.

## Environment Selection

`mobile/lib/core/constants/env_config.dart` controls API base URL selection.

Current pattern:

- `dev` uses local development server addresses.
- `staging` uses the staging Vercel URL.
- `prod` uses the production Vercel URL.

When changing routes or hosts, update this file and verify iOS simulator, Android emulator, and physical device behavior if relevant.

## Models and Serialization

Mobile models manually map Firestore documents and timestamps. Important model files include:

- `mobile/lib/features/expenses/data/models/expense.dart`
- `mobile/lib/features/groups/data/models/group.dart`
- `mobile/lib/features/groups/data/models/group_member.dart`
- `mobile/lib/features/groups/data/models/group_invitation.dart`
- `mobile/lib/features/chat/data/models/chat_message.dart`
- `mobile/lib/features/chat/data/models/conversation.dart`
- `mobile/lib/features/budgets/data/models/budget.dart`
- `mobile/lib/features/income/data/models/income.dart`
- `mobile/lib/features/savings/data/models/savings_goal.dart`
- `mobile/lib/features/notifications/data/models/notification_model.dart`

When changing persisted fields:

- Update TypeScript types.
- Update Dart model constructors and `fromFirestore`/`toFirestore` methods.
- Update Firestore rules and indexes if query shape changes.
- Update server API serializers.
- Update tests or golden/sample data.

## Categories

Mobile category constants live in `mobile/lib/core/constants/categories.dart`. They must match web `src/lib/categories.ts` exactly. AI output, budget grouping, reports, and Firestore data all rely on exact string equality.

## Theme and UI

Mobile themes are under `mobile/lib/core/theme/`. Shared widgets live under `mobile/lib/core/widgets/` and feature-specific widgets live in each feature.

Preserve mobile visual conventions:

- Native-feeling Material app structure.
- Centralized colors and typography from theme files.
- Accessible touch targets.
- Existing loading, empty, and error state patterns.
- No ad hoc native dialogs when the app already has centralized components for the same interaction.

## Firebase and Native Files

Important native/config files:

- `mobile/android/app/google-services.json` - generated Firebase Android config.
- `mobile/ios/Runner/GoogleService-Info.plist` - generated Firebase iOS config.
- `mobile/ios/Runner/Info.plist` - app metadata and platform permissions.
- `mobile/ios/Runner.xcodeproj/**` and `mobile/ios/Runner.xcworkspace/**` - Xcode project/workspace metadata.
- `mobile/android/**` - Gradle and Android manifest configuration.

Treat generated Firebase files as config artifacts. Do not paste values into docs or logs.

## Release

Read these before changing release behavior:

- `mobile/CICD.md`
- `mobile/PRODUCTION_READINESS.md`
- `.github/workflows/mobile-release.yml`
- `mobile/fastlane/Fastfile`
- `mobile/fastlane/Appfile`

Mobile release is tag-driven through GitHub Actions. Fastlane builds and distributes iOS and Android artifacts. Release notes are kept under `mobile/release_notes/`.

## Validation Commands

Common local commands:

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
```

Release-related checks may also use:

```bash
cd mobile
bundle install
bundle exec fastlane ios build
bundle exec fastlane android build
```

Only run release build commands when the task requires it; they can be slow and environment-sensitive.

## Mobile Change Checklist

- Identify whether the data path is Firestore direct, API, or mixed.
- Confirm Firestore rules allow the intended query/write and do not allow unintended access.
- Update matching web TypeScript contracts when persisted shape changes.
- Keep category strings synchronized.
- Check guest mode behavior before changing auth-dependent providers.
- Check onboarding and router redirects after route changes.
- Verify API endpoint constants for any new server route used by mobile.
- Update release docs if CI, Fastlane, signing, or versioning changes.
