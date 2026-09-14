# Current-cap iOS resource sample — 2026-09-14

One serial Release simulator run passed **1/1 test, zero skips**, covering the three existing workloads. Only the performance harness changed: metadata/report access uses `liveBody`, legacy export explicitly hydrates through `compatibilitySnapshot`, and exact edited Snapshot/receipt-byte equality replaces count-only assertions after decode, restore and new-store reopen.

| Workload | Reopen ms | Save ms | Legacy export ms | Decode + restore ms |
| --- | ---: | ---: | ---: | ---: |
| 1,000 expenses | 22.87 | 219.75 | 58.95 | 212.02 |
| 10,000 expenses | 208.32 | 2,143.23 | 552.37 | 2,040.38 |
| 100 expenses + four 2 MiB / 16 MP JPEGs | 25.08 | 177.33 | 221.96 | 401.48 |

At 10k expenses, observed maximum MainActor heartbeat gaps were **80.94 ms during save** and **266.19 ms during legacy export**, versus 3.24 ms during restore commit. These limitations are recorded; the run does not establish a responsiveness threshold. The receipt case contained exactly 8,388,608 raw receipt bytes. Exact equality covers all eight arrays, although the finance arrays are empty in these preserved workloads.

[Machine-readable evidence](current-cap-resource.json) records all timings, heartbeat observations, source/binary hashes and limits. Raw artifacts: `artifacts/offline/current-cap-resource-ios/validation-01`; result: `apps/ios/.build/current-cap-resource/Tests01.xcresult`. The initial build lacked the existing harness's required `ENABLE_TESTABILITY=YES`; build02 corrected only that command flag. Both logs are retained. Release used `-O -whole-module-optimization`; source and binaries were frozen before the sole timing run and matched afterward.

This is not physical p95 or complete current-cap qualification. Reopen is a new store instance in the same process, without cache eviction; `coldOpenMs` is the retained historical field name. Export measures the legacy compatibility path, not the streamed v4 Files writer. No 100-receipt, combined maximum, memory, thermal, energy or process-cold case was added. F70 is shut down; normal demo data and previous measurements remain untouched. Estimated work: approximately 4–5k tokens including build-command correction/evidence. No runtime changes or repeated timing runs.
