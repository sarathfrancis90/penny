# Native performance and capacity gate

This gate is open. Current portable schema 3 admits up to 10,000 expenses and 100 receipts, with 2 MiB per receipt and 8 MiB total receipt bytes. The encoded encrypted archive is limited to 20 MiB. These are independently enforced limits, so some combinations of long notes and images reach byte capacity before record capacity. There is no claim that 50,000 expenses or a multi-year collection of large receipts is supported.

## Reference benchmark

Run `npm run offline:benchmark`. The synthetic workload includes varied merchants/categories/dates and 128-character notes, no real user records and no receipts. It validates full equality after encryption/decryption. Five repetitions report median and maximum latency. The script asserts that 50,000 expenses are rejected with the defined count-limit error.

Measured 2026-09-13 on an Apple M4 Pro, macOS Darwin 25.6.0, Node 22.15.0. Full local evidence is `artifacts/offline/contract-benchmark.json` (ignored). These are Node reference timings, not native storage or physical-device benchmarks.

| Operation, median | 1,000 expenses | 10,000 expenses |
| --- | ---: | ---: |
| Validate snapshot | 5.56 ms | 48.96 ms |
| Validate, seal and serialize backup | 8.26 ms | 80.23 ms |
| Parse, authenticate and validate restore | 17.59 ms | 169.94 ms |
| Validated monthly report | 5.88 ms | 57.37 ms |
| Validated CSV export | 6.72 ms | 67.75 ms |
| Encoded encrypted bytes | 690,297 | 6,911,749 |

Process peak RSS was 338,368 KiB across all workloads, including the rejected 50,000-record allocation. That aggregate cannot be attributed to a single operation. Native allocation and peak-memory profiling remain required.

The initial benchmark exposed a stack overflow in the shared validator's repeated-group base64 regex on a valid multi-megabyte archive. The decoder now scans the bounded alphabet/padding linearly and checks canonical decode/re-encode equality. A separate regression opens a valid archive exceeding 19 MiB and rejects equally long malformed input. Swift and Kotlin use native decoders plus exact re-encoding without that regex pattern.

## Native P6 measurements

Native benchmarks exposed and corrected real bottlenecks. iOS now prepares authenticated archives and immutable write proposals on a serialized actor, retaining a revision/epoch-guarded atomic commit. Android replaces per-row Keystore operations with a random row data key wrapped by Keystore and authenticates the current wrapped key once per operation. Its strict numeric JSON parser now scans linearly. Portable formats and capacity limits are unchanged.

The iOS sample below is a Release-optimized XCTest run on an **iPhone 17 simulator, iOS 26.4.1**. It is one sample per workload, not five-run percentiles or a physical-device claim. A 2 ms MainActor heartbeat samples responsiveness; it is not a frame-rendering profile. Evidence: `apps/ios/.build/png-performance-final/711F606F-B099-44A3-B738-CC2293228117.json`.

| iOS operation | 1,000 expenses | 10,000 expenses | 8 MiB JPEG receipts |
| --- | ---: | ---: | ---: |
| Cold vault open | 19 ms | 170 ms | 55 ms |
| Async durable save | 11 ms | 92 ms | 57 ms |
| Maximum save heartbeat gap | 3.4 ms | 9.3 ms | 27.0 ms |
| Protected encrypted export | 32 ms | 274 ms | 158 ms |
| Authenticate/decode restore | 19 ms | 177 ms | 84 ms |
| Restore final commit | 11 ms | 88 ms | 65 ms |
| Maximum restore commit heartbeat gap | 5.2 ms | 9.6 ms | 35.2 ms |

This final-source rerun uses the same JPEG receipt matrix. It does not establish PNG-specific maximum-corpus latency.

Android P6 ran on an **Android 17/API 37 ARM64 emulator with 16 KiB pages**, using a debug instrumented build. Before the changes, a 10k reopen/edit each took about 13 seconds and portable decode 31.5 seconds. The earlier optimized standalone sample measured reopen 1.39 s, durable edit 1.30 s, snapshot refresh 1.13 s, export 277 ms and portable decode 1.21 s. A separate external force-stop/reopen authenticated all 10k records in **1.563 s** under a different PID. OS disk cache was not flushed. Full measurements, exact commands and source hashes are in [Android P6 evidence](../../apps/android/evidence/P6.md).

The final Android17 full-suite sample after all key and PNG corrections measured 10k reopen **1.108 s**, edit **1.160 s** plus refresh **1.066 s**, export **239 ms**, decode **1.068 s** and replacement **1.397 s**. Ordinary edit plus refresh remains about **2.23 seconds**, off the main thread. Sampled PSS reached 303,530 KiB in that UI/OCR process (`apps/android/evidence/p6-performance-final-suite.json`), versus 202,283 KiB in the earlier standalone run; these operation-boundary samples are not true peak memory. The emulator's memory limiter was disabled by its system configuration. The provisional physical-device latency and memory gates remain open.

Both workloads authenticate and compare restored records and exact receipt bytes. The 8 MiB receipt case uses four 2 MiB images; it does not establish the independent 100-receipt count boundary's performance. iOS tests include four 16-megapixel decoded images. Android's byte-capacity images use valid ancillary PNG padding, with meaningful large-image content exercised separately.

## Remaining native acceptance work

Measure each platform's cold open, single-record save, search, monthly report, CSV, encrypted export and restore at 1k and 10k records, then the 100-receipt/8 MiB boundary. Include at least five repetitions and distinguish cold/warm runs, debug/release, simulator/emulator/physical hardware. Measure at-rest size, peak memory, main-thread stalls, cancellation and remaining local capacity. A host reference benchmark cannot close these checks.

Initial engineering targets for a supported physical phone are: cold opening of a 10k ledger under two seconds; responsive input while background storage/backup work runs; ordinary save/search/report under 150 ms at the 95th percentile; and bounded memory/cancellation for maximum accepted backup size. These are provisional targets to validate, not results. OCR/model latency and thermal behavior require a separate supported-device measurement.

Before a large-dataset release, decouple receipt blobs from inline whole-vault JSON and define a versioned streaming encrypted archive or bounded chunk manifest. Keep prior v1/v2/v3 exports readable. A new format must authenticate each blob's identity, content, length and ownership, enforce total limits, preserve atomic restore and carry shared Swift/Kotlin vectors. Raising an integer limit alone is insufficient: backup staging, providers, local writes, restore rollback and UI capacity reporting must agree.

Do not silently drop receipts or delete old backups to satisfy these limits. At capacity, preserve the existing vault and provide a clear export/capacity action until a measured compatible storage revision is ready.

## Committed expense state follow-up

An ordinary Android save/delete now returns its fully validated snapshot only after the outer SQLite transaction ends successfully. The ViewModel publishes that result instead of reading/decrypting the vault again. No cache, key-check shortcut, schema or capacity increase was introduced. Four new device regressions cover second-connection edits/restores, full validation/report agreement, late SQL rollback, key loss/corruption and no optimistic UI publication; API26 passed all four and API37 passed sixteen storage/finance/CRUD/capture checks.

A five-pair, alternating-order benchmark on API37 ARM64/16 KiB measured the current binary's two data paths for 10,000 expenses and zero receipts. Each pair used the same process and an untimed full snapshot oracle. It measures storage and UI-state construction, not rendered frames or user-perceived completion.

| Same-binary path | Median | Range |
| --- | ---: | ---: |
| Save and use returned committed state | 1,074.51 ms | 1,066.18–1,172.12 ms |
| Save and replay redundant expense/receipt reads | 2,065.09 ms | 2,058.05–2,086.37 ms |

The measured median difference is 47.97%. This is not a clean original-binary versus new-binary comparison: earlier separate samples were confounded by overlapping builds/emulators and are retained as inconclusive evidence. The paired run began after agent build tasks finished and the temporary API26 emulator stopped; normal host processes and idle simulators remained. It is a debug emulator sample, not physical p95, receipt-capacity, 50k or peak-memory acceptance. The approximately one-second remaining full-validation cost motivates the separate storage/capacity phase.

Raw samples, source hashes, commands, failed-attempt caveats and exact benchmark scope are in [mutation provenance](../../apps/android/evidence/mutation-performance/provenance.json) and [paired samples](../../apps/android/evidence/mutation-performance/paired-api37.json).

## Durable receipt follow-up

The detached-storage source has now been measured before and after removing
redundant receipt reads. Earlier P6 and returned-state results above apply to
their original source checkpoints. They are not current generation-storage
latency or a direct comparison with the following workloads.

- Android: five actual-write samples per source/workload on the same API37
  debug emulator. At 10k expenses plus four exactly 2-MiB padded PNG receipts,
  save/returned-state median changed 4145.73→3989.91 ms (-3.76%). The receipt-free
  control changed 3088.13→3101.94 ms (+0.45%). Both sides use the same corrected
  benchmark, with different merchant values and revision increments so both
  paths perform real writes. API26/API37 each pass 17 focused tests.
- iOS: three Release samples per side on one simulator. At 100 expenses plus
  four near-2-MiB, 4000×4000 JPEG receipts, save median changed 374.82→370.73 ms
  (-1.09%), with overlapping ranges and no meaningful gain established.
  Receipt-free controls were essentially unchanged; unrelated export/restore
  controls varied upward. All six benchmark tests and eight durable storage
  tests pass. No timing reruns were selected.

These workloads/configurations differ and do not compare platform speeds.
Each change removes redundant work while preserving full authentication, native
image validation and pre-publication checks. Neither establishes peak-memory,
physical-device, streamed capacity or release acceptance. Source/APK/binary
pins, all samples and exact limitations are in the
[Android report](../../apps/android/evidence/receipt-hydration.md) and
[iOS report](../../apps/ios/evidence/receipt-reuse-performance.md).

## Current-cap Release sample after bounded retention

The [current-source iOS evidence](../../apps/ios/evidence/current-cap-resource.md) records one Release run of the existing three workloads, with an updated test-only harness and exact snapshot/receipt checks after decode, install and new-store reopen. At10,000 expenses, save took2.14s, legacy compatibility export552ms and restore2.04s. The observed MainActor heartbeat gaps reached81ms for save and266ms for compatibility export. These limitations remain open; the sample does not establish physical p95 acceptance or comparative improvement. Receipt-byte/pixel capacity was exercised separately with100 expenses and four2MiB/16MP JPEG receipts. Receipt-count capacity, combined maximum, memory and physical behavior were not measured.

A later [encoding-reuse checkpoint](../../apps/ios/evidence/capacity-count-reuse.md) removes only duplicate body-capacity encoding inside each authenticated read. All validation/reopen boundaries remain. Its single10k observation measured save1.55s, legacy export481ms and restore1.71s, with77ms/224ms save/export heartbeat maxima. These separate observations are not a controlled performance comparison. MainActor preflight/legacy hydration and full-capacity physical acceptance remain open.

## Combined count and byte boundary

The [shared workload](../../packages/offline-contract/fixtures/current-cap-v1/README.md)
combines 10,000 expenses, 100 receipts and exactly 8 MiB of raw receipt bytes,
including one 2 MiB image. All six finance arrays are populated. One iOS Release
run and one API37 debug run pass complete field/raw-byte equality after an
ordinary metadata edit, streamed v4 export/install/new-store reopen and legacy
compatibility export/decode. [Paired evidence](evidence/combined-current-cap-integration.json)
records root-verified source/binary pins and the exact scope.

| Operation | iOS Release simulator | Android API37 debug emulator |
| --- | ---: | ---: |
| Local metadata edit | 1,969.87 ms | 3,188.76 ms |
| Verified v4 export | 1,126.35 ms | 3,101.59 ms |
| V4 read/install | 3,142.44 ms combined | 7,579.93 ms prepare +4,943.64 ms install |
| Reopen | 237.84 ms open, oracle outside timing | 1,660.21 ms including full oracle |
| Legacy export/decode | 1,175.23 ms including oracle | 6,173.25 ms including oracle |

These columns have different timing boundaries and build modes; they are not a
platform ranking. Both streamed files contain 11,814,682 bytes and both edited
legacy envelopes 19,373,545 bytes. A source-hashed Node constructor also validates
and exactly roundtrips the original workload at 14,530,063 plaintext bytes and
19,373,541 envelope bytes.

The iOS 2 ms heartbeat observed maximum gaps of 78.79 ms during edit, 3.10 ms during
v4 export, 1,277.55 ms during combined read/install and 341.01 ms during legacy
export/decode. The read/install stall remains a concrete responsiveness issue;
this aggregate timer does not identify its exact blocking subphase. Android
records operation-boundary Java/native/PSS samples including the retained test
oracle, not peak app memory. Each platform ran once without overlapping native
measurements. Padded 1×1 PNGs establish encoded-byte/count behavior, not maximum
pixel pressure, physical p95, battery, thermal or every longest-field case.

A separate instrumented iOS follow-up split the read/install timer without
changing the fixture, validation or exact oracle. It passed once: preparation
1,992.08 ms (maximum heartbeat gap 79.91 ms), candidate begin 79.545 ms, and
synchronous installation 1,332.40 ms (heartbeat gap 1,336.65 ms). This directly
locates the long stall in installation. The [paired report](evidence/combined-current-cap-integration.json)
pins the ignored instrumentation diff and raw result. Moving the existing leased
installation/publication operation off MainActor is the next targeted change;
ownership, actual key/source checks, cancellation and rollback must remain intact.

## Async candidate installation follow-up

The [async installation checkpoint](evidence/async-install-integration.json)
transfers the candidate's sole ownership to the existing serial worker for leased
publication and final hydration. MainActor reserves the writer, captures receiver
identity, and checks identity and the actual key again before adopting the result.
Stale identity rejects before entering the write state; a stale preview cannot
lock a healthy current vault. Cancellation, source checks, rollback and foreign
candidate ownership remain covered by the focused tests.

All 19 focused methods passed, followed by one Release run of the unchanged
combined fixture with the real async Files installation API. Read/install took
3,069.19 ms with a maximum MainActor heartbeat gap of 83.75 ms, versus the earlier
single normal observation of 3,142.44 ms / 1,277.55 ms. This establishes responsive
worker execution for this observed workload, not a statistical throughput gain
or physical p95. The exact full Snapshot and receipt oracle still passes.
Legacy compatibility export/decode reached a 316.37 ms heartbeat gap and remains
outside this change. Native formats, limits and Android production code are
unchanged; Android's preceding paired fixture evidence remains separate.
