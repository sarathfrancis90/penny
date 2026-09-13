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
