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
