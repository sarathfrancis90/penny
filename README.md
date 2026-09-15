# Penny Offline

Penny is moving to separate native iOS and Android apps with local financial data, on-device intelligence, and optional encrypted personal cloud backups.

**The native release is in development.** Follow the [phased implementation plan](docs/offline/PLAN.md) and [validation status](docs/offline/STATUS.md). The existing Flutter app and API remain available during migration.

| Area | Location | Status |
| --- | --- | --- |
| Native iOS | [apps/ios](apps/ios) | SwiftUI / Liquid Glass; see platform README for build and tests |
| Native Android | [apps/android](apps/android) | Kotlin / Compose / Material 3; see platform README for build and tests |
| Portable data and backup | [packages/offline-contract](packages/offline-contract) | Versioned schema and cross-platform test vectors |
| Existing Flutter app | [mobile](mobile) | Existing release and migration source |
| Existing standalone API | [apps/api](apps/api) | Supports existing clients during migration |
| Web application | `src/`, `public/` | Retired from feature development; compatibility dependencies retained |

Start agent work with [AGENTS.md](AGENTS.md). New native work must not depend on Firebase, Fastify, Gemini cloud, or the web application for ordinary use. Encrypted file backup and restore work locally; private cloud backup requires optional provider access. Model availability depends on device support. See the plan for the exact offline, recovery, migration and release gates.

## Local native development

Open the [iOS project](apps/ios/README.md) in Xcode or build the [Android project](apps/android/README.md) with Android Studio/Gradle. Both apps have isolated development identities and work without a Penny account. The legacy Flutter app was also launched locally to establish the migration baseline.

The native apps implement encrypted expenses and receipts, offline OCR and optional on-device suggestions, budgets, income, savings, recurring review, reports, CSV and encrypted portable recovery. Both platforms read the same versioned backup format. iCloud/Drive adapters and default-off scheduling have passed synthetic-provider tests; real-account recovery requires configured signing and account verification.

Set up the isolated Python tooling once, then run the shared local gate:

```sh
python3 -m venv artifacts/offline/python
source artifacts/offline/python/bin/activate
python3 -m pip install --require-hashes --only-binary=:all: -r scripts/offline/requirements.txt
npm run offline:check
```

The pinned XML parser is build tooling only. Activate this environment when running the gate in a new shell. Platform build/device commands and exact evidence are in the native READMEs. [Native CI](.github/workflows/native-offline-ci.yml) covers contract checks, native builds and simulator/emulator journeys; hosted execution is a separate gate.

## Release and retained compatibility

Read the [release gates](docs/offline/RELEASE.md), [privacy inventory](docs/offline/PRIVACY.md), [migration contract](docs/offline/MIGRATION.md) and [native packaging instructions](docs/offline/NATIVE_PACKAGING.md) before preparing a signed build. No native app has been published by this work.

Former web setup and feature documentation is archived in [WEB_README.md](docs/legacy/WEB_README.md). Retained privacy/account routes, contracts, legacy client support and migration dependencies remain active until their retirement gates pass. Security maintenance and its validation are recorded in [COMPATIBILITY_SECURITY.md](docs/offline/COMPATIBILITY_SECURITY.md).
