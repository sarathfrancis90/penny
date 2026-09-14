# Combined current-cap iOS acceptance — 2026-09-14

One opt-in Release method passed **1/1, zero skips**. The shared deterministic workload contains 10,000 expenses, 100 PNG receipts totaling exactly8,388,608 bytes, one exactly2,097,152-byte image, and all six finance arrays populated from the existing Android finance golden. Source and per-length PNG hashes matched the shared manifest. After the prescribed metadata edit, expense total was12,351,548.

Exact complete Snapshot/receipt-byte checks passed after creation, ordinary receipt-free metadata save, verified streamed v4 export/read/install and new-store reopen. Only fresh export identity and canonical v4 record ordering were normalized. Legacy compatibility export/decode also fit existing caps and passed equality: v4 ciphertext11,814,682 bytes; legacy ciphertext19,373,545 bytes.

| Single observed operation | ms | Maximum MainActor heartbeat gap ms |
| --- | ---: | ---: |
| Create | 1,588.64 | 3.17 |
| Metadata save | 1,969.87 | 78.79 |
| Verified v4 export | 1,126.35 | 3.10 |
| V4 read/install | 3,142.44 | 1,277.55 |
| Compatibility export/decode | 1,175.23 | 341.01 |

New-store reopen took237.84ms. The read/install and compatibility heartbeat gaps are observed limitations; no responsiveness acceptance, phase attribution or fix is claimed. These are padded1x1 PNGs testing encoded count/byte pressure, not pixel pressure. There is no physical p95, memory/energy/thermal or longest-field claim. The test retains its expected Snapshot/base64 oracle. The receiver is a fresh directory with the same supplied local key, not a new hardware-key/device recovery.

[JSON evidence](combined-current-cap.json) pins the harness, project, fixtures and complete runtime/binary inventory. Raw provenance/results: `artifacts/offline/combined-current-cap-ios/validation-01`; result: `apps/ios/.build/combined-current-cap/Tests01.xcresult`. Source/binary hashes matched after the sole run. Xcode26.6, Release -O/WMO with testability, arm64 F70/iOS Simulator26.4.1; Android completed before the exclusive iOS measurement slot. F70 is shut down; normal demo and prior measurements remain untouched. Only the opt-in performance harness and fixture-resource registration changed. Approximately5–6k tokens including proof/evidence; no runtime edits or repeat runs.
