# Compact local evidence

These are copied machine-readable reports from the local native validation recorded in the platform READMEs and `../STATUS.md`. They contain synthetic workloads, aggregate test results and compiled build metadata. They do not establish hosted CI, physical-device behavior or store eligibility.

- `ios-p6-functional-summary.json`: full 60-test functional run before the last UI callback correction.
- `ios-p6-final-fix-summary.json`: five focused checks on the final callback fix; 61 distinct normal tests across both runs, not a new full 61-test run.
- `ios-png-accepted-summary.json`: final PNG correction, 55 unit plus three affected UI checks, all 58 passed.
- `ios-png-corpus-summary.json`: final 24-case mandatory corpus in one test method; five valid exact-byte controls and 19 rejected malformed inputs, through both admission and preparation.
- `ios-p6-performance.json`: the same Release-optimized simulator matrix rerun after the PNG correction, with JPEG receipt workloads and a MainActor heartbeat; not PNG-scale or physical-device percentiles.
- `ios-p6-privacy-build-audit.json`: unsigned device binary icon/privacy/API checks, not an exported distribution archive or final App Store privacy answer.

The separate iOS accessibility diagnostic has 13 unresolved findings and is not included in passing functional counts. Full local xcresults, logs and screenshots remain under ignored `apps/ios/.build/`. Android API26 and API37 summaries retain exact discovery/skips plus every test method name from the final XML reports. Separate process phases are recorded in the platform evidence and are not hidden inside those suite counts. `android-p6-performance.json` records the final debug-emulator workload with sampled memory, not physical-device percentiles.
