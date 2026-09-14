# iOS unchanged receipt read correction

The receipt-save median fell 1.09% in three Release runs per side, with overlapping ranges. This does **not** establish a meaningful timing gain. The source removes one redundant receipt file read/decrypt/native decode per unchanged receipt (five reads become four); all four full candidate hydrations, source/pointer guards and rollback remain. The first full hydrate still rejects corruption before `.staged` and pointer publication.

| Save workload | Before median (range), ms | After median (range), ms | Median change |
|---|---:|---:|---:|
| expenses-1000 | 123.63 (120.09–125.87) | 122.53 (120.24–126.13) | -0.89% |
| expenses-10000 | 1174.40 (1173.79–1183.12) | 1173.40 (1168.51–1243.68) | -0.09% |
| receipt-byte-and-pixel-bound | 374.82 (363.76–380.04) | 370.73 (369.43–417.13) | -1.09% |

The four-receipt protected-export median rose from 150.36 to 169.23 ms (+12.55%) and restore-commit median from 427.43 to 484.09 ms (+13.25%); neither operation takes the changed reuse branch. Three samples are too few to attribute these differences. No timing reruns were selected to improve results.

All six performance tests passed. All eight `DurableStorageTests` passed in the focused Debug run, including `testCorruptUnchangedReceiptFailsBeforeStagingAndPreservesPointer`: an already loaded receipt is externally corrupted, an actual ordinary `saveAsync` fails before `.staged`, cached snapshot and active pointer bytes remain unchanged, and a fresh store remains locked by that corruption. Existing migration, stale-instance, recovery, cancellation/rollback, restore-repair and receipt lease/GC tests also passed.

Measured on the owned F70A4E8F-78ED-4E96-85E6-0EAEB6D34088 iPhone 16e simulator, iOS 26.4.1 (23E254a), arm64; Xcode 26.6 (17F113), Swift 6.3.3, simulator SDK 26.5. Release uses `-O -whole-module-optimization`, `ENABLE_TESTABILITY=YES`, and deployment target 26.0. Android finished its heavy work before baseline measurements. Same simulator and one pinned build per side, three sequential `test-without-building` runs each; source/binary hashes were checked through each set. Simulator returned to shutdown.

Receipt workload: 100 expenses and four near-2 MiB, 4000×4000 JPEGs. The unchanged harness also measures 1k/10k receipt-free controls. This is not a memory, larger-capacity, physical-device or release acceptance result. Its old runtime label mentions MainActor disk replacement; the pinned implementation performs async commit work on serial `ArchiveWorker`.

`receipt-reuse-performance.json` retains exact source/app/test binary hashes, raw samples, medians/ranges, test summaries, commands and log hashes. Raw results and reproducible local runners: `apps/ios/.build/receipt-reuse-performance/` (`Before1–3.xcresult`, `After1–3.xcresult`, `Regression.xcresult`). The first Release build failed due to missing testability; the corrected build succeeded, then runner bundle-path pinning was fixed. Neither setup failure collected a sample. No application caps, persisted format, backup semantics or caches changed.
