# iOS guarded local candidate installation

The internal synchronous `VaultStore.beginLocalReceiptReplacement` / `installLocalReceiptReplacement` seam now installs a completed raw-receipt candidate through the **same `DurableVaultStorage.publish` helper as existing Snapshot writes**. No UI, cloud, provider or v4 caller is connected. Current capacity, local wire layout and portable v1–v3 behavior are unchanged.

Begin takes only receipt-free typed metadata and declarations. It reads the existing key without provisioning, captures the owning store token and actual root directory FD identity, verifies the current authenticated digest/storeId/writer/revision/restore epoch, and derives revision + 1 and a new restore epoch internally. The caller cannot supply installation source metadata through this entry.

Install rechecks the owner, current in-memory identity, existing key identity, actual directory inode and authenticated durable source under the publication lease. It rereads the key with `false` before publication. Every legitimate owned attempt consumes the candidate, including stale/key/cancel failures. A foreign receiving store rejects without consuming the original owner's candidate. Unbound preparation cannot install.

Publication preserves predecessor/journal handling, full native validation and final one-time Snapshot hydration before adoption. Candidate inode pins and shared receipt locks remain through validation/reopen. Confirmed rollback permits owned candidate cleanup. Success or uncertain publication transfers bytes to repository lifetime before pins close, so later candidate close cannot delete published data. Actual rollback-write failure uses conservative retention but was not injected in this slice.

**Final focused run: 61/61 passed, zero failures/skips** on F70 iPhone 16e arm64, iOS 26.4.1, Xcode 26.6 (17F113), Debug. Groups: candidate 16, durable 12, receipt foundation 9, vault 18, archive worker 4, raw migration 2. These include the existing publication compatibility checks and both unchanged raw migration tests. Normal demo 730A was untouched and remains booted; F70 is shut down.

The three shared installation scenarios now have native evidence:

| Scenario | Runtime proof |
| --- | --- |
| `guarded_install_reopen` | All incoming domain fields, vault/snapshot IDs and original receipts survive install, candidate/preparation close and fresh-store reopen. Both durable and legacy inline source vaults pass. Revision increments, writer remains, restore epoch changes. |
| `candidate_gc_pin_then_stale` | Same-owner or second-instance edit remains authoritative after ordinary GC. Candidate remains readable while pinned, but stale installation rejects and consumes the legitimate attempt. |
| `stale_incarnation` | A newly authenticated source repeats numeric revision under a new incarnation; old candidate rejects. Same-byte root directory replacement also rejects for receipt-bearing and receipt-free targets. |

Additional boundaries exercised:

- Foreign receiver rejection followed by successful installation through the original owner; duplicate installation and unbound installation refusal.
- Injected existing-key lookup failure at begin/install/prepublication, and changed key identity. Provisioning-call count does not increase; live encrypted bytes remain unchanged. Tests inject the reader and do not delete real Keychain entries.
- Ordinary injected errors at staged, rollbackSaved, committed, verified and journalCleared preserve the original live pointer and reopen the predecessor.
- Actual Task cancellation at staged, committed, verified and journalCleared rejects and preserves the predecessor.
- Simulated interruption before publication leaves previous active. At committed/verified/journalCleared it retains complete candidate bytes, and fresh-store recovery opens the replacement. These are checkpoint interruptions, not killed-process or power-loss evidence.
- Receipt ciphertext tampering at staged or committed rejects/rolls back; candidate cleanup preserves current data.

[Machine-readable evidence](candidate-install.json) maps all shared scenarios, records limitations, and pins every app/test source, project, bundled input and executable. The runtime bundle matches shared acceptance revision 2 SHA-256 `a8cb4dd0f9b2c8df095ce64c09e4321a77d144a167a264db99f6cadcad0c9baf` and the unchanged previous/replacement goldens. Final source pins:

- Durable storage: `676efbce8db24487f996acd826bbc7230b4a76f2aa7f571b99537128c5ffcd3f`
- VaultStore: `77de872157b657009207c9e9517a5416a9847d9b08cd47009717a789aa5fcbc1`
- Candidate tests: `0c691ffc4df69860aea5a5904c8d3ae2cc541a554ffbffd57479e73bf8fb23a1`

Raw result: `apps/ios/.build/candidate-install/Tests02.xcresult`; exact source/binary pins: `final-provenance.json` in that directory. The initial 61/61 result and its source copies/hashes remain a separate Tests01 checkpoint preceding the foreign-owner correction.

Reproduce with the existing PennyOffline scheme, F70 destination, serial testing and `apps/ios/.build/candidate-install/DerivedData`; select InactiveGenerationTests, DurableStorageTests, LocalReceiptBlobTests, VaultTests, ArchiveWorkerTests and the two raw migration FinanceTests. The full command appears at the start of `Tests02.log`.

This synchronous internal seam may block its caller. Metadata arrays and final Snapshot hydration remain; no performance or constant-memory claim is made. Provider/session/download binding, v4 FINAL/EOF integration and UI are separate gates. Simulator filesystem protection remains explicitly simulated; no new physical class-A, real disk-full, actual process-death or power-loss proof is claimed. Estimated effort was approximately 20k tokens including design, owner correction, focused tests and evidence, beyond the 12k soft checkpoint; this is not measured accounting.
