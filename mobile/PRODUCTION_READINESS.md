# Penny Mobile — Production Readiness

Honest accounting of what's in place vs what's still owed. Updated 2026-06-10.

For deployment mechanics, see [`CICD.md`](./CICD.md). For codebase layout, see [`CLAUDE.md`](./CLAUDE.md).

> **Earlier launch plan (Streams A–D)** was tracked in this file's history; almost all items shipped. This doc replaces that plan with a current-state audit.

---

## TL;DR

✅ **Ready**: Build/release pipeline, separate Android/iOS CI gates, code signing fail-closed behavior, crash reporting, Firestore security rule tests, secrets management, internal-first TestFlight + Play internal release path with evidence artifacts, and explicit production promotion workflow.

⚠️ **Has known gaps but not blocking**: Moderate transitive npm advisories remain in upstream Next/Firebase dependencies, web has no Sentry, no formal alerting beyond Crashlytics, no GDPR data export endpoint.

❌ **Owner-only decisions**: API key rotation, on-call rotation, customer support channel, marketing/ASO.

---

## Verified ✅

### Build & release
- `mobile/CICD.md` runbook is the single source of truth.
- Pipeline trigger: push a `v*.*.*` git tag or manually dispatch `Mobile Internal Release` → uploads TestFlight and Play internal builds only.
- Production promotion is manual via `Mobile Production Promotion` after internal validation is clean.
- Toolchain pinned: `mobile/.flutter-version`, `mobile/.ruby-version`, `mobile/Gemfile.lock`. CI matches local exactly.
- Required mobile release secrets are listed in `mobile/CICD.md`; workflows validate each secret before writing files.
- Recovery lane `fastlane repair_and_submit` handles the "stuck App Store version" failure mode that bit us once (en-CA locale gotcha — see memory `feedback_ios_locale_gotcha`).
- Pre-push hook runs unit tests strictly (`set -euo pipefail`); previously was silently swallowing failures via `| tail -1`.
- Required CI contexts for autonomous-agent PRs are declared in `.github/workflows/penny-required-gate.yml`: `ci-policy-guard`, `docs-contract-ci`, `api-ci`, `firebase-rules-ci`, `security-ci`, `mobile-shared-ci`, `mobile-android-ci`, and `mobile-ios-ci`.

### Code signing & secrets
- iOS distribution cert + private key in GitHub Secrets, hermetically restored to a temp keychain per CI run, deleted on cleanup.
- ASC API key in GitHub Secret + on disk (gitignored).
- Fastlane owns App Store provisioning profile lookup/creation; the workflow does not restore a provisioning profile secret.
- Android keystore + key.properties in GitHub Secrets, hermetically restored.
- Android release signing is fail-closed in `mobile/android/app/build.gradle.kts`; release tasks throw if signing material is missing or incomplete.
- Play Store service-account JSON in GitHub Secret.
- `.gitignore` blocks `.p8`, `.p12`, `.cer`, `.mobileprovision`, `.jks`, `key.properties`, `play-store-key.json`, `.env*` anywhere in the tree.
- Verified via `git ls-files`: zero credential files committed.

### Crash reporting
- `firebase_crashlytics: ^5.1.0` in pubspec, properly initialized in `lib/main.dart:46-61`:
  - `FlutterError.onError` → `recordFlutterFatalError`
  - `runZonedGuarded` errors → `recordError(fatal: true)`
  - Skipped in `kDebugMode` (correct — don't pollute dev with crash reports)
- iOS dSYM uploaded automatically by fastlane during `build_app`.

### Firestore security
- Rules at `database/firestore.rules` (~750 lines), comprehensive ownership checks.
- Emulator tests in `database/__tests__/firebase.rules.test.ts` cover personal expense ownership, server-only group membership/notifications, receipt storage ownership/content type, and denied unknown storage paths.
- Pattern: `allow read: if isOwner(userId)`, `allow create: if isOwner(...)`, etc.
- `groupMembers` create denied to clients (`allow create: if false`) — server-only via API.
- Notifications create denied to clients — server-only.
- `list` rules use `isAuthenticated()` because Firestore rules can't enforce query filters; security depends on mobile clients always passing `where('userId', isEqualTo: ...)`. **Mobile repos audited and verified to do this.**

### Code health and CI
- `mobile-shared-ci` runs `flutter analyze`, unit/widget tests, and `integration_test`. Analyzer infos, warnings, and errors all fail the gate.
- `mobile-android-ci` builds a release AAB with an ephemeral CI release keystore so the signing path is exercised without production keys.
- `mobile-ios-ci` builds iOS release with `--no-codesign`.
- `api-ci` runs zero-warning lint for API/packages/scripts, API checks, contract checks, mobile API-only boundary checks, and an API container build.
- `security-ci` runs dependency review, high-severity npm audit, OSV, and Trivy filesystem scanning.

### Branch protection target state (main)
- Require all contexts listed in `.github/workflows/penny-required-gate.yml`.
- Keep strict branch freshness, no force pushes, no branch deletion, and required conversation resolution.
- Do not allow agents to merge on a single green workflow; all required contexts must be green for the same commit.

---

## Known gaps ⚠️ (not blocking, but address before scale)

### Moderate upstream npm advisories
- `npm audit --omit=dev --audit-level=high` passes after replacing `xlsx`, replacing `next-pwa`, and upgrading Firebase Admin.
- Moderate advisories remain in transitive dependencies of Next/Firebase where npm does not currently provide a non-breaking fix path.
- **Fix**: keep Dependabot enabled and review upstream releases; do not downgrade major frameworks to satisfy npm's forced fix suggestion.

### No web crash reporting
- Mobile has Crashlytics. Web (Next.js) has nothing — errors go to browser console only.
- **Fix**: add Sentry SDK to `src/app/layout.tsx`. ~30 min, requires Sentry project setup.

### No formal alerting on Crashlytics
- Crashes are recorded to Firebase Console but no one is notified.
- **Fix**: in Firebase Console → Crashlytics → Settings → Velocity Alerts. Set thresholds (e.g. >1% crash-free sessions drop) → email or Slack webhook.

### No formal GDPR data-export endpoint
- Account deletion exists (`/api/account/delete`).
- Data export request (give the user a downloadable archive) does not.
- **Fix**: matters only when you have EU users. Add `/api/account/export` that bundles user's expenses, budgets, etc. into a JSON/CSV download.

### npm packages 2+ majors behind
- `flutter pub outdated` shows e.g. `flutter_riverpod 2.6.1` vs `3.3.1` available. Most are not security issues, just feature gaps.
- **Fix**: schedule a "dep refresh" sprint quarterly. Don't bulk-update; bump one major at a time + run tests.

### Single-developer review enforcement
- Branch protection requires status checks but NOT PR reviews (you're solo — can't review your own PRs).
- **Fix when adding contributors**: add `required_pull_request_reviews: { required_approving_review_count: 1 }` via gh API.

### Backend Tests workflow failing
- `.github/workflows/backend-tests.yml` has been failing on every push for weeks.
- **Fix**: either repair the tests or delete the workflow.

---

## Owner-only / business decisions ❌

These need YOU, not Claude:

- **GOOGLE_API_KEY in `.claude/settings.json` (committed at line 3)** — your personal Claude Code env var (Gemini API or similar). Recommendation: rotate the key in Google Cloud Console, then store via Claude Code's user-level env not project settings. Until then, anyone with repo read access can use that key.
- **Apple Developer account renewal** — annual, $99 USD. Calendar reminder.
- **Google Play Console** — one-time $25 USD already paid; no recurring.
- **Firebase plan** — currently Spark (free)? Verify in Firebase Console. Production traffic may push you to Blaze.
- **Privacy policy + Terms of service URL** — verify `https://penny-amber.vercel.app/privacy` is current and legally accurate. App Store + Play Store both link to it.
- **Customer support channel** — what email address are you giving users? Verify it's monitored.
- **Backup/disaster recovery** — Firestore has automatic backups on Blaze plan. Verify enabled. Have a documented restore-from-backup procedure.

---

## Recommended next 30 days

In rough priority order:

1. **Rotate the leaked GOOGLE_API_KEY** in `.claude/settings.json` and remove from repo (use a personal env var instead).
2. **Add Sentry to the web app** (~30 min) — without it, you're flying blind on web errors.
3. **Set Crashlytics velocity alerts** in Firebase Console (~5 min).
4. **First end-to-end pipeline validation**: tag the next release and watch `Mobile Internal Release`, then manually run `Mobile Production Promotion` with the internal release run ID only after TestFlight/Play internal validation passes.
5. **Enable/verify branch protection contexts** against the new required gate list.

---

## How to use this document

When something changes about production-readiness, update this file in the SAME PR as the change. The doc and reality must stay in sync.

When investigating a production issue, start here. If your symptom isn't in this doc, add it (with a Recovery section in `CICD.md`) once you've fixed it.
