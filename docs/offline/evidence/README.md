# Compact validation evidence

These reports record synthetic workloads, aggregate test results and compiled build metadata. Each report identifies its source and checkpoint. Local results do not establish hosted CI, physical-device behavior or store eligibility. Explicit hosted reports apply only to their recorded commit and job scope.

- `ios-p6-functional-summary.json`: full 60-test functional run before the last UI callback correction.
- `ios-p6-final-fix-summary.json`: five focused checks on the final callback fix; 61 distinct normal tests across both runs, not a new full 61-test run.
- `ios-png-accepted-summary.json`: final PNG correction, 55 unit plus three affected UI checks, all 58 passed.
- `ios-png-corpus-summary.json`: final 24-case mandatory corpus in one test method; five valid exact-byte controls and 19 rejected malformed inputs, through both admission and preparation.
- `ios-p6-performance.json`: the same Release-optimized simulator matrix rerun after the PNG correction, with JPEG receipt workloads and a MainActor heartbeat; not PNG-scale or physical-device percentiles.
- `ios-p6-privacy-build-audit.json`: unsigned device binary icon/privacy/API checks, not an exported distribution archive or final App Store privacy answer.

The separate iOS accessibility diagnostic has 13 unresolved findings and is not included in passing functional counts. Full local xcresults, logs and screenshots remain under ignored `apps/ios/.build/`. Android API 26 and API 37 summaries retain exact discovery/skips plus every test method name from the final XML reports. Separate process phases are recorded in the platform evidence and are not hidden inside those suite counts. `android-p6-performance.json` records the final debug-emulator workload with sampled memory, not physical-device percentiles.


Later integration evidence includes hosted security checks at 25a776c and the iOS hosted-consent harness/44pt action correction. The new phone/smallphone summaries each cover two focused UI methods; the accessibility recheck remains failed. `native-source-provenance.json` retains original accepted hashes and separately records the Android launcher comment and iOS button changes, along with the current installed demo executables. Historical full-suite and unsigned-device evidence must not be relabeled as a fresh run after those changes.

`hosted-native-6cdf304.json` records the later passing native suite: iOS 64/64, both Android runtimes 33/39 with six explicit skips, separate fresh-process recovery and the native aggregate. The retained Flutter iOS check and repository aggregate remain separate. `crypto-build-tooling.json` records authenticated source, local native library builds and seven maintained CMake consumer checks, with source revisions and limitations. It does not establish app linkage, v4 ledger admission or raised capacity.

`ios-visible-a11y/diagnostic.json` closes the narrow full-report scrolling evidence gap at system AX5 with three overlapping captures. Its separate fully visible contrast diagnostic still fails on three other elements and does not clear the complete unfiltered audit. All original settings and normal demo identities are preserved.

- [Photos picker readiness regression](ios-photo-picker-readiness.json): exact affected receipt journey passed locally after guarded system-image readiness; the e3d6dc5 native hosted run also passed.
- [Hosted crypto source and build checkpoint](hosted-crypto-3414197.json): authenticated source/reference and both library builds passed; the same revision had two native UI failures and a failed aggregate.

- [Hosted native e3d6dc5 checkpoint](hosted-native-e3d6dc5.json): iOS64/64, both Android33/39 with six explicit skips and separate process recovery; native aggregate passed. Retained Flutter iOS and overall required gate are separate.
- [Independent local receipt vector](local-receipt-independent.json): exact key derivation, AAD and ciphertext independently reproduced with Python standard HMAC and cryptography AESGCM. Native file lifecycle evidence remains in the platform reports.
- [Final required checks at e3d6dc5](hosted-required-e3d6dc5.json): retained Flutter iOS passed; aggregate-only retry passed after the first attempt timed out waiting for it. All 23 listed checks succeeded, before the later native storage changes.

- [Durable recovery runner checkpoint](durable-process-runners.json): separate writer/reader processes on iOS and Android API26/37, with exact source and log hashes. This precedes the subsequent Drive cancellation correction. Full generation and cancellation coverage remains in each native app report.

- [Durable integration at8815d04](durable-integration-8815d04.json): local gates and enabled pre-push hooks. The subsequent [hosted report](hosted-native-8815d04.json) records three UI failures and a failed aggregate, with separate passing unit/API26 scopes.
- [Raw source exporter validation](raw-export-validation.json): nine synthetic transport/filesystem groups, including FIFO rejection, and97 combined offline Node tests; no real-account acquisition or migration completion.
- [Receipt acquisition validation](receipt-acquisition-validation.json): 18 combined groups and independent review; bounded current originals only, no historical snapshot or native migration readiness.
- [Android receipt input readiness](android-receipt-input-readiness.json): full affected journey passed locally on both API26/37 after test-only input and saved-state checks; the subsequent5d98016 hosted native run also passed.
- [iOS export and consent readiness](../../../apps/ios/evidence/hosted-ui-readiness.md): two full affected journeys passed locally with guarded remote Files readiness and a single native switch gesture; the subsequent5d98016 hosted native run also passed.
- [Raw migration converter](raw-migration-validation.json): 28 new and retained converter groups pass, with independent review. Unsupported domains block output; no complete-account claim.
- [Raw migration native fixtures](raw-migration-native.json): valid candidate preserves all represented records and receipt across restore/reopen; authenticated invalid image is rejected on iOS and Android API26/37, two methods each at explicit source checkpoints.
- [AX5 search prompt correction](../../../apps/ios/evidence/a11y-search-prompt.md): paired captures prove the shortened native prompt remains large. Both unfiltered audits still report 13 findings; the full accessibility gate remains open.
- Metadata-only validation: [Android](../../../apps/android/evidence/generation-metadata.md) passes23 focused groups per API26/37 and25 JVM tests; [iOS](../../../apps/ios/evidence/generation-metadata.md) passes45 focused methods, including raw migration fixtures after the runtime refactor. Existing format and capacity are unchanged; no performance or constant-memory claim.

- [Metadata and migration integration](metadata-migration-integration.json): paired native storage/fixture checks,118 Node tests,27 Python groups and source-pinned local gates.
- [Normal demos after metadata verification](native-demo-metadata.json):110 source/binary/artifact hashes checked and both empty startup screens visually inspected; no populated upgrade or physical-device claim.

- [Hosted native5d98016](hosted-native-5d98016.json): iOS81/81, both Android48/56 with eight named skips, separate generation recovery on both platforms and Android external CRUD restart. Retained Flutter iOS and broader repository aggregate remained pending at capture.

- [Exported IPA preflight](exported-ipa-preflight.json): bounded exact-container inspection, signing-policy routing and retained-product hash binding; 38 Python groups and a real negative development-payload check. No positive signed distribution claim.

- Inactive preparation: [iOS](../../../apps/ios/evidence/inactive-generation.md) 53-method compatibility checkpoint then 19 final-overlay methods; [Android](../../../apps/android/evidence/receipt-candidate.md) 32/32 per API26/37 and 25 JVM tests. Root checked 132 native source/artifact/report hashes. Original ownership pins and explicit quarantine preserve substitutions. This earlier checkpoint preceded guarded installation.

- [Inactive candidate and IPA integration](candidate-ipa-integration.json): 119 Node tests, 43 Python groups, paired native focused checks and resolved ownership/header findings, at explicit checkpoints.

- [Guarded local candidate installation and AAB integration](candidate-install-integration.json): paired local source/runtime gates, independent review and exact scope; no v4/capacity/store acceptance.
- [AAB helper validation](aab-preflight.json): actual JDK/bundletool synthetic positives and rejections, pinned tool/source, no production signing.

- [Hosted required5d98016](hosted-required-5d98016.json): all23 checks eventually succeeded on that exact earlier source, including retained Flutter iOS.
- [iOS v4 app module](../../../apps/ios/evidence/v4-app-module.md) and [Android v4 app reader](../../../apps/android/evidence/v4-app-reader.md): actual app-linked validation at current limits; restore/export integration remains separate.
- [V4 app-link integration](app-codec-integration.json): bounded app gates, independent metadata-limit correction, fresh authenticated Apple dependency preparation and root provenance checks.

- [Hosted nativeb22b4f6](hosted-native-b22b4f6.json): iOS103/103, both Android68/76 with eight named skips, and separate process phases. Later source is separate.
- [iOS v4 candidate](../../../apps/ios/evidence/v4-candidate.md) and [Android v4 restore](../../../apps/android/evidence/v4-restore.md): two-pass authenticated input to existing guarded internal installation at current limits.
- [iOS observed savings](../../../apps/ios/evidence/observed-savings-migration.md) and [Android observed savings](../../../apps/android/evidence/raw-savings.json): exact new shared balance-only migration golden restored/reopened on each runtime.

- [Native v4 writer and Files restore](v4-writer-files-integration.json): paired native exports, actual reciprocal install/reopen, controller/worker preview guards and exact current integration checks. Export destination, system picker UI and provider completion remain separate.

- [All required checks at b22b4f6](hosted-required-b22b4f6.json): all23 exact-source checks succeeded, including retained Flutter iOS. Later changes require their own checks.

- [Native Files v4 export integration](v4-files-export-integration.json): current-cap exports, actual local system picker saves, corrected iOS plist keys, Android request binding/disposal and separately pinned passing/failing test overlays. Cloud/physical acceptance remains open.

- [Hosted native e7fc1d2](hosted-native-e7fc1d2.json): all native jobs passed; iOS130/130, Android90/98 on each runtime with eight named skips, and separate process/recovery phases. Files export is a later checkpoint.

- [Receipt-free live-state integration](live-state-integration.json): paired native open/list/view/edit, retained ciphertext, stale-form protection and explicit complete compatibility paths at unchanged caps. Distinct failing/passing test overlays are preserved.
- [Android hosted Files readiness correction](../../../apps/android/evidence/files-hosted-readiness.json): historical59877b1 fails one picker-readiness method on each runtime; test-only correction passes locally on both with unchanged live production APK.

- [Hosted Files59877b1](hosted-native-59877b1.json): iOS124 unit +9 UI and separate generation phases passed; Android each106total/1failure/6skips, failing the older picker-readiness test. Both aggregates failed; later local correction is separate.

- [Independent accessibility disposition review](ios-accessibility-disposition-review.md): existing exact-element evidence establishes no additional app-owned defect; the unfiltered audit remains failed and later controls/physical/quantitative acceptance are separate.

- [Unbounded iOS metadata retention](metadata-retention-risk.md): historical full metadata per mutation with indefinite retention, followed by a measured bounded-collection correction. Quarantined and pinned history stays protected.

- [Paired v4 in-place repair](v4-repair-integration.json): full validated repair preview, exact raw-target/key binding, exclusive owned-key creation and guarded replacement at current limits, with distinct native runs and explicit platform recovery boundaries.

- [Hosted live-state7ba9512](hosted-native-7ba9512.json): both Android runtimes/build/contract passed; iOS recorded one incarnation-test assertion failure before cancellation by the next source push; native aggregate failed. No full native pass.

- [Paired bounded metadata retention](metadata-retention-integration.json): same50-edit shared workload, iOS33/33 focused tests and Android2/2 on each API26/37, with measured ordinary history and protected reader/recovery provenance.

- [Hosted repair2114c61](hosted-native-2114c61.json): iOS137/138 units and9/9 UI, one known incarnation setup assertion; Android111/119 each with eight named skips plus four separate process methods each. No full native pass.
- [Current iOS Release resource sample](../../../apps/ios/evidence/current-cap-resource.md): one exact-data run, current harness, measured10k save/export latency and heartbeat gaps; physical and complete-capacity gates remain open.

- [Validated capacity-count reuse](capacity-count-reuse-integration.json): immutable same-read body/count provenance removes duplicate encoding;32 focused tests and one three-case Release run pass, with unchanged validation/reopen boundaries and explicit remaining latency limits.

- [Android59304d7 readiness correction](../../../apps/android/evidence/ui-readiness-59304d7.json): two source-confirmed test readiness fixes pass2/2 on each API26/37 against unchanged production APK; null accessibility state is never treated as proof of picker absence.

- [Hosted59304d7](hosted-native-59304d7.json): iOS143 units/9 UI/two generation phases passed; Android37 passed with named skips and process phases; API26 readiness failures and a contract-download HTTP504 remain recorded.

- [Combined current-cap native acceptance](combined-current-cap-integration.json): one shared10k/100receipt/8MiB workload, populated finance, exact native roundtrips; measured iOS read/install responsiveness issue remains open.

- [Hosted1305c5e](hosted-native-1305c5e.json): Android, contract and build passed; one iOS automatic-backup completion-wait failure, with all nine UI methods passing. Historical failure retained.

- [Async iOS candidate installation](async-install-integration.json): nineteen focused methods and one combined-cap Release run; sole ownership moves to the serial worker, with an observed83.75ms restore heartbeat gap and preserved publication guards.
