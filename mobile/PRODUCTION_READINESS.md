# Penny Mobile — Production Readiness

Honest accounting of what's in place vs what's still owed. Updated 2026-04-16.

For deployment mechanics, see [`CICD.md`](./CICD.md). For codebase layout, see [`CLAUDE.md`](./CLAUDE.md).

> **Earlier launch plan (Streams A–D)** was tracked in this file's history; almost all items shipped. This doc replaces that plan with a current-state audit.

---

## TL;DR

✅ **Ready**: Build/release pipeline, code signing, crash reporting, Firestore security rules, branch protection, secrets management, autonomous publish to App Store + Play Store.

⚠️ **Has known gaps but not blocking**: Integration test assertions are stale, 14 transitive npm vulns (mostly `xlsx`), web has no Sentry, no formal alerting beyond Crashlytics, no GDPR data export endpoint.

❌ **Owner-only decisions**: API key rotation, on-call rotation, customer support channel, marketing/ASO.

---

## Verified ✅

### Build & release
- `mobile/CICD.md` runbook is the single source of truth.
- Pipeline trigger: push a `v*.*.*` git tag → ships to App Store production (auto-release) AND Play Store production (100% rollout) in parallel.
- Toolchain pinned: `mobile/.flutter-version`, `mobile/.ruby-version`, `mobile/Gemfile.lock`. CI matches local exactly.
- All 10 GitHub repository secrets configured (verified via `gh secret list`).
- Recovery lane `fastlane repair_and_submit` handles the "stuck App Store version" failure mode that bit us once (en-CA locale gotcha — see memory `feedback_ios_locale_gotcha`).
- Pre-push hook runs unit tests strictly (`set -euo pipefail`); previously was silently swallowing failures via `| tail -1`.

### Code signing & secrets
- iOS distribution cert + private key in GitHub Secrets, hermetically restored to a temp keychain per CI run, deleted on cleanup.
- ASC API key in GitHub Secret + on disk (gitignored).
- Android keystore + key.properties in GitHub Secrets, hermetically restored.
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
- Pattern: `allow read: if isOwner(userId)`, `allow create: if isOwner(...)`, etc.
- `groupMembers` create denied to clients (`allow create: if false`) — server-only via API.
- Notifications create denied to clients — server-only.
- `list` rules use `isAuthenticated()` because Firestore rules can't enforce query filters; security depends on mobile clients always passing `where('userId', isEqualTo: ...)`. **Mobile repos audited and verified to do this.**

### Code health
- `flutter analyze --no-fatal-infos`: 0 errors, 0 warnings (CI gates on this).
- 64 info-level lints remain (style preferences) — non-blocking, can be addressed incrementally.
- `flutter test`: 363 unit tests passing.

### Branch protection (main)
- Required status check: `Flutter Analyze + Unit Tests` must pass.
- Strict: branch must be up-to-date with main before merge.
- No force pushes, no deletions.
- Required conversation resolution on PRs.
- `enforce_admins: false` — repo owner can bypass for emergency recovery (you'll thank yourself one day).

---

## Known gaps ⚠️ (not blocking, but address before scale)

### Integration tests have stale assertions
- 34 integration tests in `mobile/integration_test/` now run end-to-end (infrastructure was fixed: `oauthServiceProvider` added, `guest_expenses` Hive box opened in setUpAll).
- Individual assertions are stale against the current UI (e.g. expects "Track an expense" widget that's been renamed/restructured).
- Pre-push hook deliberately skips these — they belong in CI, not in the local push path.
- **Fix**: revisit when UI stabilizes. Each test needs ~5 min of selector/text updates against the live app.

### Web npm vulnerabilities (14 remaining)
- After `npm audit fix`: 27 → 14 vulnerabilities (0 critical → 0 critical).
- Most remaining: transitive deps of `xlsx` (Prototype Pollution, ReDoS) — no upstream fix available.
- **Fix**: replace `xlsx` with `exceljs` or `papaparse` (CSV-only) for export. Affects only `src/components/dashboard/export-data.tsx`.

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
4. **First end-to-end pipeline validation**: tag `v2.2.2` with a tiny change (typo fix is fine) and watch the `Mobile Release` workflow run for real. Until you do this once, the pipeline is "should work" not "does work."
5. **Migrate off `xlsx`** to fix the remaining web vulns (~1 hour).
6. **Restore the `Backend Tests` workflow** — fix or delete.

---

## How to use this document

When something changes about production-readiness, update this file in the SAME PR as the change. The doc and reality must stay in sync.

When investigating a production issue, start here. If your symptom isn't in this doc, add it (with a Recovery section in `CICD.md`) once you've fixed it.
