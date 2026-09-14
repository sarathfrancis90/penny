# Single-pass receipt hydration

`VaultGenerations.read` now builds its temporary attachment list from an internal `LocalReceiptBlob.consumeReopened` callback. Each callback follows the existing strict file read, AES-GCM authentication, length/hash/media validation, and full native image decode. This removes the immediate second read/decode previously performed after `reopen` validated the same receipt. Both directory inventory checks, pinned descriptors, cancellation, real sync/close, complete snapshot validation and authenticated membership verification remain required before returning a snapshot. Borrowed bytes are wiped in `finally`. Existing `reopen` and GC ownership rules are unchanged.

No schema, portable format, capacity, cross-operation cache, or image-admission change is included. Snapshot APIs still hydrate receipt base64 in memory. For an ordinary changed expense that retains receipts, the two snapshot reads in mutation now perform two file/decode passes per retained receipt instead of four. This is a source-level work reduction, not a peak-memory claim.

## Exact validation

The current source/APK pins, raw sample arrays, runtime fingerprints, commands and log hashes are in [receipt-hydration.json](receipt-hydration.json). Raw logs, frozen source files and both APK pairs are retained locally under `artifacts/offline/receipt-hydration/{before,after}/`. Earlier durable-generation/foundation evidence remains historical and is not relabeled as a run of this source.

Build, assembly, 25 JVM tests and Android lint passed with:

```sh
ANDROID_HOME=/Users/sarathfrancis/Library/Android/sdk apps/android/gradlew -p apps/android -PpennyTestSandbox=true :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug
```

Both API 26 / 4 KiB and API 37 / 16 KiB arm64 emulators passed **17/17** focused groups: `LocalReceiptBlobDeviceTest` (8), `ExpenseMutationDeviceTest` (4), and `VaultGenerationDeviceTest` (5). The new `onePassBorrowedBytesWipeAndFailureNeverDeletesCommittedFiles` verifies one read/callback, wipe after success, consumer exception, cancellation and final-inventory failure, unchanged committed ciphertext, preserved foreign entry, and successful later reopen. Existing tests cover shared receipt malformed fixtures, filesystem ownership, key loss, stale second connections, transaction rollback, migration/replacement recovery, finance/reference constraints and no optimistic UI publication. These are reopened-instance and injected-boundary tests, not new process-death or real full-volume tests. Full UI and physical-device suites were not rerun for this delta.

## Controlled benchmark

One baseline/current set used the same API 37 sandbox, with five samples per path per workload. The baseline retained two-pass production hydration but already contained the corrected benchmark. Each paired path now writes a distinct merchant and asserts revision advanced by one, eliminating the previous second-path no-op confound. The benchmark source SHA is identical in both pinned APK pairs. Revision reads and full snapshot oracle assertions occur outside the timer.

| Workload | Before median | After median | Change |
| --- | ---: | ---: | ---: |
| 10,000 expenses, no receipts | 3,088.13 ms | 3,101.94 ms | +0.45% |
| 10,000 expenses, four 2 MiB receipts | 4,145.73 ms | 3,989.91 ms | -3.76% |

These are `returnedStateMs`: actual `store.save` plus construction of `VaultUiState` from the returned snapshot. Each run also records five alternating samples with additional `all()/attachments()` refresh calls; those replay samples are not historical-source timing and are not the basis of the table. Receipt payloads are valid PNGs with CRC-valid ancillary padding, totaling exactly the current 8 MiB limit. They do not represent high-resolution camera-image decode costs.

The iOS worker held heavy local builds/tests during the complete Android timing window. There was one successful set per source/workload and no timing-driven reruns. The small receipt-free change illustrates emulator/runtime noise; the observed receipt-workload reduction is limited to this debug synthetic workload. No general device-speed, memory, or capacity completion claim follows.

Tests used only `ca.penny.offline.dev.test`, unique owned directories/databases/keys, and cleaned those test resources. Both sandbox processes were force-stopped afterward. The normal development demo was unchanged.
