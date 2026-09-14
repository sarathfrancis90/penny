# Android internal v4 export evidence

Current-source API26 and API37/16KiB each pass **21/21**, no skips: writer6, two-pass restore7, verified metadata4, app reader4. JVM25, assemble app/test and lint pass. Exact runtime/source/APK/command/log hashes are in `v4-export.json`; immutable outputs are under `artifacts/offline/v4-export-android/validation-01`.

`VaultStore.exportV4` uses authenticated `VaultGenerations.withVerifiedExportSource`. This worker-only callback holds the existing DB lock and transaction through encryption, so ordinary writes wait. It checks existing device key, active identity and namespace before returning, never provisions a key, and preserves the original Snapshot facade. Receipt-free typed expense/finance arrays are still retained at existing limits. It does not call SnapshotHydration or assemble receipt base64.

`V4Export` sorts all domains/IDs and receipt descriptors, uses the same bounded JSON encoder for prepass/emission, checks record and exact metadata/body/wire sizes, writes BEGIN/body/END with checked counters and transcript, and feeds one owned raw receipt at a time into the existing FrameCodec. Borrowed receipt callback bytes are never retained. Full receipt authentication/native decode and source group release must succeed. No crypto source fork or new primitive was added.

`OwnedV4Output` exclusively creates ciphertext in the app-private child `no_backup/v4-ciphertext-v1`. Both input/output verify this child as0700; Android's parent permissions remain unchanged. Real file fsync, close and parent fsync precede native readback. The actual app reader checks full native images, logical transcript, FINAL/EOF and exact output SHA/count. Expected summary equality and close/cancellation checks precede the opaque file handle. Closing cleans only its recorded ciphertext inode. `copyTo` verifies the encrypted source; destination readback/publication is outside this API.

| Writer test | Executed boundary |
|---|---|
| actualPlatformContextUsesPrivateCiphertextChild | Actual targetContext export and restore, parent mode unchanged, private child0700 |
| financeReceiptsEscapingExportReadbackInstallAndReopen | All8domain data, IDs and exact receipt bytes; quotes/backslash/newline/tab/café/emoji; no export hydration; exact native readback/install/new-instance reopen; artifact SHA/length |
| cancellationStageErrorsPartialWriteAndReadbackTamperCleanOwnedOnly | All9 checkpoints; cancellation; error after ciphertext bytes reached file; injected after successful real sync/close; same-inode ciphertext tamper; recursive cleanup and unchanged sibling |
| missingKeyAtCaptureOrLeaseReleaseNeverProvisionsOrReturnsOutput | Actual Keystore key deletion before and during source lease, unchanged active metadata, no replacement key or output |
| sourceLeaseBlocksOrdinaryWriteAndRejectsReentrantMutation | Second-connection thread waits during lease and edits afterward; file retains prior checkpoint; nested same-thread mutation rejects/rolls back |
| multiFrameMetadataAndCurrentSourceCapacityRemainBounded | >1MiB metadata with600expenses; exact roundtrip; common metadata ceiling15,727,872 accepts/+1 rejects; existing store rejects10001expenses |

Existing metadata regression groups additionally check authenticated semantic/membership/key/native-invalid-image failures. Restore groups retain wrong-key/truncation/trailing/FINAL/native-image/capacity/target/cancellation/ciphertext-substitution coverage, now using private-child paths and recursive cleanup assertions. Prior25-test source evidence is historical and unchanged.

Public07 writer outputs in `api37-export/` and `api26-export/` include ciphertext, exact expected schema3 snapshot and key/hash manifest for opposite-native import. Own-platform roundtrip is complete; opposite-native runtime proof is reported separately. Tests use only sandbox `ca.penny.offline.dev.test`; normal demo unchanged.

Limits: no UI/provider/new capacity; no constant-memory/performance claim; no new cross-process GC exclusion proof; no physical disk-full/power-loss or actual OS close-failure injection; no process-kill reopen. Failure checkpoints after successful syscalls are labeled as such. Path/inode checks cover tested substitution points, not an arbitrary concurrent same-UID adversary guarantee. A completed encrypted handle is not cloud destination completion.

## Additive opposite-native and Files overlay

`v4-export-interchange.json` records a separate **4/4 per API26/API37** invocation: the required shared Swift-writer ciphertext is authenticated, prepared without aggregate receipt hydration, installed and reopened through a fresh Android store with all8domains/IDs/raw receipts equal; three final Files controller tests also pass. The final test APK contains hash-identical shared native fixtures. The production app APK is byte-identical to the21-test base. This is an additive test overlay, not a claimed25-test rerun. Actual iOS import of the Android ciphertext is recorded by the iOS worker's evidence.
