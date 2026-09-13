# Penny Offline: native major release

Decision date: 2026-09-13. Product owner request: retire web development, build separate native iOS and Android apps in this repository, make normal use entirely local, use on-device AI, and offer private iCloud/Google Drive backup. This is the execution plan, not a claim that the release is complete. Evidence and current gates live in [STATUS.md](STATUS.md).

## Product contract

- A fresh install can create and reopen a vault, record/edit/delete expenses, browse/search records, and calculate reports without signing in or connecting to Penny. Optional OS model acquisition must never block manual entry or bundled OCR.
- Financial records, receipt images, prompts, model output, search indexes, and settings stay on the device. The only planned outbound financial data is an encrypted backup explicitly enabled by the user to their own cloud account.
- iOS is Swift + SwiftUI with system Liquid Glass navigation and controls. Android is Kotlin + Jetpack Compose with Material 3, adaptive layout, dynamic color, accessible motion, and platform conventions. No Flutter engine, WebView application, shared UI framework, or remotely hosted business logic in either new app.
- Backup means versioned snapshots and deliberate restore. It does not mean concurrent multi-device synchronization. iCloud is the native Apple provider; Google Drive appDataFolder is the native Android provider. A common encrypted file format enables deliberate transfers between platforms. Automatic cross-provider replication is outside this release.
- Personal finance is the scope: expenses/receipts, categories, budgets, income, savings, reports, export, and local assistant. Groups, invitations, server push, cloud chat, and remote admin/analytics are retired from the new product. Existing group data is never silently discarded or imported as owned personal expenses.
- Native development uses separate identifiers so it cannot overwrite a user's installed Penny. The intended major upgrade is Penny 3.0; live store inspection found iOS 2.3.5 and Android internal 2.3.5/10014. Reusing the existing public listing/signing identities requires verified migration; creating a second public listing is not assumed. Current evidence and release sequence: [RELEASE.md](RELEASE.md).

## Verified starting point

The existing Flutter source identifies itself as 2.3.5+37. `mobile/lib/presentation/providers/providers.dart` constructs repositories around `ApiClient`; `expense_repository.dart` performs HTTP GET/POST/PATCH/DELETE; `ai_repository.dart` sends text/receipt bytes to server AI. `main.dart` initializes Firebase, messaging and Hive. The production default in `env_config.dart` now points at the standalone Cloud Run service. Several older agent guides still describe Firestore streams and a Vercel production default; source wins.

Pre-existing uncommitted work adds an encrypted shadow database/bootstrap. The provider explicitly says this copy is not connected to the current UI and the API remains authoritative. That work is preserved; it is neither relabeled as Penny Offline nor silently replaced.

The web application is retired from feature development. It cannot be deleted by removing all of `src/`: category parity tests use `src/lib/categories.ts`, TypeScript contract references remain there, and legacy API/deployment, privacy/account-deletion routes, metrics, and CI still need a retirement decision. No production service is shut down as a side effect of native development.

## Repository ownership

| Path | Role | Owner |
| --- | --- | --- |
| `apps/ios/` | Native iOS app, platform services, tests | iOS agent |
| `apps/android/` | Native Android app, platform services, tests | Android agent |
| `packages/offline-contract/` | Versioned portable schema, canonical fixtures, crypto vectors | contract agent |
| `docs/offline/` | Decisions, threat model, phased backlog, evidence | integrating agent; backup contract delegated |
| `scripts/offline/` | Cross-platform gates and local factory tooling | integrating agent |
| `mobile/`, `apps/api/`, `database/` | Existing release and migration source | preserve during native development |
| `src/`, `public/` | Retired web and retained compatibility | clean up only after dependency/migration gate |

The platforms share contracts and golden tests, not runtime source. A wire-format change requires both decoders, schema, invalid fixtures, and cross-language tests in the same slice. The existing Firestore contract is separate and remains unchanged unless migration requires an explicit compatible change. Exact Canadian category strings remain synchronized across all copies.

## Architecture decisions

### Local authority and money

The first vertical slice uses a small encrypted atomic vault on iOS and Keystore-encrypted SQLite records on Android. No plaintext financial fields may appear in SQLite indexes, WAL, logs, thumbnails, default OS backups, or caches. This is a bootstrap choice: growth/performance and whole-vault memory benchmarks must pass before selecting it for a large release dataset. A measured transition to encrypted transactional SQLite on iOS is preferable to hiding slow whole-vault rewrites.

Amounts are integer minor units, never floating-point authority. The initial contract supports CAD with explicit limits, a civil `YYYY-MM-DD` expense date and UTC timestamps. Invalid amounts/dates/categories, unknown versions, duplicate IDs, and integer overflow fail before storage. Multi-currency, refunds, tax splits, recurring entries and exchange rates require versioned semantics; no invented conversion rates or silent rounding. Reports use deterministic code; AI never calculates the authoritative ledger.

Every mutation validates first, persists atomically, then updates visible success state. A persistence failure leaves the previous state intact and displays a recoverable error. Reopening corrupted storage must fail closed rather than create an empty vault over it. App deletion and unavailable/invalidated hardware keys require the recovery path, not a silent reset.

### Keys, backup and restore

Use platform crypto: CryptoKit AES-GCM and device-only Keychain on Apple; AES-GCM and Android Keystore on Android. The backup recovery key is independently generated; the application does not encrypt with an account password or export a hardware key. OS backup/device-transfer exclusions and privacy screen behavior are explicit release gates.

The portable format and test vectors are in [BACKUP_CONTRACT.md](BACKUP_CONTRACT.md). A backup includes a coherent snapshot and encrypted attachments, metadata/version integrity, byte/count limits and a recovery ceremony. It excludes caches, downloaded models and secrets. The initial attachment-free schema must not be marketed as backing up receipts.

Restore validates size, envelope, authenticity, schema, IDs, dates, category membership, limits, attachment hashes and count/totals before showing a preview. Only explicit replacement after preview swaps the active vault, using a rollback-safe local transaction. Wrong key, corrupted/truncated file, interrupted download, low disk, newer schema, account change, and denied permissions must preserve the old vault. Exporting a file locally is distinct from confirmed cloud upload.

Cloud backup is best effort under OS background scheduling. Display last successful remote completion, next eligible attempt and actionable error states; never promise an exact background schedule. Publish immutable snapshots and new immutable manifests only after verified remote completion. Preserve every previous generation in the current slice; no retention deletion is implemented. A future retention policy needs reviewed concurrency and recovery guarantees. Cloud outage/revoked OAuth/quota/locked device cannot prevent local writes.

Provider implementation and verification requirements are in [CLOUD_BACKUP.md](CLOUD_BACKUP.md). Finance schema 3 and its deterministic calculations are frozen in [FINANCE_CONTRACT.md](FINANCE_CONTRACT.md); migration behavior and remaining source-completeness limits are in [MIGRATION.md](MIGRATION.md).

### On-device intelligence

| Capability | iOS | Android | Required fallback |
| --- | --- | --- | --- |
| Receipt text | Vision recognition on device | Bundled ML Kit text recognition | Manual entry, editable extracted text |
| Structured expense suggestion | Foundation Models on supported, enabled devices | ML Kit GenAI Prompt API/Gemini Nano on supported AICore devices | Deterministic parser/rules with explicit limits |
| Category suggestions | Local rules plus available native model | Local rules plus available native model | Canonical category picker |
| Questions about spending | Local query tools + available native model | Local query tools + available native model | Deterministic reports/search |

Model states are distinct: ready, unsupported device/OS/region/language, disabled, download needed, downloading, insufficient resources, busy, and failed. Generative capability is optional. Do not describe rules-only extraction as a generative model. A future bundled/downloadable model requires a verified redistributable license, signed artifact manifest/digest, size/thermal/memory budget and benchmark evidence before adoption.

All AI output is a proposal shown for review. Receipt contents and user prose are untrusted input: never let instructions in them execute actions, issue network requests, change backup settings or write financial records. Validate structured output and mark uncertain fields. Budget totals and dates are produced by code. Local assistant tools are read-only in the initial release. AI suggestions never silently create an expense.

### Native design

Use each system's navigation, sheets, selection, date entry, keyboard behavior, haptics and accessibility rather than painting identical screens. Primary actions: overview, expenses, capture, reports and settings. Keep money/date/merchant legible over all backgrounds. Glass belongs to system chrome, not every content card. Support VoiceOver/TalkBack, large text, contrast, dark mode, reduced motion/transparency, keyboard dismissal, edge-to-edge insets and tablet/large-screen layouts. Use stable platform APIs for release; preview/alpha components need explicit isolation and replacement evidence.

## Phases and acceptance gates

Phases are sequenced by data risk; independent platform tasks run together. A phase passes only when its evidence is recorded. A compiled scaffold is not a completed product phase.

| Phase | Deliverable | Exit evidence | Planning tokens |
| --- | --- | --- | ---: |
| P0 Context and baseline | Source inventory, launch current Flutter, preserve dirty work, architecture and retirement map | Actual simulator launch, baseline analyzer/tests, source-linked findings | 10,000 |
| P1 Native local foundation | Both native projects, no-login local CRUD, encrypted persistence, matching schema/categories, native UI | Both builds; unit and UI create/edit/relaunch/delete; malformed input/crypto failures; initial screenshots | 26,000 |
| P2 Recoverable data | Encrypted portable export/import, recovery ceremony, receipt attachment store, transactional restore and local migration adapter | iOS→Android and Android→iOS golden files; corruption/wrong-key/low-disk/crash tests; old vault survives every failed restore | 16,000 |
| P3 Offline capture and intelligence | Camera/photo OCR, text capture, validated suggestions, model states, local query tools | First-run offline OCR; physical supported/unsupported-device model matrix; red-team receipt corpus and no outbound content | 16,000 |
| P4 Personal finance completeness | Budgets, income, savings, search, deterministic reports/CSV, recurring entries and migration accounting | Cross-platform golden financial scenarios, timezone/month boundaries, currency semantics, no lost legacy fields | 16,000 |
| P5 Private cloud backup | iCloud container and Drive appDataFolder auth/transports, scheduling, retention and restore on clean devices | Real account upload/download + restore, remote completion checks, account/quota/network failure tests | 12,000 |
| P6 Migration and release candidate | Signed upgrade from Flutter, accessible native polish, performance/security/network audits, store assets/privacy metadata | Upgrade retains data/signing; physical airplane-mode journeys; signed artifact digests and store internal-test evidence | 16,000 |
| P7 Rollout and retirement | Controlled store release, recovery/rollback support, web dependency removal | Approved/released store records, rollout health, retention/export readiness, retained contract/API gates pass after cleanup | 8,000 |
| Total | Planning envelope, not a guarantee | Track actual usage and revise based on evidence | 120,000 |

P2/P3 work may begin while a P1 gate runs, but no later phase erases earlier failed gates. Budget means a soft allocation for attention and re-planning; the tools do not enforce individual subagent token caps. The active goal records usage; report actual consumption separately from estimates. Do not use the budget to claim unfinished work is complete.

### Multi-agent factory protocol

1. Integrator owns requirements, baseline, dependency graph, root edits, merge, validation evidence and release decisions. Three concurrent workers own iOS, Android and portable contract/security. They do not edit each other's directories.
2. Initial worker targets are 12k iOS, 12k Android and 10k contract tokens including research; checkpoint around two thirds, send concrete findings early and request a bounded follow-up when scope changes. Do not spawn recursive workers while the four slots are occupied.
3. Read required agent docs; inspect status before changes; preserve pre-existing user work. No blanket `git add .`, resets, unrelated formatting or credential output.
4. Define shared fixtures first. Implement one usable journey per slice, then run platform tests and an adversarial review by a different worker. A worker reviewing its own implementation does not count as independent review.
5. Save commands, exit codes, environment, artifacts, failures, and coverage boundaries in status. Logs should not include real financial data. CI is check-only, pinned where applicable, and fails on missing required checks.
6. Integrator runs `npm run docs:auto` after agent-doc/platform/contract/workflow changes and stages only the required known generated artifacts and new source files. Existing staged user edits must be retained. Run API checks when API/shared compatibility is affected.
7. Continue safe implementation through machine-verifiable gates. Do not publish incomplete development apps. External account consent, signing entitlements, physical-device availability, store review and rollout timing are real gates; document them precisely when encountered.

## Migration and retirement sequence

1. Inventory every personal domain and field in the current API and Flutter models. Receipt URLs are references, not local attachments. Download only user-authorized owned receipts during migration and verify each locally. Snapshot identifiers/counts/totals before conversion.
2. Make a read-only source export with a resumable cursor. Import into a separate staging vault; map legacy decimal amounts deterministically; quarantine invalid/ambiguous categories, timestamps, refunds and group/shared records for review. Never silently round, omit or reassign ownership.
3. Present per-domain counts and totals plus unresolved items. Commit only when validation passes; produce a local migration receipt with source identifiers and schema versions. Re-running import is idempotent.
4. Test real signed update paths under the existing bundle/application IDs and signing keys. A development app with a different identifier cannot read the installed Flutter sandbox. Ship a bridge/export release if direct local legacy-format access is not feasible. Existing cloud accounts may be used for optional one-time migration only, then normal native operation stays independent.
5. Retain the old API and data during the migration/rollback window. Account deletion, privacy URLs and store support links need active replacements before removing their web implementation. No destructive backend purge is included in source cleanup.
6. Decouple remaining canonical types/categories, test setup, Next-specific compiler/lint rules and scripts. Remove retired page/component/PWA code, obsolete deployments/dependencies and irrelevant CI only after imports, build graph, migration support and required-check names are reconciled. Preserve a Git history reference and document retained assets.

### Legacy fields that prevent a premature major upgrade

The current model inventory already contains information that the first native expense schema cannot represent. A major upgrade must reconcile these explicitly:

| Legacy source | Information requiring migration policy |
| --- | --- |
| `mobile/lib/data/models/expense_model.dart` | Legacy IDs/ownership; vendor/amount/date; separate description and notes; remote receipt URL; local ID/sync status; history; personal/group discriminator and group metadata |
| `mobile/lib/data/models/budget_model.dart` | Per-category monthly limit, month/year period, rollover, alert threshold and notification preference |
| `mobile/lib/data/models/income_model.dart` | Gross/net amount, currency, taxable flag, frequency, recurring day, start/end/last-received dates and active state |
| `mobile/lib/data/models/savings_model.dart` | Target/current/contribution amounts, currency, dates, priority/status, contribution history references and stored derived progress |

Do not flatten description plus notes without preserving both originals; do not treat a remote receipt URL as a migrated image. Native v1's CAD-only positive expenses cannot silently absorb non-CAD income/savings, refunds, or group records. Derived budget/progress values should be recomputed and compared with the source, while original source provenance is retained in the migration receipt. The compatibility runtime and cloud data remain untouched until this reconciliation is implemented and verified.

## Release gate matrix

| Gate | Required proof |
| --- | --- |
| Offline product | Fresh install with networking blocked; create, edit, relaunch, search, reports and supported OCR; zero app-origin content egress |
| Financial correctness | Money/date/period/rounding corpus on both platforms; bounded integers and aggregate overflow tests; migration totals reconcile |
| Durability/security | Crash during write/restore, full disk, tampered/truncated vault, unavailable key, reinstall, OS backup exclusions, no plaintext artifacts/logging |
| Backup/recovery | User-held recovery key confirmed, no key in backup, cross-platform restore, remote upload completion, account switch and quota handling |
| AI | Licensed models, supported real-device runs, disabled/download/unavailable states, prompt injection/ambiguous receipt corpus, cancellation/resources |
| Accessibility/design | VoiceOver/TalkBack, large text, reduced motion/transparency, dark mode, smaller phones/tablets, focus order and touch targets |
| Performance | Measured 10k/50k expense and receipt corpus; agreed cold-open/save/search/backup latency, peak memory, battery and storage targets |
| Upgrade/store | Current listing identity/version verified; same-signature upgrade migration; privacy/support metadata; signed internal builds installed and tested |
| Retirement | No active imports/deployment/support dependencies on removed web source; legacy mobile support window documented |

No simulator can establish real Foundation Models/Nano performance, hardware-backed key behavior, production cloud account recovery, battery life, or App Store/Play approval. Those claims remain open until directly tested.
