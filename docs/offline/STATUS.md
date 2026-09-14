# Penny Offline execution status

Updated 2026-09-13. [PLAN.md](PLAN.md) defines the product and phased release gates. Detailed earlier validation and corrections remain in [REVIEW.md](REVIEW.md), the native READMEs and [evidence/](evidence/README.md).

## Release disposition

**In development; not a release candidate.** Separate SwiftUI and Kotlin/Compose apps run locally with encrypted expenses, receipts and finance records. Ordinary operation requires no account, network service or generative model. [Draft PR44](https://github.com/sarathfrancis90/penny/pull/44) contains the development milestone. No native store upload, merge or production-service retirement has occurred.

## Current implementation and proof

| Area | Implemented and verified scope | Remaining acceptance |
| --- | --- | --- |
| Native foundation | iOS 26 SwiftUI and Android API26+ Compose/Material3; local CRUD, search, summaries, empty/error states and native navigation | Physical accessibility, hardware security and final signed installs |
| Encrypted ledger | iOS device-only Keychain and authenticated atomic vault; Android Keystore-wrapped random row key and SQLite transactions; tamper/key-loss/rollback and fresh-process tests | Incremental large-dataset storage, physical interrupted-write/full-disk matrix |
| Finance | Budgets, received income, savings contributions, recurring review, deterministic reports and CSV; matching shared financial cases | Full legacy reconciliation, refunds/non-CAD/withdrawal product decisions and localization |
| Receipt capture | Native camera/picker, bounded image preparation and bundled OCR; 22-case shared parser and 24-case PNG integrity corpus | Physical camera/HEIC quality and supported-device performance |
| On-device AI | Optional Foundation Models / Gemini Nano proposals with explicit unavailable/download states and strict grounded review; manual entry remains available | Actual supported physical-device inference, model quality/resources and SDK/AICore traffic observation |
| Portable recovery | Authenticated v1/v2/v3 backups covering every native domain; actual opposite-platform files decoded, receipt bytes preserved; confirmed user-held recovery key | Large streamed archives and isolated durable candidate generations |
| Private cloud backup | CloudKit / Drive appDataFolder adapters, explicit opt-in, publication/restore guards and default-off scheduling; fake transport, expiry/cancel/account/revision tests | Real-account consent, remote completion, clean-device recovery, background execution and retention |
| Migration and retirement | Strict local converter/preflight and reconciliation reports; web feature development retired and old README archived | Complete authenticated legacy export/receipt acquisition, signed upgrade and support-window retirement gates |
| Packaging | Isolated packaging and version/signature/provider preflight, negative tests and unsigned native builds | Actual signing/profile/entitlement configuration, distribution artifacts and store validation |

Current product limits remain **10,000 expenses, 100 receipts, 8 MiB aggregate receipt bytes and 2 MiB per receipt**. These are development limits. No larger tier is enabled merely because its contract or crypto prototype exists.

## Latest hosted and local checkpoints

At source commit `6cdf3044da564c3e8f69a3ec96ea737a90367214`, all hosted native jobs passed in [run 34792285794](https://github.com/sarathfrancis90/penny/actions/runs/34792285794):

- iOS simulator: **64/64**, 55 unit and nine UI methods, zero failures/skips.
- Android API26 and API37/16 KiB: **33/39 on each runtime**, zero failures and six explicit opt-in/process skips. Both separate UI-created expense force-stop/relaunch phases passed under different processes.
- Shared native contract, Android compilation/JVM/lint/APK and native aggregate passed.

[The compact machine report](evidence/hosted-native-6cdf304.json) is extracted from that run's result bundle, JUnit XML and process logs. Six skips are the two opt-in performance methods, TLS probe, 10k external-process method and two separately executed CRUD process phases. This checkpoint does not cover the later crypto tooling/prototypes.

Every listed hosted check and both aggregate gates passed on that revision, including security, OSV, SAST, API, Firebase rules, backend, documentation, Flutter analyzer/unit, retained Android, retained Flutter iOS integration and its unsigned release build. On the later crypto prototype commit `3414197`, authenticated source/reference checks and both native library build steps passed. The native Android API37 job failed in the camera-denial test's composite save/snackbar wait; API26 passed; iOS passed 63/64, failing only the five-second system photo-grid readiness assertion. The native aggregate failed. The Android test correction passed locally on API26 and API37, including API37 with 60-second accessibility timeouts. The iOS correction passed the exact real Photos attach/save/relaunch/original/remove journey locally, 1/1 with zero skips. Fresh hosted acceptance is required for both. See [Android failure and regression](evidence/capture-dismiss-regression.json), [iOS readiness proof](evidence/ios-photo-picker-readiness.json), and [successful hosted crypto source/build evidence](evidence/hosted-crypto-3414197.json). The earlier Flutter dashboard fixture failed because June expenses were hidden by the current-month filter; the scoped fixture correction passed both affected scenarios locally and all 290 pre-push Flutter tests. No legacy application behavior changed for that correction.

Android expense save/delete now returns validated state after a successful commit, avoiding a redundant full-vault read. Local build/JVM/lint, 16 API37 tests and four API26 regressions passed. Five alternating pairs in one debug API37/16 KiB process measured 1.07 s median with returned state versus 2.07 s with replayed reads for 10k expenses. This is the save/state data path, not physical p95 or an original-binary comparison. [PERFORMANCE.md](PERFORMANCE.md) preserves workload and measurement limits.

## Streamed backup work in progress

The [capacity decision](CAPACITY_V4_DECISION.md) selects upstream libsodium secretstream with a separate HKDF-derived key. Its authenticated source archive/tree pin, independent signature verifier, license and out-of-tree Apple/Android builders are implemented in `packages/offline-crypto/`. Actual ARM64 iPhoneOS/simulator builds and Swift link probes passed; all four Android ABI static builds, ELF checks and CMake consumer links passed with 16 KiB alignment. Source/configuration/path/header/target rejection checks passed. Deterministic source/signature tests join the normal offline gate, which passed 74 Node tests and 27 Python test groups plus static boundaries at the frame checkpoint; the logical additions below bring the Node total to 82.

The [byte-exact v4 draft](BACKUP_V4_CONTRACT.md) and layout/HKDF vectors have independent review. Bounded Swift and Kotlin/JNI frame codecs now decode four reference goldens and reject 28 malformed recipes. Swift passed 15 simulator tests plus one Android-to-Swift interchange test; Android passed 11 API37 tests plus one Swift-to-Android test, and the full 12-test API26 suite. The independent reference decoded both native writers. Android also streamed 640 MiB through a bounded pipe and rejected the next byte. This is frame validation, not a Profile A ledger or memory/performance acceptance. See the [prototype evidence](../../packages/offline-crypto/prototypes/reference/verification-evidence.json). They remain experiments outside the apps; application integration and format freeze are later gates.

Incremental logical gates now require native schema3/reference/financial and full image validation before completion. Both decode the same ten positive and reject the same 60 negative shared logical streams through actual encryption/frame codecs. Swift passed six simulator test methods after independent review caught and fixed a stale-index sink reuse flaw; Android passed four final methods on each API26/37, with the unchanged frame callback covered by earlier 16-method regressions. The shared oracle adds eight passing Node tests, bringing the normal offline gate to 82 Node tests, 27 Python groups and static boundaries. These are validation-only experiments with mandatory isolated sinks; they do not implement durable encrypted candidates or restore commit. See [Swift](../../packages/offline-crypto/prototypes/apple/LOGICAL.md), [Android](../../packages/offline-crypto/prototypes/android/LOGICAL.md) and [shared corpus](../../packages/offline-crypto/prototypes/reference/logical_README.md).

Profile A targets 50,000 expenses, 5,000 receipts and 512 MiB raw receipt bytes, with independent metadata/wire bounds. These are measurement targets. Next steps are isolated durable candidate integration, incremental storage and detached encrypted receipts at existing limits. Complete profile measurements and file-based provider transfers follow. Multi-GiB profile B remains deferred.

## Demo, design and physical boundaries

Both normal development apps have been built, installed and launched with empty local vaults: `ca.penny.offline.dev` on the iPhone 17/iOS26.4.1 simulator and Android17/16 KiB emulator. Test automation uses separate sandbox identities. [iOS](evidence/ios-demo-launch.png) and [Android](evidence/android-demo-launch.png) captures show the actual development UI; current local binaries and hashes are recorded under ignored build/artifact directories. They are not signed store candidates.

Small-phone/tablet, large-text/dark-mode and functional native journeys passed at documented checkpoints. The separate unfiltered iOS accessibility diagnostic remains **failed with 13 findings: ten Dynamic Type, two clipping and one contrast**. Inspected default/XXXL/AX5 targets and the 44pt action correction do not resolve the complete audit. See [element-specific disposition](evidence/ios-accessibility-disposition.md). Physical VoiceOver/TalkBack remains open.

No attached supported device has established Foundation Models or Nano inference. Simulator success cannot prove hardware key protection, provider account recovery, battery use or store approval. Android's default-deny platform TLS policy restricts app-owned backup traffic, but it does not prove custom SDK/AICore metadata behavior. [PRIVACY.md](PRIVACY.md), [PROVIDER_SETUP.md](PROVIDER_SETUP.md) and [RELEASE.md](RELEASE.md) retain those exact gates. Existing store/API observations are historical snapshots, not a newly verified release state.

## Baseline and review isolation

The original checkout already contained API tests/routes/services, Firestore indexes, generated docs, Flutter project/provider/dependency edits and local database/tests. All **18 protected legacy source hashes** still match `artifacts/offline/legacy-baseline-hashes.json`. Required generated docs are regenerated against each checkout independently.

The clean review worktree is `/Users/sarathfrancis/work/git/Personal/penny-offline-review`, branch `codex/penny-offline-native` from `bcdd69d`. Explicit owned-path synchronization excludes the pre-existing API/Flutter source changes. Review changes to the retained mobile tree are limited to Ruby dependency maintenance and the date-sensitive integration fixture. Logs, result bundles, source pins and earlier failing evidence are retained under ignored `artifacts/offline/` and native build directories; portable public fixtures and compact reports are checked in.

## Token accounting

The original **120,000-token estimate was exceeded** and is not a consumption limit. At the latest recorded goal checkpoint, the tool reported **10,401,224 aggregate tokens and 25,791 elapsed seconds**. That is measured tool accounting, not a forecast or budget-compliance claim. The active goal has no enforced token ceiling. The logical slice assigned 10k soft checkpoints per worker; estimates were Swift 13–16k plus a 2–2.5k reuse fix, Android 14–16k, and shared oracle 13–15k plus a 2.5–3k independent review. These exceeded the initial estimates. The earlier frame-slice worker allocations were soft checkpoints: Swift 22k plus a 5k guard/interchange follow-up, Kotlin/JNI 24k and shared fixtures 18k plus a 6k independent review allowance. Exact per-worker consumption is unavailable; these are not measured usage totals. Completion depends on verified outcomes; no unfinished release gate is accepted because an allocation is spent.
