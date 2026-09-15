# Validated body-count reuse — 2026-09-14

Final reviewed source passed **32/32 focused tests** and **one Release test covering all three existing resource cases**, zero skips. `StrictJSON.ValidatedSnapshot` keeps the immutable validated body and its already computed export byte count together; construction is confined to StrictJSON. Only `exportMetadata` selects the private validated-capacity branch. Other callers encode normally. Every strict shape/model/receipt/native-image/capacity check and repeated authenticated reopen remains; no cache or MainActor restructuring was added.

Focused coverage includes exact empty/escaped/large-receipt byte parity, token copy isolation, strict Unicode/unknown/duplicate rejection, current capacity refusal, durable publication/recovery, receipt ownership and metadata retention. The unchanged Release oracle compares the complete edited Snapshot and exact receipt bytes after decode, restore and fresh store reopen.

| Single observed case | Save ms | Legacy export ms | Decode + restore ms |
| --- | ---: | ---: | ---: |
| 1,000 expenses | 163.74 | 52.59 | 179.20 |
| 10,000 expenses | 1,547.60 | 480.63 | 1,709.64 |
| 100 expenses + four 2 MiB / 16 MP JPEGs | 181.22 | 225.77 | 389.45 |

At 10k, maximum MainActor heartbeat gaps remained **77.41 ms for save** and **224.21 ms for legacy export**. These single observations do not quantify improvement or establish physical p95/current-cap qualification. Export includes compatibility hydration, not the v4 Files writer. Finance arrays remain empty in these unchanged workloads; no100-receipt, combined maximum, memory or energy case was added.

[Machine-readable evidence](capacity-count-reuse.json) pins source, binary inventories, results and all timings. Raw files: `artifacts/offline/capacity-count-reuse-ios/validation-01/{Debug,Release}`. Both source/binary inventories matched after execution. Earlier uninstrumented and diagnostic evidence remains separate. Xcode26.6, arm64 iOS Simulator26.4.1; Release used `-O -whole-module-optimization` and `ENABLE_TESTABILITY=YES`. F70 is shut down, normal demo untouched. Approximately5–6k tokens including proof/evidence; no timing repetitions or broader implementation.
