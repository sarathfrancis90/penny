# Penny Mobile — CI/CD Runbook

**This is the single source of truth for shipping Penny mobile.** If anything below diverges from how the pipeline actually behaves, fix this doc first.

---

## TL;DR — Ship a release

```bash
# 1. Bump version in pubspec.yaml (e.g. 2.2.1 → 2.2.2)
# 2. Write release notes
echo "Your changelog text here." > mobile/release_notes/v2.2.2.txt

# 3. Commit, tag, push
git add mobile/pubspec.yaml mobile/release_notes/v2.2.2.txt
git commit -m "chore: Release v2.2.2"
git tag v2.2.2
git push origin main --tags
```

That's it. GitHub Actions ships to **TestFlight + App Store (auto-release on Apple approval)** and **Play Store production (100% rollout)** in parallel. Apple review takes 1–3 days; Play Store review takes hours.

---

## Architecture

```
git tag v*.*.*               PR opened / push to main
        │                            │
        ▼                            ▼
.github/workflows/release.yml   .github/workflows/pr-checks.yml
        │                            │
        │                            └── flutter analyze + flutter test
        │
        ├── job: derive  (parse tag → version + build_number)
        │
        ├── job: ios   (macOS runner, parallel)
        │      └── flutter build ios → IPA → TestFlight upload
        │          └── wait for Apple processing (poll latest_testflight_build_number)
        │              └── fastlane repair_and_submit → App Store auto-release
        │
        └── job: android (ubuntu runner, parallel)
               └── flutter build appbundle → fastlane supply
                   └── Play Store production track, 100% rollout
```

Both jobs are independent. A failure in one does NOT block the other (so an iOS code-signing flake doesn't block the Android release).

---

## Single trigger: git tag `v*.*.*`

Versioning rule:
- **Tag** = `v<major>.<minor>.<patch>` (e.g. `v2.2.2`)
- **iOS `CFBundleShortVersionString`** = tag stripped of `v` prefix (e.g. `2.2.2`)
- **iOS `CFBundleVersion`** (build number) = `${{ github.run_number }}` (auto-increments per workflow run, globally unique)
- **Android `versionName`** = same as iOS short version
- **Android `versionCode`** = `${{ github.run_number }}`

The `pubspec.yaml` `version:` field is the source of truth for version+build, but CI overrides build with `--build-number=${{ github.run_number }}` for uniqueness across re-runs.

**Why tag-based?** Tags are explicit, deliberate, and immutable. Pushing a tag is a clear "ship it" signal. Branch pushes are too noisy.

---

## Required GitHub repository secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions → New repository secret** and add each:

| Secret name | How to produce |
|---|---|
| `ASC_API_KEY_P8` | `cat mobile/fastlane/AuthKey_P97VLS6M6Z.p8` (paste full contents incl. BEGIN/END lines) |
| `ASC_API_KEY_ID` | Literal: `P97VLS6M6Z` |
| `ASC_API_ISSUER_ID` | Literal: `09ca85e3-ffa2-4b6c-ada5-7c031ec5eb14` |
| `IOS_DIST_CERT_P12_BASE64` | Export Apple Distribution cert from Keychain Access as `.p12` with a password, then `base64 -i Apple_Distribution.p12 \| pbcopy` |
| `IOS_DIST_CERT_PASSWORD` | The password you used when exporting the .p12 above |
| `IOS_PROVISIONING_PROFILE_BASE64` | `base64 -i mobile/AppStore_com.penny.pennyMobile.mobileprovision \| pbcopy` |
| `KEYCHAIN_PASSWORD` | Generate any random string (e.g. `openssl rand -hex 16`) — used to create a fresh CI keychain on each run |
| `ANDROID_KEYSTORE_BASE64` | `base64 -i mobile/android/app/penny_release_key.jks \| pbcopy` |
| `ANDROID_KEY_PROPERTIES` | `cat mobile/android/key.properties` (paste full contents) |
| `PLAY_STORE_KEY_JSON` | `cat mobile/fastlane/play-store-key.json` (paste full JSON) |

After adding all 10 secrets, the pipeline is armed. There is no other config required.

---

## One-time App Store / Play Store setup (already done for Penny)

These were configured manually before the pipeline existed. **Don't re-do them; they survive across releases.** Listed here for reference if the app is ever re-created.

**App Store Connect (one-time per app):**
- App created with bundle `com.penny.pennyMobile`
- Primary localization set to **English (Canada)** — `en-CA`. Critical: see `feedback_ios_locale_gotcha` memory.
- Privacy Policy URL filled (https://penny-amber.vercel.app/privacy or wherever)
- App Privacy questionnaire answered (Data Collection)
- Age Rating answered
- Export Compliance: encryption questions answered → set in `submission_information` in the lane

**Google Play Console (one-time per app):**
- App created with package `com.penny.penny_mobile`
- Service account created with "Release Manager" role; JSON downloaded → `play-store-key.json`
- Content rating questionnaire answered
- Target audience + privacy policy URL set
- Data safety form filled

---

## Local fallback (when CI is down or for emergency hotfixes)

Every CI step is a normal Fastlane lane. To replicate the pipeline locally:

```bash
cd mobile
fastlane ios beta                                          # iOS → TestFlight
fastlane ios repair_and_submit version:2.2.2 build:NN \   # iOS → App Store
                                notes:"Your changelog"
fastlane android beta                                      # Android → Play Store internal
# Then promote internal → production manually in Play Console UI, OR:
fastlane supply --track production --aab build/app/outputs/bundle/release/app-release.aab \
                --json_key fastlane/play-store-key.json --package_name com.penny.penny_mobile
```

You'll need `mobile/fastlane/AuthKey_P97VLS6M6Z.p8` and `mobile/fastlane/play-store-key.json` present locally (gitignored).

---

## Recovery procedures

| Failure | Symptom | Fix |
|---|---|---|
| **iOS submit blocked: "whatsNew missing"** | `appStoreVersions ... not in valid state` | Run `fastlane repair_and_submit` — it drops stray locales and sets en-CA whatsNew via Spaceship. |
| **iOS submit blocked: "English (U.S.) - Description / Keywords / Support URL required"** | A previous deliver call created a blank en-US locale | Same: `fastlane repair_and_submit` cleans up the stray locale. |
| **iOS upload rejected: "Invalid Pre-Release Train. The train version 'X.Y.Z' is closed"** | Marketing version was already shipped to App Store | Bump the marketing version (e.g. `2.2.0` → `2.2.1`). Build number alone is not enough once a train is closed. |
| **iOS upload rejected: "Bundle version must be higher than X"** | Build number conflict | The pipeline uses `github.run_number` so this shouldn't happen on CI. Locally, bump `+N` in `pubspec.yaml`. |
| **Android upload: "Could not find aab file"** | Path mismatch | The Fastfile path is relative to `mobile/`, not `mobile/fastlane/`. Should be `build/app/outputs/bundle/release/app-release.aab`. (Already fixed in commit `162372f`.) |
| **Android upload: "Version code X has already been used"** | Re-running with same build number | The pipeline uses `github.run_number` — re-running the same workflow gets a new number. Locally, bump build number in `pubspec.yaml`. |
| **Pre-push hook hangs/fails** | Local push blocked | The hook is `.githooks/pre-push`, runs `flutter test`. If a test legitimately fails, fix it. To debug: `cd mobile && flutter test`. |
| **CI iOS build fails: "No signing certificate"** | The base64 cert secret is wrong or the keychain step failed | Re-export the .p12 from Keychain Access (make sure to include the private key) and re-add `IOS_DIST_CERT_P12_BASE64`. |
| **App Store version stuck after a failed submit** | Can't re-submit, locale rows half-filled | `fastlane repair_and_submit version:X build:Y notes:"..."` — handles all of it. Don't try to delete the version via API; Apple doesn't expose that endpoint. |

---

## Release notes management

Release notes live as plain-text files at `mobile/release_notes/v<version>.txt`. Each file is the **What's New** content for both iOS and Android.

- The pipeline reads `mobile/release_notes/v${VERSION}.txt` and **fails fast if missing**, so you can never ship without notes.
- iOS notes go to the `en-CA` localization's `whatsNew` field.
- Android notes go to the `en-US` localization (Play Store default).
- Keep them under 4000 chars for iOS / 500 chars for Android (use the shorter of the two as your guide).

---

## Pinned toolchain

CI matches local exactly. Versions are pinned in:

| Pin | File | Current value |
|---|---|---|
| Ruby | `mobile/.ruby-version` | (see file) |
| Fastlane + gems | `mobile/Gemfile` + `mobile/Gemfile.lock` | (see files) |
| Flutter | `mobile/.fvmrc` if FVM installed, else README note | (see files) |

When updating tools locally: bump the pin file, commit it, push. CI picks up the new version on next run.

---

## What is NOT automated (and why)

- **Bumping `pubspec.yaml` `version:`** — must be a deliberate human decision. Semantic-release tooling can do this from conventional commits if you want; for now it's manual.
- **Writing release notes** — same reason. Two-line creative task.
- **App Store / Play Store metadata changes** (description, keywords, screenshots) — these change rarely and are managed in the respective console UIs. The pipeline never touches them.
- **Promoting from staged rollout to 100%** — N/A here because we ship at 100% directly. If you switch to staged (recommended for larger user base), you'll do `fastlane supply --rollout 1.0` manually after monitoring.

---

## Future Claude / future-you, read this first

If you're modifying the deployment pipeline, ALSO update:
1. This file (`mobile/CICD.md`) — the runbook
2. `mobile/fastlane/Fastfile` — the actual lanes
3. `.github/workflows/release.yml` — the CI orchestration
4. `~/.claude/projects/-Users-sarathfrancis-work-git-Personal-penny/memory/reference_cicd_pipeline.md` — the AI memory snapshot

If you discover a new failure mode, add it to the **Recovery procedures** table above. That table is the one part of this doc that gets read during 2am incidents.
