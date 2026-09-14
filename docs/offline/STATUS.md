# Penny Offline execution status

Updated 2026-09-14. [PLAN.md](PLAN.md) defines the product and release gates. The [evidence index](evidence/README.md), native READMEs and [REVIEW.md](REVIEW.md) preserve earlier checks, failures and corrections.

## Release disposition

**In development; not a release candidate.** Separate SwiftUI and Kotlin/Compose apps run locally with encrypted expenses, receipts and finance records. Ordinary operation requires no account, network service or available generative model. [Draft PR44](https://github.com/sarathfrancis90/penny/pull/44) contains the development milestone. No native store upload, merge or production-service retirement has occurred.

## Current implementation and remaining work

| Area | Implemented and verified scope | Remaining acceptance |
| --- | --- | --- |
| Native apps | iOS 26 SwiftUI; Android API26+ Compose/Material3; local CRUD, search, summaries, native navigation and empty/error states | Physical accessibility, hardware security and final signed installs |
| Encrypted ledger | Device-bound generations, detached receipts, guarded publication, authenticated predecessor recovery and separate-process checks | [Receipt-free live state](LIVE_STATE.md) and incremental mutations, large-dataset measurements, physical interrupted-write/full-disk matrix |
| Finance | Budgets, received income, savings contributions, recurring review, deterministic reports and CSV; matching shared financial cases | Full legacy reconciliation, refunds/non-CAD/withdrawal product decisions and localization |
| Receipt capture | Native camera/picker, bounded image preparation, bundled OCR, shared parser and PNG integrity corpus | Physical camera/HEIC quality and supported-device performance |
| On-device AI | Optional Foundation Models / Gemini Nano proposals with explicit unavailable/download states and grounded review; manual entry remains available | Supported physical-device inference, quality/resources and SDK/AICore traffic observation |
| Portable recovery | Legacy v1/v2/v3 compatibility; app-linked v4 streamed writers and readers, guarded candidates, reciprocal native export/restore/reopen; Files restore integration | Provider file transfer, capacity and physical recovery |
| Private cloud backup | CloudKit / Drive appDataFolder adapters, explicit opt-in, guarded publication/restore, default-off scheduling and fake-transport tests | V4 file transport, real-account consent, remote completion, clean-device restore, background execution and retention |
| Migration and retirement | Authenticated raw-query exporter, receipt acquisition and strict converters with reconciliation reports; web feature development retired | Complete authenticated legacy acquisition/reconciliation, signed upgrade and support-window retirement gates |
| Packaging | Isolated packaging, version/signature/provider preflights, negative tests and unsigned native builds | Actual signing/profile/entitlements, distribution artifacts and store validation |

Current limits remain **10,000 expenses, 100 receipts, 8 MiB aggregate receipt bytes and 2 MiB per receipt**. Legacy JSON is bounded to 15 MiB and encrypted input to 20 MiB. Profile A (50,000 expenses, 5,000 receipts, 512 MiB raw receipts) is a measurement target, not enabled capacity. The [capacity decision](CAPACITY_V4_DECISION.md) and [performance report](PERFORMANCE.md) retain the rationale and measured limits.

## Latest accepted checkpoints

The review branch is pushed at **e7fc1d2aaf629a6c97f597d1ecd901dc9482292c**, following app linkage (`ac8b670`) and candidate/savings integration (`8461f1c`). The [writer and Files restore report](evidence/v4-writer-files-integration.json) records:

- iOS: 19/19 focused methods, zero skips (writer/interchange six, Files restore six, candidate regression seven).
- Android: 21/21 on each API26/37, followed by a separate final four-method reciprocal/Files overlay on each; 25 JVM tests, build and lint passed.
- Actual native writer files are shared goldens. Each opposite platform validates, installs and reopens all eight represented domains and exact receipt bytes. This is fresh-store, same-process evidence.
- Shared integration: 124 Node and 62 Python tests, zero skips; static boundaries, 104 review documentation tests, targeted lint and changed-source SAST passed. The push hook passed all 290 enabled Flutter tests.

[The native workflow for e7fc1d2](https://github.com/sarathfrancis90/penny/actions/runs/34815486375) is still running at this capture. Its contract and Android build jobs passed. Downloaded Android JUnit evidence passes 90/98 on each API26/37, with eight named opt-in/process skips; the four separately invoked process methods pass on each. iOS and final aggregates remain pending. These hosted results do not cover subsequent Files export edits.

The earlier **b22b4f6** checkpoint passed [all native jobs](evidence/hosted-native-b22b4f6.json): iOS103/103, Android68/76 on each runtime with eight named skips, and separate process phases. Retained Flutter iOS subsequently passed; [all23 repository checks succeeded](evidence/hosted-required-b22b4f6.json). Earlier results and failed runs remain individually linked in the evidence index; they are not new runs against current source.

## Files export local checkpoint

Both apps now prepare a verified owned v4 file before opening the destination picker. A fresh export UUID/date determines its filename. Destination success requires complete native readback, exact byte count/digest, and successful close. Existing nonempty destinations are preserved. Cloud-upload completion is never inferred from a local file write.

[Android evidence](../../apps/android/evidence/v4-files-export.md) records successful actual Downloads picker saves on API26/37. Its 11 non-UI methods pass on both; final two-method UI overlays pass separately. Earlier lazy-list and API26 screenshot-null test failures are retained. The final [request-binding correction](../../apps/android/evidence/v4-files-export-binding.json) passes eight focused methods on each runtime: six controller and two actual UI journeys. Stale URI/null results cannot consume a newer request; disposal cancels only the matching unclaimed stage. Claimed exports remain owned until the worker starts. Independent review found no remaining P1/P2; actual Activity recreation remains untested.

[iOS evidence](../../apps/ios/evidence/v4-files-export.md) records an ordinary 11/11 checkpoint, including three destination tests, six writer tests, legacy compatibility and real picker cancellation. Positive folder-selection diagnostics then exposed a missing built `UIFileSharingEnabled` key despite its project setting. Explicit plist properties now produce both intended Files keys. The corrected build passed a real folder-selection/save journey and, in a separate test-only overlay, actual Back-to-root cancellation/dismissal/relaunch. Earlier passing results are not attributed to these later builds.

## Next implementation sequence

1. Integrate the verified [Files export checkpoint](evidence/v4-files-export-integration.json) and complete its repository checks.
2. Replace aggregate receipt hydration on open/list/view/edit with authenticated receipt-free state and lazy owned reads. Preserve existing caps until every ordinary mutation and compatibility consumer is accounted for. Verify retained receipt ciphertext, stale instances, corruption, cancellation and reopen behavior on both platforms.
3. Complete receipt/finance mutation deltas and file-based cloud transfer. Then measure the full capacity matrix before enabling larger limits.
4. Complete migration reconciliation and signed upgrade packaging. Resolve accessibility findings and prepare exact distribution artifacts.
5. Execute real provider and physical-device gates, then internal-store validation and controlled rollout. Retire web dependencies only after migration/support gates pass.

Each slice reuses existing authenticated storage/publication primitives. Do not widen scope or repeat unchanged tests merely because an agent is idle. Substantial release work remains; test/file counts do not establish a completion percentage or delivery date.

## Migration scope

The raw adapter preserves represented expenses, budgets, configured income sources and, in recorded-balance mode, savings goals when exported contribution rows are empty. The three-goal shared golden totals 13,734 minor units and creates no historical contributions or received income. All six other nonempty history/group domains still block that subset conversion. Original fields and caches remain private provenance. [Converter scope](../../scripts/offline/MIGRATE_RAW_EVIDENCE.md), [native savings proof](../../apps/ios/evidence/observed-savings-migration.md), and [receipt acquisition scope](evidence/receipt-acquisition-validation.json) are explicit. No complete-account or signed-upgrade claim is made.

## Demo, design and physical boundaries

The normal development apps have been built, installed and launched with empty local vaults under `ca.penny.offline.dev`; automation uses separate identities. [Current demo proof](evidence/native-demo-metadata.json) records that earlier source/binary checkpoint. The normal demos are preserved while isolated tests run. They are not store candidates.

Small-phone/tablet, large-text/dark-mode and functional journeys passed at documented checkpoints. The separate unfiltered iOS accessibility diagnostic remains **failed with 13 findings: ten Dynamic Type, two clipping and one contrast**. [Element dispositions](evidence/ios-accessibility-disposition.md) and the [search-prompt correction](../../apps/ios/evidence/a11y-search-prompt.md) do not clear that gate. Physical VoiceOver/TalkBack remains open.

No attached supported device has established Foundation Models/Nano inference, hardware key protection, real provider recovery or battery behavior. Android's default-deny TLS configuration does not establish custom SDK/AICore traffic behavior. [PRIVACY.md](PRIVACY.md), [PROVIDER_SETUP.md](PROVIDER_SETUP.md) and [RELEASE.md](RELEASE.md) retain these gates. Store/API observations are historical snapshots, not newly verified release state.

## Review isolation and budget

The original checkout contains 18 protected legacy source paths recorded in `artifacts/offline/legacy-baseline-hashes.json`; they are excluded from native synchronization. Generated docs are regenerated independently per checkout. The review worktree is `/Users/sarathfrancis/work/git/Personal/penny-offline-review`, branch `codex/penny-offline-native` from `bcdd69d`. No blanket staging, resetting or copying of unrelated API/Flutter edits is allowed. Raw logs, source pins and failed evidence remain under ignored artifact/build directories; compact reports and public fixtures are checked in.

The latest recorded account reading is **81% weekly usage consumed / 19% remaining**, resetting **2026-09-19 at 14:37:59 America/Toronto**. This is account-wide, not a repository token budget. No reset credit has been redeemed. Work uses two narrowly scoped implementers plus independent review when a concrete patch is ready, with usage checks at integration milestones.

The original **120,000-token estimate was exceeded**. The earlier goal-tool checkpoint recorded **14,626,837 aggregate tokens and 37,936 elapsed seconds**; this historical measurement is not current consumption, a forecast or proof of budget compliance. The active goal has no enforced ceiling. Worker allocations are soft estimates, not measured usage. Unfinished gates are never accepted because an allocation is spent.
