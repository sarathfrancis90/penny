# Penny Offline execution status

Updated 2026-09-14. [PLAN.md](PLAN.md) defines the product and release gates. The [evidence index](evidence/README.md), native READMEs and [REVIEW.md](REVIEW.md) preserve earlier checks, failures and corrections.

## Release disposition

**In development; not a release candidate.** Separate SwiftUI and Kotlin/Compose apps run locally with encrypted expenses, receipts and finance records. Ordinary operation requires no account, network service or available generative model. [Draft PR44](https://github.com/sarathfrancis90/penny/pull/44) contains the development milestone. No native store upload, merge or production-service retirement has occurred.

## Current implementation and remaining work

| Area | Implemented and verified scope | Remaining acceptance |
| --- | --- | --- |
| Native apps | iOS 26 SwiftUI; Android API26+ Compose/Material3; local CRUD, search, summaries, native navigation and empty/error states | Physical accessibility, hardware security and final signed installs |
| Encrypted ledger | Device-bound generations, detached receipts, guarded publication, authenticated predecessor recovery and separate-process checks | Physical in-place repair qualification, current-cap resource checks, physical interrupted-write/full-disk matrix |
| Finance | Budgets, received income, savings contributions, recurring review, deterministic reports and CSV; matching shared financial cases | Full legacy reconciliation, refunds/non-CAD/withdrawal product decisions and localization |
| Receipt capture | Native camera/picker, bounded image preparation, bundled OCR, shared parser and PNG integrity corpus | Physical camera/HEIC quality and supported-device performance |
| On-device AI | Optional Foundation Models / Gemini Nano proposals with explicit unavailable/download states and grounded review; manual entry remains available | Supported physical-device inference, quality/resources and SDK/AICore traffic observation |
| Portable recovery | Legacy v1/v2/v3 compatibility; app-linked v4 streamed writers and readers, guarded candidates, reciprocal native export/restore/reopen; Files restore integration | Real cloud-provider transfer, capacity and physical recovery |
| Private cloud backup | CloudKit / Drive appDataFolder adapters, explicit opt-in, guarded publication/restore, default-off scheduling and fake-transport tests | Real-account consent, remote completion, clean-device restore, background execution and retention; cloud-v4 transport deferred |
| Migration and retirement | Authenticated raw-query exporter, receipt acquisition and strict converters with reconciliation reports; web feature development retired | Complete authenticated legacy acquisition/reconciliation, signed upgrade and support-window retirement gates |
| Packaging | Isolated packaging, version/signature/provider preflights, negative tests and unsigned native builds | Actual signing/profile/entitlements, distribution artifacts and store validation |

Current limits remain **10,000 expenses, 100 receipts, 8 MiB aggregate receipt bytes and 2 MiB per receipt**. Legacy JSON is bounded to 15 MiB and encrypted input to 20 MiB. Profile A (50,000 expenses, 5,000 receipts, 512 MiB raw receipts) is a measurement target, not enabled capacity. The [capacity decision](CAPACITY_V4_DECISION.md) and [performance report](PERFORMANCE.md) retain the rationale and measured limits.

## Latest accepted checkpoints

The preceding writer/restore checkpoint is **e7fc1d2aaf629a6c97f597d1ecd901dc9482292c**, following app linkage (`ac8b670`) and candidate/savings integration (`8461f1c`). The [writer and Files restore report](evidence/v4-writer-files-integration.json) records:

- iOS: 19/19 focused methods, zero skips (writer/interchange six, Files restore six, candidate regression seven).
- Android: 21/21 on each API26/37, followed by a separate final four-method reciprocal/Files overlay on each; 25 JVM tests, build and lint passed.
- Actual native writer files are shared goldens. Each opposite platform validates, installs and reopens all eight represented domains and exact receipt bytes. This is fresh-store, same-process evidence.
- Shared integration: 124 Node and 62 Python tests, zero skips; static boundaries, 104 review documentation tests, targeted lint and changed-source SAST passed. The push hook passed all 290 enabled Flutter tests.

[The native workflow for e7fc1d2](evidence/hosted-native-e7fc1d2.json) passed every job: iOS130/130 plus two separate generation phases; Android90/98 on each API26/37 with eight named opt-in/process skips, plus four separately invoked process methods on each. Contract, native builds and native aggregate passed. Retained Flutter iOS and the repository aggregate remain separate. These hosted results do not cover subsequent Files export edits.

The earlier **b22b4f6** checkpoint passed [all native jobs](evidence/hosted-native-b22b4f6.json): iOS103/103, Android68/76 on each runtime with eight named skips, and separate process phases. Retained Flutter iOS subsequently passed; [all23 repository checks succeeded](evidence/hosted-required-b22b4f6.json). Earlier results and failed runs remain individually linked in the evidence index; they are not new runs against current source.

## Files export checkpoint59877b1

Both apps now prepare a verified owned v4 file before opening the destination picker. A fresh export UUID/date determines its filename. Destination success requires complete native readback, exact byte count/digest, and successful close. Existing nonempty destinations are preserved. Cloud-upload completion is never inferred from a local file write.

[Android evidence](../../apps/android/evidence/v4-files-export.md) records successful actual Downloads picker saves on API26/37. Its 11 non-UI methods pass on both; final two-method UI overlays pass separately. Earlier lazy-list and API26 screenshot-null test failures are retained. The final [request-binding correction](../../apps/android/evidence/v4-files-export-binding.json) passes eight focused methods on each runtime: six controller and two actual UI journeys. Stale URI/null results cannot consume a newer request; disposal cancels only the matching unclaimed stage. Claimed exports remain owned until the worker starts. Independent review found no remaining P1/P2; actual Activity recreation remains untested.

[iOS evidence](../../apps/ios/evidence/v4-files-export.md) records an ordinary 11/11 checkpoint, including three destination tests, six writer tests, legacy compatibility and real picker cancellation. Positive folder-selection diagnostics then exposed a missing built `UIFileSharingEnabled` key despite its project setting. Explicit plist properties now produce both intended Files keys. The corrected build passed a real folder-selection/save journey and, in a separate test-only overlay, actual Back-to-root cancellation/dismissal/relaunch. Earlier passing results are not attributed to these later builds.

## Receipt-free live state integration

Ordinary open/list/view-one and unchanged-receipt expense edits now use authenticated metadata and owned receipt reads. Metadata edits preserve exact receipt ciphertext and reject stale instances/forms. Complete compatibility hydration explicitly throws or fails; an empty receipt-free body cannot delete stored receipts. [Paired evidence](evidence/live-state-integration.json) and the native caller audits record remaining compatibility paths.

- iOS: 28 unique focused methods passed across an initial 27-pass/1-fail run and a corrected one-test overlay. The sole failure expected an old backup identity from an exporter that deliberately creates a fresh one. Runtime sources were unchanged. The real Photos edit/relaunch/view journey passed.
- Android: final API37 13/13 and API26 20/20, zero skips; 25 JVM tests, build and lint passed. The earlier 18-method API37 run is a separate checkpoint. Final stale-editor fingerprint checks prevent an intervening receipt refresh from authorizing older fields.
- Shared: 125 Node and 62 Python tests, zero skips; 90-file static boundary check, targeted lint and 17-file runtime/JS SAST passed. Independent review found no remaining confirmed P1/P2. Current limits remain unchanged.

Hosted Files checkpoint `59877b1` failed one existing Android picker test on each runtime (106 total, one failure, six skips each). The test polled the external screen before Compose installed the request launcher. [A test-only readiness and staging-cleanup correction](../../apps/android/evidence/files-hosted-readiness.json) passes on both runtimes against the same current production APK. The historical hosted jobs remain failed. The iOS, contract and Android build jobs passed; the native and repository aggregate gates failed. Retained Flutter iOS was still running at this capture.

## Current-cap v4 repair

[Paired native repair](evidence/v4-repair-integration.json) now validates a backup when the receiving local key is missing or encrypted state is corrupt. Preview does not provision keys or mutate originals. Explicit Replace rechecks raw source, namespace and key observation, then reuses guarded replacement. Only this repair path holds a bounded complete Snapshot; healthy candidate and ordinary live paths are unchanged.

- iOS final27/27 passed, zero skips, after fixing the independent review finding at the actual key-creation boundary. Atomic create-only Keychain insertion rejects an intervening key. All focused compatibility cases reran on the corrected runtime.
- Android final repair6/6 on each API26/37 passed, following earlier16/16 per runtime. A separate10k-expense/four2MiB-receipt compatibility workload passed before the final repair-only key-ownership correction. JVM25/build/lint passed. These remain distinct runs.
- Shared126 Node/62 Python tests passed with zero skips. The static90-file gate passed using the existing virtualenv after a system-Python dependency failure; the failed initial command is retained. Changed runtime/JS SAST, final iOS key overlay and targeted lint passed. Both independent reviews are clear within the recorded scope.

Android repair needs readable SQLite tables and cannot provide atomic Keystore creation against arbitrary other processes. iOS raw-inventory capture remains synchronous; storage-history cost requires separate qualification. Injected failures and new-store reopen do not prove physical key behavior, power loss or provider recovery. The subsequent bounded-retention checkpoint addresses ordinary metadata-history growth; quarantined history remains deliberately protected.

## Bounded metadata retention

The [paired retention checkpoint](evidence/metadata-retention-integration.json) closes ordinary iOS history growth using authenticated collection after successful publication. It retains current state, its recovery predecessor and any older records required by owned reads, candidates or exports. Cleanup failures do not turn a committed save into a reported failure. Unknown, damaged or substituted files remain quarantined.

- The same shared50-edit sequence retained51 full records/303,206bytes plus50 pointer wrappers/19,583bytes on the repair baseline. The corrected iOS runtime retains two full records/11,926bytes plus one pointer wrapper/394bytes, with exact final records and unchanged receipt ciphertext. These are settled file-length samples, not maximum-capacity or physical disk measurements.
- Final iOS33/33 focused tests passed, zero skips. Nonblocking file opens prevent FIFO hangs; a preservation-only prepass protects shared receipt provenance across overlapping reader pins. Independent delta review is clear. The earlier22/22 checkpoint is preserved separately.
- Android production code is unchanged. Two focused methods pass on each API26/37. All50 edits retain one generation,11 rows and one106-byte receipt file; SQLite file lengths remain118,784bytes at settled samples. The final shared golden and original receipt bytes match.
- Shared127 Node/62 Python tests and the90-file static boundary gate passed, zero skips. The historical hosted incarnation assertion was a redundant test replacement after eager legacy migration; the corrected test retains exact revision/epoch/stale-install assertions and passes in the final iOS selection.

This does not bound quarantined or intentionally pinned history, prove physical crash/full-disk behavior, or enable larger capacity. Current-cap resource qualification remains open.

The [current iOS Release sample](../../apps/ios/evidence/current-cap-resource.md) passed exact data/receipt checks across the existing three workloads after updating only the performance harness. One 10k-expense observation measured save2.14s, legacy export552ms and restore2.04s; MainActor heartbeat gaps reached81ms during save and266ms during export. These are observed performance limitations, not accepted p95 results or a comparison with an unchanged baseline. The100-receipt-count, combined maximum, peak-memory and physical-device gates remain open.

The [subsequent encoding reuse](evidence/capacity-count-reuse-integration.json) removes a duplicate capacity encoding within each authenticated iOS metadata read. An immutable validated body/count result preserves every parse, model, receipt, capacity and reopen check; it introduces no cross-read cache. Focused32/32 and one Release run of the three existing workloads pass, with independent review and shared127Node/62Python/static/SAST checks. The latest10k observation is save1.55s, legacy export481ms and restore1.71s; observed heartbeat gaps remain77ms/224ms. This is not a controlled improvement or accepted physical p95 result.

The subsequent59304d7 hosted run exposed two API26 test-readiness failures: a camera lookup raced the opening sheet, and an immediate dismissal check dereferenced a null accessibility root. The [two-test correction](../../apps/android/evidence/ui-readiness-59304d7.json) requires an enabled camera control and a non-null foreground package matching Penny. Both original journeys pass2/2 on each API26/37 against unchanged production APK bytes. Its prior hosted failures remain recorded. The same hosted run encountered a pinned crypto-source HTTP504 before reference-corpus verification; the next corrected-source run must complete that gate.

## Combined current-cap sample

The [paired combined-boundary sample](evidence/combined-current-cap-integration.json) passes one iOS Release test and one API37 debug test with the same 10,000 expenses, 100 receipts totaling exactly 8 MiB and six nonempty finance arrays. All fields and receipt bytes survive a real metadata edit, streamed v4 export/install/reopen and legacy compatibility roundtrip. Both v4 files are 11,814,682 bytes; both edited legacy envelopes are 19,373,545 bytes. Runtime and capacity limits are unchanged.

This closes one count/byte combination, using padded 1×1 PNGs. It does not close physical p95, peak memory, decoded-pixel/longest-field combinations or API26 combined-load qualification. The iOS read/install phase showed a 1,277.55 ms MainActor heartbeat gap. A separate instrumented run then attributed a 1,336.65 ms gap to synchronous candidate installation; preparation reached 79.91 ms. The subsequent [async installation](evidence/async-install-integration.json) now transfers the sole candidate to the existing worker, preserving ownership/publication guards. All19 focused methods and one combined-cap Release method pass; the latest restore heartbeat gap is83.75ms with a3,069.19ms total read/install time. These are single observations, not physical p95. Android live edit measured 3,188.76 ms in debug. These remain performance limitations, despite exact data acceptance.

## Next implementation sequence

Latest [hosted1305c5e](evidence/hosted-native-1305c5e.json) passes both Android runtimes (112 passed, eight named skips and four separate process methods each), native build and authenticated contract/corpus checks. iOS passes143/144 unit methods and9/9 UI methods; one automatic-backup test exhausted a fixed scheduler-yield wait before worker completion. The test-only correction now waits on actual completion under a fixed wall-clock deadline; all six automatic-backup methods pass locally, preserving completion, cancellation and last-good assertions. The failed hosted command did not reach separate iOS generation phases.

1. [Hosted59304d7](evidence/hosted-native-59304d7.json) completed: iOS143/143 unit tests,9/9 UI tests and both separate generation phases passed. Android37 passed112/120 with eight named skips and four separate process methods. Android26 recorded two test-readiness failures; its subsequent process phases did not run. The contract job failed on an HTTP504 source download. Local successor `915a617c80a71837cb2122f7ad9115d38782246a` contains the passing Android test corrections and iOS encoding reuse; a new full hosted pass is required.
2. Under the recorded [current-cap scope decision](PLAN.md#current-cap-release-scope-decision--2026-09-14), prioritize remaining release blockers at existing limits: provider configuration/real recovery, complete legacy reconciliation, accessibility and signed distribution. Larger-capacity work is a separate target and is not evidence of release readiness.
3. Use the combined-cap sample to address measured save/export latency and remaining main-thread work; qualify remaining physical and maximum-pixel/resource paths. Further receipt/finance mutation deltas and file-based cloud transfer precede any later Profile A attempt. Cloud-v1 remains a separately versioned compatibility protocol until a paired successor is accepted.
4. Execute physical-device and real-provider gates, then internal-store validation and controlled rollout. Retire web dependencies only after migration/support gates pass.

Each slice reuses existing authenticated storage/publication primitives. Do not widen scope or repeat unchanged tests merely because an agent is idle. Substantial release work remains; test/file counts do not establish a completion percentage or delivery date.

## Migration scope

The raw adapter preserves represented expenses, budgets, configured income sources and, in recorded-balance mode, savings goals when exported contribution rows are empty. The three-goal shared golden totals 13,734 minor units and creates no historical contributions or received income. All six other nonempty history/group domains still block that subset conversion. Original fields and caches remain private provenance. [Converter scope](../../scripts/offline/MIGRATE_RAW_EVIDENCE.md), [native savings proof](../../apps/ios/evidence/observed-savings-migration.md), and [receipt acquisition scope](evidence/receipt-acquisition-validation.json) are explicit. No complete-account or signed-upgrade claim is made.

## Demo, design and physical boundaries

The normal development apps have been built, installed and launched with empty local vaults under `ca.penny.offline.dev`; automation uses separate identities. [Current demo proof](evidence/native-demo-metadata.json) records that earlier source/binary checkpoint. The normal demos are preserved while isolated tests run. They are not store candidates.

Small-phone/tablet, large-text/dark-mode and functional journeys passed at documented checkpoints. The separate unfiltered iOS accessibility diagnostic remains **failed with 13 findings: ten Dynamic Type, two clipping and one contrast**. [Element dispositions](evidence/ios-accessibility-disposition.md) and the [search-prompt correction](../../apps/ios/evidence/a11y-search-prompt.md) do not clear that gate. Physical VoiceOver/TalkBack remains open.

The user plans to connect physical iPhone and Android devices on September15; models/OS versions are pending. The [device-session checklist](DEVICE_SESSION.md) is prepared. No attached supported device has yet established Foundation Models/Nano inference, hardware key protection, real provider recovery or battery behavior. Android's default-deny TLS configuration does not establish custom SDK/AICore traffic behavior. [PRIVACY.md](PRIVACY.md), [PROVIDER_SETUP.md](PROVIDER_SETUP.md) and [RELEASE.md](RELEASE.md) retain these gates. Store/API observations are historical snapshots, not newly verified release state.

## Review isolation and budget

The original checkout contains 18 protected legacy source paths recorded in `artifacts/offline/legacy-baseline-hashes.json`; they are excluded from native synchronization. Generated docs are regenerated independently per checkout. The review worktree is `/Users/sarathfrancis/work/git/Personal/penny-offline-review`, branch `codex/penny-offline-native` from `bcdd69d`. No blanket staging, resetting or copying of unrelated API/Flutter edits is allowed. Raw logs, source pins and failed evidence remain under ignored artifact/build directories; compact reports and public fixtures are checked in.

The latest recorded account reading is **95% weekly usage consumed / 5% remaining**, resetting **2026-09-19 at 14:37:59 America/Toronto**. This is account-wide, not a repository token budget. No reset credit has been redeemed. Work uses two narrowly scoped implementers plus independent review when a concrete patch is ready, with usage checks at integration milestones.

The original **120,000-token estimate was exceeded**. The latest goal-tool checkpoint recorded **19,053,632 aggregate tokens and 50,119 elapsed seconds**; this historical measurement is not current consumption, a forecast or proof of budget compliance. The active goal has no enforced ceiling. Worker allocations are soft estimates, not measured usage. Unfinished gates are never accepted because an allocation is spent.
