# Penny Offline execution status

Updated 2026-09-14. [PLAN.md](PLAN.md) defines the product and phased release gates. Detailed earlier validation and corrections remain in [REVIEW.md](REVIEW.md), the native READMEs and [evidence/](evidence/README.md).

## Release disposition

**In development; not a release candidate.** Separate SwiftUI and Kotlin/Compose apps run locally with encrypted expenses, receipts and finance records. Ordinary operation requires no account, network service or generative model. [Draft PR44](https://github.com/sarathfrancis90/penny/pull/44) contains the development milestone. No native store upload, merge or production-service retirement has occurred.

## Current implementation and proof

| Area | Implemented and verified scope | Remaining acceptance |
| --- | --- | --- |
| Native foundation | iOS 26 SwiftUI and Android API26+ Compose/Material3; local CRUD, search, summaries, empty/error states and native navigation | Physical accessibility, hardware security and final signed installs |
| Encrypted ledger | Device-bound encrypted generations, detached receipt files, guarded publication and authenticated predecessor recovery on both platforms; tamper/key-loss/rollback and separate-process tests | Incremental large-dataset storage, physical interrupted-write/full-disk matrix |
| Finance | Budgets, received income, savings contributions, recurring review, deterministic reports and CSV; matching shared financial cases | Full legacy reconciliation, refunds/non-CAD/withdrawal product decisions and localization |
| Receipt capture | Native camera/picker, bounded image preparation and bundled OCR; 22-case shared parser and 24-case PNG integrity corpus | Physical camera/HEIC quality and supported-device performance |
| On-device AI | Optional Foundation Models / Gemini Nano proposals with explicit unavailable/download states and strict grounded review; manual entry remains available | Actual supported physical-device inference, model quality/resources and SDK/AICore traffic observation |
| Portable recovery | Authenticated v1/v2/v3 backups covering every native domain; actual opposite-platform files decoded, receipt bytes preserved; confirmed user-held recovery key | Large streamed archives, bounded incremental hydration and physical recovery tests |
| Private cloud backup | CloudKit / Drive appDataFolder adapters, explicit opt-in, publication/restore guards and default-off scheduling; fake transport, expiry/cancel/account/revision tests | Real-account consent, remote completion, clean-device recovery, background execution and retention |
| Migration and retirement | Fixed-time authenticated raw-query exporter and strict local converter/preflight with reconciliation reports; web feature development retired | Complete authenticated legacy export/receipt acquisition, signed upgrade and support-window retirement gates |
| Packaging | Isolated packaging and version/signature/provider preflight, negative tests and unsigned native builds | Actual signing/profile/entitlement configuration, distribution artifacts and store validation |

Current product limits remain **10,000 expenses, 100 receipts, 8 MiB aggregate receipt bytes and 2 MiB per receipt**. These are development limits. No larger tier is enabled merely because its contract or crypto prototype exists.

## Latest hosted and local checkpoints

Hosted checkpoint `5d98016148321a8d2e029b6c65f8c7bfe074a8f1` passed the native workflow.
It adds authenticated raw/receipt acquisition, bounded receipt-read corrections
and the native UI test fixes below. The stable review passed 106 Node tests,
27 Python groups, static boundaries, 104 documentation tests, targeted ESLint
and all 290 enabled pre-push Flutter tests.
[Hosted native run34805112934](evidence/hosted-native-5d98016.json)
passed all native jobs: iOS81/81 (72 unit and nine UI), both Android runtimes
48/56 with eight explicit skips, and separate process persistence/recovery
phases. Retained Flutter iOS and the repository required aggregate subsequently passed;
[all23 exact-head checks succeeded](evidence/hosted-required-5d98016.json). This result covers5d98016 only.

The durable storage milestone is pushed as `8815d04247fff3843fe82954f79622adf11cc263`.
[Local integration gates](evidence/durable-integration-8815d04.json) passed: 88 Node
tests, 27 Python groups, static boundaries, 104 review documentation tests,
changed-source SAST and all 290 enabled pre-push Flutter tests. The
[hosted native run](evidence/hosted-native-8815d04.json) failed three UI methods:
iOS passed 71 unit tests and seven of nine UI tests; Android API37 passed 46 of
55 discovered tests, with one failure and eight explicit opt-in/process skips.
API26 passed 47 of 55 with the same eight skips, then passed both separate CRUD
and generation recovery phases. Recovery phases did not run on the failed iOS
or API37 jobs. Native and required aggregates failed; retained Flutter iOS was
still running at this snapshot. Contract and Android build jobs passed.

Narrow test interaction corrections now pass their complete affected local
journeys: [Android receipt entry](evidence/android-receipt-input-readiness.json)
on API26/37, one method each, and
[iOS Files cancellation and consent](../../apps/ios/evidence/hosted-ui-readiness.md),
two methods. Unchanged focused baselines also passed locally, so these results
do not establish a deterministic local reproduction. The subsequent5d98016
hosted native suite above passed all affected journeys. The fixes wait
for actual control readiness, strengthen saved-state assertions and retain
mandatory consent checks. Production source is unchanged by these test fixes.
The newer metadata and raw migration adapter changes are separate checkpoints.

At source commit `e3d6dc53e224357553795083bae45b222548298e`, all hosted native jobs passed in [run 34797361200](https://github.com/sarathfrancis90/penny/actions/runs/34797361200):

- iOS simulator: **64/64**, 55 unit and nine UI methods, zero failures/skips.
- Android API26 and API37/16 KiB: **33/39 on each runtime**, zero failures and six explicit opt-in/process skips. Both separate UI-created expense force-stop/relaunch phases passed under different processes.
- Shared native contract/reference checks, native library builds, Android compilation/JVM/lint/APK and native aggregate passed.

[The compact machine report](evidence/hosted-native-e3d6dc5.json) is extracted from that run's result bundle, fresh JUnit XML and process logs. Six skips are the two opt-in performance methods, TLS probe, 10k external-process method and two separately executed CRUD process phases. This checkpoint does not include the later detached receipt foundation or durable storage integration. Retained Flutter iOS subsequently passed; the required aggregate first timed out at its one-hour wait, then passed an aggregate-only rerun after all prerequisites completed. All 23 listed checks succeeded on that source. [The final required-check report](evidence/hosted-required-e3d6dc5.json) preserves both attempts' distinction. The next workflow revision extends its wait to 115 minutes within the existing 120-minute job policy, with 30-second polling.

The prior `6cdf304` revision passed every listed hosted check and both aggregate gates, including retained Flutter iOS integration and its unsigned release build; [its native report](evidence/hosted-native-6cdf304.json) remains historical evidence. On `3414197`, authenticated source/reference checks and both native library builds passed, but API37 failed a composite save/snackbar wait and iOS failed its initial five-second Photos-grid readiness assertion. The fixes passed focused local tests and the full native `e3d6dc5` run above. See [Android failure and regression](evidence/capture-dismiss-regression.json), [iOS local readiness proof](evidence/ios-photo-picker-readiness.json), and [hosted crypto source/build evidence](evidence/hosted-crypto-3414197.json). The earlier retained Flutter dashboard fixture correction preserves application behavior and passed both affected local scenarios and all 290 pre-push Flutter tests.

At the earlier inline-receipt checkpoint, Android expense save/delete began returning validated state after a successful commit, avoiding a redundant full-vault read. Local build/JVM/lint, 16 API37 tests and four API26 regressions passed. Five alternating pairs in one debug API37/16 KiB process measured 1.07 s median with returned state versus 2.07 s with replayed reads for 10k expenses. This is historical save/state evidence before durable generations, not current-storage latency, physical p95 or an original-binary comparison. [PERFORMANCE.md](PERFORMANCE.md) preserves workload and measurement limits.

The newer, separately validated [metadata and migration checkpoint](evidence/metadata-migration-integration.json)
passes118 Node tests,27 Python groups, static boundaries,104 review documentation
tests and targeted lint. Its paired native proofs and current demo hashes are
recorded below. Hosted results for the base commit do not cover this delta.

## Streamed backup work in progress

The accepted candidate-install checkpoint is pushed as `b22b4f6`, following
`6d3e22d` (metadata/raw migration) and `c633fb9` (owned candidates/exported IPA).
Guarded installation captures actual target/key identity, rejects intervening
edits/restores and reuses the existing publication/recovery protocol. Exact
AAB and IPA packaging preflights are in place. The latest head has its own
hosted run; earlier green results do not establish its acceptance.

V4 readers now compile into both native apps, sharing the existing codec
implementations. Focused app tests passed: iOS6/6 plus unsigned device
compilation, Android4/4 on API26 and API37 plus JVM/build/lint. These internal
readers validate archives and current limits; they are not connected to
restore/export/provider actions. See [iOS evidence](../../apps/ios/evidence/v4-app-module.md)
and [Android evidence](../../apps/android/evidence/v4-app-reader.md).

Next, the locally achievable work is v4 candidate integration and a logical writer,
incremental storage/reads, file-based provider transfer, measured Profile A
capacity, complete legacy reconciliation and signed packaging. Real provider
recovery, physical AI/security/accessibility and store gates remain separate.
Release is still substantial work; test or file counts are not a readiness
percentage.

At the earlier c633fb9 checkpoint, internal inactive preparation accepted bounded raw receipts with required
source EOF/close, complete native validation and original-file ownership through
cleanup. The shared acceptance manifest separates preparation from three future
installation scenarios. iOS passed a 53-method compatibility checkpoint, then
19 methods on the final source-input overlay; these remain distinct runs.
[iOS evidence](../../apps/ios/evidence/inactive-generation.md) records each source
and binary. Android passes 32 focused groups on each API26/37 and all 25 JVM tests;
[its evidence](../../apps/android/evidence/receipt-candidate.md) retains the earlier
failed cleanup expectation and final correction. Root independently verified
132 current native source, fixture, binary and report hashes. Android's private
format2 candidate intent remains quarantined after uncertain cleanup and is
never implicitly promoted to persisted-generation ownership.
The combined local gate passes 119 Node tests, 43 Python groups and static
boundaries; review/original documentation checks pass 104/105 tests.
That preparation checkpoint did not add candidate installation, v4 app linkage,
larger capacity or performance acceptance. Existing Snapshot publication remains in use.


The subsequent guarded local installation passes **61/61 iOS methods** and
**38 focused Android groups plus one separate moved-database regression on each
API26/37**, with25 JVM tests, build and lint passing. Root verified153 current
source/fixture/binary/report hashes and reviewed both shared publication helpers.
The three shared installation scenarios now have actual platform mappings.
[iOS](../../apps/ios/evidence/candidate-install.md) and
[Android](../../apps/android/evidence/candidate-install.md) preserve exact source
checkpoints, before/after-publication outcomes and ownership limits. This is an
internal synchronous seam: v4, provider and UI linkage remain pending. In-process
fault/reopen tests do not establish physical failure or separate-process recovery
through this new entry point. The combined gate passes119 Node tests and54
Python groups (zero skips), plus static boundaries,104/105 documentation tests
and changed-source SAST (162 rules, ten files, zero findings/errors). An initial
Python dependency-path failure in the boundary checker was corrected with the
existing configured venv; preceding tests were not unnecessarily repeated.

Both platforms now verify durable generation metadata and every native receipt
without building aggregate receipt Base64 for validation-only paths. The existing
Snapshot interface still hydrates receipts when application state needs them.
Private formats, portable backups and current capacity are unchanged. Android
passes23 focused groups on each API26/37 plus25 JVM tests; iOS passes45 focused
methods including exact JSON byte-count parity, recovery, authenticated invalid
metadata/images and the two raw migration fixture methods. Root checked120 source,
fixture, binary and test-report hashes and independently reviewed both changes;
a second reviewer found no actionable Swift blocker. These are validation results,
not measured latency, constant-memory or larger-capacity acceptance. See
[Android](../../apps/android/evidence/generation-metadata.md) and
[iOS](../../apps/ios/evidence/generation-metadata.md).

The following bounded receipt-read corrections preserve authentication and
complete pre-publication validation. Android passes 17/17 focused tests on both
API26/37 and all 25 JVM tests; its measured synthetic receipt workload median
improved 3.76%, while the control was flat. iOS passes eight durable tests and
six Release benchmark tests, with no meaningful timing gain established.
[PERFORMANCE.md](PERFORMANCE.md) links exact source pins and workload limits.
The fixed-time raw source exporter separately passes nine transport/filesystem
test groups. The new [receipt acquisition adapter](../../scripts/offline/LEGACY_RECEIPT_ACQUISITION.md)
preserves bounded current originals using explicit source bindings, unchanged
before/after metadata and complete checksummed bytes. Its nine new groups plus
the nine raw exporter groups pass locally and independent review found no
actionable blocker. A strict raw-format adapter now converts represented expenses, budgets and
configured income sources, with all seven unsupported domains blocking output.
Root passes28 converter tests and two native fixture methods on iOS and each
Android API26/37; an authenticated invalid image is rejected before replacement.
[Converter](evidence/raw-migration-validation.json) and
[native fixture](evidence/raw-migration-native.json) reports preserve exact
source checkpoints. Real-account acquisition, historical storage consistency
and complete financial/history reconciliation remain open; no full-account
migration claim is made. [Acquisition scope](evidence/receipt-acquisition-validation.json).

The detached encrypted receipt foundation now passes the shared public golden
and 35 negative cases, plus native ownership/cleanup/inventory/capacity tests:
**9/9 iOS simulator methods** and **7/7 Android groups on each API26/37**. iOS
uses an explicit compile-time simulator filesystem implementation; device builds
retain atomic class-A creation and actual descriptor checks with no runtime
fallback. A path-based directory metadata race found in review was removed;
the primitive requires an already backup-excluded private parent. The original
iOS EPERM failure remains historical evidence. The final Swift source passes
simulator tests; the preceding checkpoint also compiled for iPhoneOS, which is
not a physical protection test. See [iOS](../../apps/ios/evidence/local-receipt-foundation.md),
[Android](../../apps/android/evidence/local-receipt-foundation.md) and the
[independent positive vector](evidence/local-receipt-independent.json).

Both live stores now use durable detached receipts, inactive preparation,
guarded atomic activation and retained predecessors under
[DURABLE_STORAGE.md](DURABLE_STORAGE.md). iOS passes **49/49** focused native tests,
plus separate writer/reader tests and an unsigned iPhoneOS Release build. Android
passed **28/28** selected groups on each API26/37 before the later cancellation
correction; its final focused results and source pins are recorded separately in
[the Android report](../../apps/android/evidence/durable-generations.md).
[The iOS report](../../apps/ios/evidence/durable-storage.md) and both machine reports
map the 14 shared lifecycle requirements to actual tests and explicitly retain
unproven interruption, physical security and storage-exhaustion cases.

The normal validation scripts now include dedicated writer/reader recovery phases.
[Root runner validation](evidence/durable-process-runners.json) passed on iOS and
both Android runtimes, with different process IDs asserted. Pending states were
created by checkpoint failures; these are not physical power-loss tests. iOS
validated both successful replacement and recovery from an invalid pending
receipt. Android used actual host force-stop before authenticating replacement.
That runner checkpoint precedes the subsequent Drive cancellation correction.
Portable v1–v3 formats and capacity remain unchanged. Current APIs still hydrate
receipt bytes in memory; no latency or peak-memory improvement is claimed by
this storage change.

The [capacity decision](CAPACITY_V4_DECISION.md) selects upstream libsodium secretstream with a separate HKDF-derived key. Its authenticated source archive/tree pin, independent signature verifier, license and out-of-tree Apple/Android builders are implemented in `packages/offline-crypto/`. Actual ARM64 iPhoneOS/simulator builds and Swift link probes passed; all four Android ABI static builds, ELF checks and CMake consumer links passed with 16 KiB alignment. Source/configuration/path/header/target rejection checks passed. Deterministic source/signature tests join the normal offline gate, which passed 74 Node tests and 27 Python test groups plus static boundaries at the frame checkpoint; the logical additions below bring the Node total to 82.

The [byte-exact v4 draft](BACKUP_V4_CONTRACT.md) and layout/HKDF vectors have independent review. Bounded Swift and Kotlin/JNI frame codecs now decode four reference goldens and reject 28 malformed recipes. Swift passed 15 simulator tests plus one Android-to-Swift interchange test; Android passed 11 API37 tests plus one Swift-to-Android test, and the full 12-test API26 suite. The independent reference decoded both native writers. Android also streamed 640 MiB through a bounded pipe and rejected the next byte. This is frame validation, not a Profile A ledger or memory/performance acceptance. See the [prototype evidence](../../packages/offline-crypto/prototypes/reference/verification-evidence.json). They remain experiments outside the apps; application integration and format freeze are later gates.

Incremental logical gates now require native schema3/reference/financial and full image validation before completion. Both decode the same ten positive and reject the same 60 negative shared logical streams through actual encryption/frame codecs. Swift passed six simulator test methods after independent review caught and fixed a stale-index sink reuse flaw; Android passed four final methods on each API26/37, with the unchanged frame callback covered by earlier 16-method regressions. The shared oracle adds eight passing Node tests, bringing the normal offline gate to 82 Node tests, 27 Python groups and static boundaries. These are validation-only experiments with mandatory isolated sinks; they do not implement durable encrypted candidates or restore commit. See [Swift](../../packages/offline-crypto/prototypes/apple/LOGICAL.md), [Android](../../packages/offline-crypto/prototypes/android/LOGICAL.md) and [shared corpus](../../packages/offline-crypto/prototypes/reference/logical_README.md).

Profile A targets 50,000 expenses, 5,000 receipts and 512 MiB raw receipt bytes, with independent metadata/wire bounds. These are measurement targets. Durable candidates and detached receipts are now integrated at existing limits. Next steps are incremental storage reads, streamed v4 application integration, complete profile measurements and file-based provider transfers. Multi-GiB profile B remains deferred.

The [exported IPA checker](evidence/exported-ipa-preflight.json) now validates a
private snapshot of the actual export and binds that digest to the retained
packaging product. All 38 Python groups in `scripts/offline` pass, including 13
archive-helper groups. A synthetic simulator payload reached the real signing
checker and was rejected as expected. No signed distribution artifact has passed. The subsequent AAB helper passes
eight synthetic groups with actual JDK signatures and pinned bundletool1.18.3
validation/base-manifest dumping. Packaging requires separate AAB and APK checks
and matches both retained hashes. This is local tooling; no real signed Penny
AAB, Play processing or delivered-app acceptance is implied.

## Demo, design and physical boundaries

[Current native demo proof](evidence/native-demo-metadata.json) records fresh builds,
installed executable/APK hashes and root-inspected captures after metadata-only
verification and the iOS Search prompt correction; all110 source/artifact hashes
were independently checked. The earlier [receipt checkpoint](evidence/current-native-demo.json) remains separate. Both normal development apps launched with empty vaults
without clearing data or editing records. This is startup proof only; test
identities, populated migration and physical release remain separate.

Both normal development apps have been built, installed and launched with empty local vaults: `ca.penny.offline.dev` on the iPhone 17/iOS26.4.1 simulator and Android17/16 KiB emulator. Test automation uses separate sandbox identities. [iOS](evidence/ios-demo-launch.png) and [Android](evidence/android-demo-launch.png) captures show the actual development UI; current local binaries and hashes are recorded under ignored build/artifact directories. They are not signed store candidates.

Small-phone/tablet, large-text/dark-mode and functional native journeys passed at documented checkpoints. The separate unfiltered iOS accessibility diagnostic remains **failed with 13 findings: ten Dynamic Type, two clipping and one contrast**. Inspected default/XXXL/AX5 targets and the 44pt action correction do not resolve the complete audit. See [element-specific disposition](evidence/ios-accessibility-disposition.md). Physical VoiceOver/TalkBack remains open. A later [AX5 search prompt correction](../../apps/ios/evidence/a11y-search-prompt.md) keeps the focused native prompt large; both before/after unfiltered audits still report the same13 findings, so the full gate remains open.

No attached supported device has established Foundation Models or Nano inference. Simulator success cannot prove hardware key protection, provider account recovery, battery use or store approval. Android's default-deny platform TLS policy restricts app-owned backup traffic, but it does not prove custom SDK/AICore metadata behavior. [PRIVACY.md](PRIVACY.md), [PROVIDER_SETUP.md](PROVIDER_SETUP.md) and [RELEASE.md](RELEASE.md) retain those exact gates. Existing store/API observations are historical snapshots, not a newly verified release state.

## Baseline and review isolation

The original checkout already contained API tests/routes/services, Firestore indexes, generated docs, Flutter project/provider/dependency edits and local database/tests. All **18 protected legacy source hashes** still match `artifacts/offline/legacy-baseline-hashes.json`. Required generated docs are regenerated against each checkout independently.

The clean review worktree is `/Users/sarathfrancis/work/git/Personal/penny-offline-review`, branch `codex/penny-offline-native` from `bcdd69d`. Explicit owned-path synchronization excludes the pre-existing API/Flutter source changes. Review changes to the retained mobile tree are limited to Ruby dependency maintenance and the date-sensitive integration fixture. Logs, result bundles, source pins and earlier failing evidence are retained under ignored `artifacts/offline/` and native build directories; portable public fixtures and compact reports are checked in.

## Token accounting

On the 2026-09-13 continuation, the account usage tool initially reported 50% of the weekly allowance remaining; after durable storage, recovery, raw acquisition and focused hosted-failure validation the 2026-09-14 reading reported **34% remaining**, resetting **2026-09-19 at 14:37:59 America/Toronto**. This is account-wide usage, not a token budget for this repository. The user explicitly asked to conserve it while completing the goal. Work now prioritizes storage/recovery, migration, and release gates, with narrow agent ownership, incremental source reads, one appropriate validation pass per stable change, and usage checks at integration milestones. Avoid speculative feature work, repeated unchanged CI polling, and repeated full-history exploration. Use two focused implementation workers and a bounded independent reviewer only when a concrete review target is ready.

The original **120,000-token estimate was exceeded** and is not a consumption limit. At the latest recorded goal checkpoint, the tool reported **14,626,837 aggregate tokens and 37,936 elapsed seconds**. That is measured tool accounting, not a forecast or budget-compliance claim. The active goal has no enforced token ceiling. The logical slice assigned 10k soft checkpoints per worker; estimates were Swift 13–16k plus a 2–2.5k reuse fix, Android 14–16k, and shared oracle 13–15k plus a 2.5–3k independent review. These exceeded the initial estimates. The earlier frame-slice worker allocations were soft checkpoints: Swift 22k plus a 5k guard/interchange follow-up, Kotlin/JNI 24k and shared fixtures 18k plus a 6k independent review allowance. Exact per-worker consumption is unavailable; these are not measured usage totals. Completion depends on verified outcomes; no unfinished release gate is accepted because an allocation is spent.
