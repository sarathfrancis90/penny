# iOS verified generation metadata seam

The durable reader now returns an informational `DurableVerifiedMetadata` summary without accumulating receipt attachments/base64. The summary contains vault/snapshot identity, creation time, domain counts, expense total, receipt bytes, exact exportable snapshot bytes and the authenticated native generation wire SHA-256. It exposes no rows, receipt handles or reusable admission capability.

`readVerified` retains strict closed metadata, model/reference/financial validation, receipt count/ownership/byte limits, generation authentication and the existing full native receipt reopen/image/inventory/protection checks. Commit validation before staging/publication and after publication, pending recovery, predecessor checks and conservative GC use this path. The compatibility adapter still hydrates and validates the complete Snapshot once before facade adoption and journal clearing. Source/pointer, writer/revision/restore-epoch, cancellation, rollback and pending recovery checks remain in place. Portable v1–v3 and local persisted bytes are unchanged.

The single combined Debug simulator run passed **45/45, zero skipped**: DurableStorageTests 12, VaultTests 18, LocalReceiptBlobTests 9, ArchiveWorkerTests 4 and the two frozen raw migration FinanceTests. Xcode 26.6 (17F113), iPhone 16e arm64 simulator, iOS 26.4.1 (23E254a), destination `F70A4E8F-78ED-4E96-85E6-0EAEB6D34088`. The simulator is shut down; the normal demo was untouched by this validation.

Four new methods prove:

- Exact `JSONEncoder.withoutEscapingSlashes` size parity for empty, both shared all-domain snapshots, escaped Unicode/slash/quotes/control characters, and two receipts including a JPEG within three bytes of the 2 MiB individual cap. Commit observes precisely `verified → hydrate → journalCleared`.
- Metadata reads, pending current/predecessor recovery and GC succeed while the aggregate hydration callback throws; explicit facade reads invoke that callback.
- Valid AEAD and updated wire hashes do not admit an orphan receipt, missing income source, duplicate budget key or unknown receipt-descriptor field. Failed reads preserve the live encrypted pointer.
- A receipt with valid AEAD and matching descriptor length/hash still fails actual native image decode for the shared invalid-filter PNG. Both metadata and facade reads reject it.

Both unchanged raw migration tests passed on this source, including exact positive restore/reopen without invented income and authenticated invalid-image rejection. Their earlier pre-seam proof remains separate at `artifacts/offline/raw-migration-native/ios-provenance.json`.

Run command (from repository root):

```sh
xcodebuild -project apps/ios/PennyOffline.xcodeproj -scheme PennyOffline \
  -destination 'platform=iOS Simulator,id=F70A4E8F-78ED-4E96-85E6-0EAEB6D34088' \
  -parallel-testing-enabled NO -derivedDataPath apps/ios/.build/generation-metadata/DerivedData \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES test \
  -resultBundlePath apps/ios/.build/generation-metadata/Tests01.xcresult \
  -only-testing:PennyOfflineTests/DurableStorageTests \
  -only-testing:PennyOfflineTests/VaultTests \
  -only-testing:PennyOfflineTests/LocalReceiptBlobTests \
  -only-testing:PennyOfflineTests/ArchiveWorkerTests \
  -only-testing:PennyOfflineTests/FinanceTests/testRawMigrationFixtureRestoresAndReopensWithoutInventingIncome \
  -only-testing:PennyOfflineTests/FinanceTests/testRawMigrationAuthenticatedInvalidImageCannotReplaceVault
```

[Machine-readable evidence](generation-metadata.json) pins all app sources, affected test sources, project inputs, shared fixtures, executable/debug library/test binary and the result log/summary. Runtime source SHA-256: `7dc005b374b028124f693a44646aae2613df2478875c3a5b3277e76bd0005aa8`; test source: `e1cdda0e49da004fe2c7384ab0d11361591a7008949fdea954855c5f0b1715d2`. Raw result: `apps/ios/.build/generation-metadata/Tests01.xcresult`.

This is not a constant-memory or performance result: bounded metadata arrays remain materialized, and the existing native image helper constructs one temporary receipt/base64 during validation. Snapshot inputs and legacy inline archives retain their existing representation. No v4 linkage, new candidate, capacity increase, UI proof, fresh-process replay or physical class-A protection proof is claimed by this run. The simulator uses the explicitly simulated filesystem protection mode; device requirements remain unchanged. Estimated effort was approximately 14k tokens across implementation, tests and evidence, above the 8k soft checkpoint; this is an estimate rather than measured accounting.
