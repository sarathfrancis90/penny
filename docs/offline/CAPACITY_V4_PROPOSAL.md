# Capacity and streamed backup v4 proposal

**Proposal only, 2026-09-13. Not frozen, implemented, benchmarked or approved for release.** This document proposes the next bounded native storage/backup slice. The current supported contract remains [BACKUP_CONTRACT.md](BACKUP_CONTRACT.md), with its existing limits and evidence in [PERFORMANCE.md](PERFORMANCE.md). No native source, schema, fixture or legacy contract changes accompany this proposal.

**Follow-up decision:** [CAPACITY_V4_DECISION.md](CAPACITY_V4_DECISION.md) selects libsodium secretstream for the next implementation design. The custom AES-GCM header/key-wrap/chunk sketch below is retained only for comparison and is superseded. Record policies and capacity profiles remain proposals; a replacement wire specification and native interoperability vectors must pass before format freeze.

## Decision and compatibility boundary

Introduce a new binary backup envelope **4**, carrying logical snapshot schema **4**, with streamed records and raw receipt bytes. Envelope versions 2 and 3 remain unassigned; existing snapshots 1–3 all use envelope 1. This explicit numbering avoids silently widening envelope 1. The file extension remains `.pennybackup`; register a binary platform content type separately from legacy JSON.

Keep existing v1/v2/v3 decoders, strict validation, byte limits, upgrades and golden files unchanged. Dispatch by the exact binary magic below; other input goes through the existing bounded JSON reader. A malformed v4 file never falls back to a legacy reader. Unsupported versions fail without mutation. Old applications reject v4; new applications import old files through the old validator, then stream the validated result into the new local candidate. Optional legacy export is allowed only when the entire selected vault satisfies the original contract. Never split, truncate or omit data to make a legacy export succeed.

Backup remains an explicit coherent snapshot/replacement, not sync. Local operation requires neither a provider account nor a model. All existing category strings, integer money, civil dates, recurrence semantics and domain ownership rules remain unchanged.

## Proposed independent bounds

All bounds apply simultaneously. **Recommend profile A as the first measurement target.** Profile B is a future alternative, not a parser allowance to enable now. Product capacity stays at the existing proven level until both implementations pass the selected profile's full maximum. Neither profile is frozen.

| Dimension | A: first measurable profile | B: multi-year candidate |
| --- | ---: | ---: |
| Expenses | 50,000 | 50,000 |
| Receipts | 5,000 | 50,000 |
| Aggregate raw receipt bytes | 512 MiB | 8 GiB |
| All non-receipt logical bytes, including framing | 128 MiB | 256 MiB |
| Complete encrypted file | 768 MiB | 9 GiB |

Both profiles keep these per-item and framing bounds:

| Dimension | Ceiling |
| --- | ---: |
| Individual receipt | 2 MiB, unchanged |
| AEAD plaintext chunk | 1 MiB |
| Chunk count | 16,384, also limited by total bytes |
| Individual JSON record | 64 KiB |
| JSON depth | 32, with existing strict UTF-8/scalar/key rules |
| Image dimensions/pixels/formats | Existing 4,096 / 16,000,000 / static PNG or JPEG |

Retain finance counts: 1,200 budgets; 1,000 income sources; 10,000 income entries; 1,000 savings goals; 10,000 savings entries; 1,000 recurring templates. Retain existing per-value and checked aggregate money bounds: 50,000 maximum-valued expenses must still fail the aggregate bound. This proposal does not add currencies, refunds, longer text, larger images or new finance semantics.

Use checked 64-bit arithmetic for file offsets, lengths, storage reservations and totals on both platforms, and safe integers/BigInt at the reference boundary. Reject unsigned wire values above signed-64 range before conversion, then enforce the much smaller profile bound. Convert to platform buffer sizes only after checking a chunk/record bound. Never trust advertised input lengths or allocate against total size.

Capacity examples are arithmetic estimates, not measurements. A fits roughly 1,310 receipts averaging 400 KiB, or 5,000 receipts averaging at most about 105 KiB; it can establish 50k ledger support without promising a multi-year photo library. B addresses the distinct ambition of a receipt on every expense: 50,000 receipts averaging 150 KiB occupy about 7.15 GiB; seven years at 2,000 receipts/year averaging 400 KiB occupy about 5.34 GiB. Its 9 GiB wire ceiling leaves room above 8 GiB receipts plus 256 MiB metadata and framing, not a requirement to emit padding. B costs much more device disk, test time and provider quota. Neither A nor B fits fifty thousand 2 MiB receipts. Maximal Unicode notes/descriptions can exceed metadata capacity. Show remaining counts **and** bytes; never suggest that the record count guarantees every size combination.

Authenticate `capacityProfile` (`A` or `B`) in BEGIN and the cloud-v2 descriptor. Initially ship only A support after its gates pass; reject B as unsupported before accepting a candidate. This reserves extensibility without silently enlarging accepted input. Standalone input is streamed under the implementation's enabled profile ceiling; BEGIN must occur first and supplies a stricter authenticated bound. The conservative outer 64-bit parser can reject larger lengths without allocating or reading the claimed body.

## Existing format/library assessment

Google Tink Streaming AEAD is the vetted alternative to evaluate before freezing a custom container. Its documented AES-GCM-HKDF construction binds segment position/finality and derives per-stream keys. The official language matrix lacks Streaming AEAD in Objective-C; adopting its Java implementation alone would not supply the matching Apple path. A C++ bridge or an independently reviewed portable dependency needs a scoped interoperability/build/maintenance assessment. [Tink streaming format](https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming), [language matrix](https://developers.google.com/tink/primitives-by-language)

Native UI and on-device AI are user requirements. Platform-only crypto is the current architecture decision, not an independent user prohibition on vetted libraries. Prefer a maintained interoperable library if that assessment demonstrates a safer, supportable result; do not reject it merely because this candidate uses platform APIs. No new cryptographic primitive is proposed here; changing library/KDF architecture requires revisiting this proposal before implementation.

The narrow candidate below uses only existing AES-256-GCM, SHA-256 and platform randomness. It is an application container built from those primitives, **not** Tink-compatible and not entitled to Tink's security claims. It requires independent cryptographic/protocol review and shared negative vectors before freeze. ZIP/tar extraction and compression are unnecessary: PNG/JPEG already encode images, and omitting archive paths removes an extraction attack surface.

CryptoKit exposes per-message GCM sealing/opening with AAD; Android requires unique IVs per key and AAD before ciphertext. Use these public APIs per bounded chunk, without unauthenticated partial plaintext release. [Apple AES.GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm), [Android Cipher](https://developer.android.com/reference/javax/crypto/Cipher)

## Proposed normative wire rules

MUST/REJECT statements below specify the candidate for review; they do not amend the frozen contract yet. All fixed-width unsigned integers are big-endian. SHA-256 values in binary fields are exactly 32 bytes. JSON hashes remain lowercase 64-character hex. Domain labels below end in one zero byte where `\0` is shown.

### Header and key lifecycle

The fixed 94-byte header consists of:

1. Seven ASCII bytes `PNYBKP4` followed by LF (hex `50 4e 59 42 4b 50 34 0a`).
2. `u16 envelopeVersion = 4`, `u64 chunkLimit = 1048576`, 16 random archive-ID bytes, and a fresh 12-byte wrapping nonce. These first 46 bytes are the header prefix.
3. Exactly 32 bytes of encrypted archive key followed by its 16-byte GCM tag.

Generate a new random 32-byte archive data key for every export attempt, independent of the device key and existing `pny1-` recovery key. Wrap only that archive key using the recovery key and AAD `UTF8("PENNY-OFFLINE-BACKUP:4:KEY\0") || headerPrefix`. The fixed version/algorithm has no negotiation or fallback. Reject malformed constants before unwrap; authenticate the complete prefix before accepting the key. Cryptographic review must set the total random-nonce invocation budget across all devices, legacy backups, cloud manifests and wrapping calls under a recovery key; domain-separated AAD does not make reuse of a key/nonce pair safe. Reject broken platform randomness; never use deterministic test keys/nonces outside fixtures.

The archive key exists only in memory during encryption/decryption and in its wrapped header. An encryption retry always starts a fresh key and header. A transport retry may resend exact existing sealed bytes. Never resume encryption at a previous nonce, append to a sealed archive, edit a chunk in place, or produce a second plaintext variant under the same archive key. Secure-buffer cleanup is best effort; no logging or persistence of plaintext keys is allowed.

### Encrypted frames

Each frame is `u64 sequence || u8 final || u64 plaintextLength || ciphertext || tag16`. Sequence starts at zero and increments by exactly one. `final` is 0 or 1. Non-final plaintext length is exactly 1 MiB; final length is 1 through 1 MiB. There is exactly one final frame, last in the file, followed by strict EOF. Reject a missing final frame, extra byte, duplicate/skipped sequence, empty frame or excessive count/size.

Nonce is `00 00 00 00 || u64 sequence` under the fresh archive key. AAD is `UTF8("PENNY-OFFLINE-BACKUP:4:FRAME\0") || SHA256(completeHeader94) || frameHeader17`. Thus header identity, sequence, finality and exact chunk length are authenticated. All 16 tag bytes are mandatory. Authenticate a whole chunk before passing any of its plaintext to the record parser; never treat I/O failure as a clean EOF. Reject the archive on any tag failure and destroy only its isolated candidate.

Readers retain at most a small number of bounded chunks. They may parse/store authenticated chunks into an isolated encrypted candidate, but cannot display a successful restore preview, expose imported records as live, or advance backup status before final-frame, record and completeness validation succeeds.

### Logical records and manifests

Decrypted chunks concatenate into a logical stream. Record framing is `u8 kind || u64 payloadLength || payload`; records may cross chunk boundaries. JSON records have the 64 KiB bound; only receipt-byte records may be larger, up to the unchanged 2 MiB image bound. Parse incrementally with fixed budgets, and enforce aggregate limits while consuming bytes.

Kinds, in required order, are BEGIN=1, budgets=2, incomeSources=3, incomeEntries=4, savingsGoals=5, savingsEntries=6, recurringExpenses=7, expenses=8, receiptDescriptor=9, receiptBytes=10, END=11. Each domain is contiguous, ordered by its canonical lowercase record UUID; no duplicate IDs within a domain. Empty domains emit no record. Receipt descriptor/raw-byte pairs follow all domain records, ordered by receipt UUID. Unknown kinds, unexpected ordering and trailing logical data fail. A receiptBytes record is legal only immediately after its descriptor; it contains exactly the descriptor's declared byte count.

BEGIN is closed JSON with exactly `schemaVersion` (4), `capacityProfile`, `snapshotId`, `vaultId`, `createdAt`, `counts`, `receiptBytes`, `nonReceiptBytes`. Identity/date rules are inherited. `counts` contains exactly the seven domain names above plus `attachments`, each a bounded integer. `nonReceiptBytes` counts every logical byte strictly between BEGIN and END except raw image payloads, including the nine-byte framing of raw receipt records; both manifest records are excluded to avoid a self-referential size. Exporters calculate these values against a pinned coherent generation; readers independently reconcile them.

Domain record payloads have exactly the existing schema-3 domain object's fields and validation. Receipt descriptors have exactly `id`, `expenseId`, `mediaType`, `byteCount`, `sha256`: existing attachment validation minus `dataBase64`. No external URL, path, filename or unknown member is accepted. The following raw receipt payload is bound to this descriptor by authenticated ordering; compare its length and SHA-256, require its owner in this snapshot, then perform the existing bounded full native image validation. Missing/invalid receipts fail the whole import. Never decode every image concurrently.

END is closed JSON with exactly `snapshotId`, `counts`, `receiptBytes`, `nonReceiptBytes`, `recordCount`, `streamSha256`. Its counts/identity match BEGIN and independently observed values. `recordCount` counts every record before END including BEGIN; `streamSha256` hashes the exact framed logical bytes before END. END must terminate the final frame's plaintext. Include both BEGIN and END framing/payload in the profile's independent aggregate non-receipt policy check, although they are excluded from declared `nonReceiptBytes`. The authenticated footer plus exact EOF proves completeness; digest comparison is additional consistency, not a substitute for GCM.

Validate cross-domain references, recurrence occurrence uniqueness, budget uniqueness and checked financial totals before candidate admission. Use candidate-database constraints/indexes or bounded ID indexes; do not rehydrate a full snapshot with embedded receipts to reuse a validator. Preserve JSON Unicode values exactly; whitespace/key order need not be canonical within a record because exact bytes are authenticated.

## Local storage and atomic recovery prerequisite

Both native storage designs must separate bounded record access from receipt bytes. Use encrypted metadata/rows and opaque immutable encrypted receipt objects; never add plaintext merchant/note indexes. A paged UI and incremental edit/report path must avoid reconstructing every record or receipt. Existing whole-snapshot models remain legacy adapters only.

Export pins a coherent generation/revision/incarnation and streams it without copying live SQLite/WAL files or observing a changing receipt directory. Writes may continue against a new revision; committed edits after the pin remain pending backup. Pins have bounded lifetime and prevent garbage collection of referenced blobs.

Restore writes an isolated candidate generation, re-encrypted under the receiving device key. Flush/sync and reopen/authenticate its metadata and receipt objects before preview. The preview token binds the input file digest, candidate ID, snapshot/vault identity, live revision/incarnation, recovery-key epoch and provider/session/operation identity when applicable. External picker files must be copied as ciphertext into owned protected storage or pinned through an equivalent immutable verified handle; never reread a mutable provider path as if it were the previewed file.

On explicit replacement, acquire the native commit lease and recheck all bindings. Atomically change the active encrypted generation pointer/SQLite transaction only after the replacement is durable. Keep the previous generation until successful reopen; never delete the live generation first. The pointer/commit marker must itself be authenticated, durable and crash-consistent. On restart, resolve only committed markers; uncommitted candidates cannot become active. Restore advances the local incarnation and leaves automatic backup stopped until the existing binding ceremony is satisfied.

Preflight actual available space for encrypted input + candidate data/indexes + transaction/rollback overhead + safety reserve, while retaining the existing live vault. Recheck during writes and handle ENOSPC. A full 8 GiB import can need roughly 16 GiB additional staging space before overhead if both incoming ciphertext and the re-encrypted candidate coexist; provider caches can add more. This is an estimate, not a fixed 2× promise. No plaintext temporary receipt or archive is permitted. Failed/cancelled work cleans only owned candidates, never the last-good generation.

## Cloud and file API changes

Keep cloud-manifest v1 unchanged. Add a separately versioned cloud-manifest **2**, with new AAD `PENNY-OFFLINE-CLOUD-MANIFEST:2`, retaining the closed envelope and 8 KiB/12 KiB manifest limits, identity tags and publication rules. Its snapshot descriptor permits exactly envelope4/schema4, adds `capacityProfile`, and uses a checked 64-bit `byteCount` within that enabled profile's wire ceiling. Descriptor/BEGIN profiles must match. All other current manifest fields remain unchanged. A combined discovery layer validates v1/v2 independently before presenting a candidate.

Keep one immutable encrypted snapshot object plus one immutable manifest for the first v4 transport slice. Provider segmentation is deferred because it changes manifest ownership, inventory, retry and retention semantics. Do not assume historical CloudKit Web Services size limits define native CKAsset limits; verify current native limits and large-asset behavior during provider implementation. A successful SDK call still requires an independently fetched, fully authenticated stream before publishing/verifying the manifest.

Replace `Data`/`ByteArray` upload/download and equality APIs with owned sealed-file handles, checked 64-bit counts, streaming SHA-256, full streamed authentication and explicit cleanup ownership. Android's resumable session uploads must stream exact sealed bytes with verified offsets; resumed sessions bind account/operation/object/digest and cannot create new plaintext encryption. iOS must account for SDK asset download/cache disk allocation that happens before app parsing.

Preserve account identity, key, epoch, cancellation, revision/incarnation and operation guards before/after every provider suspension, including streaming callbacks. Last-good advances only after snapshot and manifest remote verification. Existing 1,000-object/100-manifest discovery bounds and no-deletion policy remain. Large full backups multiply quota use; seven 8 GiB generations alone need about 56 GiB. Do not promise retention fits or prune automatically.

Current Android eight-minute worker and ten-minute publication expiry are incompatible with guaranteed multi-GiB completion. Initially gate large v4 export/restore to an explicit foreground operation with progress and cancellation. Automatic v4 transfer remains disabled above its independently tested size until durable ciphertext-resume/session-expiry behavior exists; local operation remains available. Merely extending a timeout is insufficient.

## Exact implementation surface

| Area | Proposed files and API change |
| --- | --- |
| Shared reference | Add `packages/offline-contract/backup-v4.mjs`, `backup-v4.schema.json` (logical JSON records only), `backup-v4.test.mjs`, generator and `fixtures/v4/`; expose async `sealV4(source, sink, key)` and `verifyV4(source, candidateSink, key)`. Keep `contract.mjs`, existing schemas/vectors and legacy entry points behavior unchanged. |
| Cloud reference | Add `cloud-manifest-v2.mjs` and v2 fixtures/tests; adapt publication orchestration to version-dispatched verified-file descriptors. Keep v1 validation exact. |
| iOS | Add `BackupArchiveV4.swift`; adapt `ArchiveWorker.swift`, `RecoveryExport.swift`, `VaultStore.swift`, `PreparedVaultWrite.swift`, `ReceiptAttachment.swift`, `FinanceStore.swift`, `CloudManifest.swift`, `CloudPublication.swift`, `CloudKitTransport.swift`, `AutomaticBackup.swift`. Replace `PreparedArchive(bytes,snapshot)` with owned sealed URL/count/digest/verified summary and generation pin; retain `BackupArchive.swift` legacy reader. |
| Android | Add `BackupV4.kt`; adapt `VaultStore.kt`, `Attachment.kt`, `BackupExporter.kt`, `CloudContract.kt`, `CloudCoordinator.kt`, `CloudPublication.kt`, `DriveTransport.kt`, `DriveController.kt`, `AutomaticBackup.kt`. Replace whole `Snapshot`/`ByteArray` transport boundaries with cursor/blob sources, owned files and `Long` counts; retain `Backup.kt` legacy reader. |
| UI and evidence | Adapt both vault/capacity screens, paged expense/finance views, worker status and cancellation. Add native v4 fixture, interruption, performance and opposite-platform runtime tests; update offline docs only after verified changes. Root integration owns any generated agent-doc refresh. |

## Attack and failure matrix

Shared vectors must include wrong keys; every header/frame/tag mutation; unsupported versions; cross-archive frame/header splicing; duplicate/reordered/skipped frames; final-bit edits; truncation at every structural boundary; missing/duplicate END; appended bytes; length overflow; excessive chunks/records; broken UTF-8/scalars/duplicate escaped JSON keys; duplicate IDs and recurrence occurrences; invalid totals; missing receipt owner; descriptor/raw-byte swaps; digest/length mismatch; invalid PNG/JPEG/animation/dimensions; exact-limit and one-over inputs. Zero accepted partial restores is the correctness gate.

Native fault injection must cover every durable write/flush/rename/pointer stage; crash before/after commit; low disk; key loss; second database connection edits; preview file replacement; cancellation; logout and switch-away-and-back at every network suspension; stale retry/session callback; provider truncation/oversize; and failed readback. Reopen must produce exactly the old or fully verified new ledger, with all receipts and finance records, never a hybrid. Confirm receipts staged before a later bad frame never become live. Capture native opposite-platform exports rather than only opening Node-generated vectors.

## Staged implementation and provisional measured gates

1. Freeze this proposal only after independent native/protocol review, byte-exact public vectors, parser differential tests and an explicit decision on Tink versus this limited container. No capacity increase at this stage.
2. Implement bounded native storage/cursor/candidate APIs with unchanged product caps. Prove crash/rollback, migration idempotence and byte-for-byte v1–v3 recovery. Migrate locally without deleting the old generation before reopen.
3. Implement profile A v4 manual export/restore on both platforms. Test 1k/10k/50k ledgers; 100/1,000/5,000 receipts; realistic mixed JPEG/PNG content; 256 MiB and full 512 MiB receipt corpora; maximal accepted metadata; 2 MiB/16 MP individual images; cancellation and low storage. Test count and byte maxima independently, plus a combined accepted workload. Profile B requires an additional separate matrix at 50,000 receipts, 1 GiB and full 8 GiB, and 256 MiB metadata before any B reader/writer is enabled.
4. Raise supported capacity only for both-platform passing tiers. Add cloud-manifest v2 and provider streaming, then real-account upload/fetch/clean-device restore and guarded resume. Enable large automatic backup only after its separate scheduling/quota/device gate.

Existing measurements establish only 10k and an 8 MiB receipt sample: iOS simulator cold open 170 ms/save 92 ms; Android API37 emulator edit plus refresh about 2.23 seconds. Neither predicts physical 50k latency or multi-GiB memory. Reference those scoped measurements in [PERFORMANCE.md](PERFORMANCE.md), not extrapolated pass claims.

The resource gate is part of acceptance. Generate deterministic synthetic corpora incrementally on the runner/device; commit seeds, small vectors and corpus digests rather than GiB binary fixtures. For A, provision at least 4 GiB free guest space above the installed app/live baseline, then measure actual encrypted input/candidate/rollback/SQLite growth and increase that reservation if needed. Run the full 512 MiB and 5,000-receipt boundaries on the minimum API 26 emulator and the current target, with an explicit guest RAM limit and recorded memory pressure. Use separate performance and UI jobs so OCR/UI allocations are attributable. Host free space must also cover emulator images, build products and artifacts; check before execution and report resource insufficiency as an unpassed gate.

For B, provision a dedicated large-disk job with at least 32 GiB free guest staging space above live data and separately verified host capacity; 64 GiB host headroom is a starting reservation, not a measured sufficiency claim. Run a full non-sparse 8 GiB encrypted roundtrip and adversarial interruption on API 26 and each native minimum supported physical class. Sparse files, mocked length counters and repeated one-chunk tests prove arithmetic/parser behavior only; they cannot substitute for accepted-maximum disk, image-decode, memory and runtime evidence. If this matrix cannot finish within practical CI/device resources, keep B unsupported and deliver only the proven A tier. Collect compact metrics/hashes rather than uploading synthetic full archives; never lower gate coverage while claiming B capacity.

Provisional targets on each lowest supported physical-phone class, Release build: 50k first interactive page within 2 seconds; ordinary one-record save/search/monthly report p95 below 150 ms; no app-main-thread stall above 50 ms during backup; cancellation acknowledged within 1 second outside bounded OS calls. Profile true peak memory, not operation-boundary samples: aim for incremental backup memory below 32 MiB excluding one bounded image decode, and total peak below 256 MiB; tune only with disclosed device evidence. Crypto buffers must stay constant with archive size. Measure image validation separately because a 16 MP decode alone can occupy about 64 MiB.

For bulk export/full authenticated restore, report bytes/second, image-validation time, at-rest/staging bytes, energy and thermal state. Initial sustained local streaming target is at least 20 MiB/s excluding image decode; 8 GiB at that rate is about 410 seconds **per pass**, so verification/readback/restore may take several passes and substantially longer. Network completion is separately measured, never inferred from local throughput. Use at least five repetitions with median/range; collect enough ordinary-operation samples (at least 100) for meaningful p95. Record cold/warm state, hardware/OS, source commit, corpus digest, instrumentation and pass/fail thresholds. Simulators/emulators and host reference tests cannot close physical-device gates.
