# Penny Offline local vault and backup contract

Status: envelope format 1 with snapshot schemas 1, 2 and 3, 2026-09-13. The portable format, native runtime captures, fixture corpus and executable reference exist under `packages/offline-contract`. Native expense/receipt persistence passed its local slice; finance schema 3 and migration adapters are implemented and undergoing final native validation. Automatic cloud transport, real-device recovery and complete migration remain open. This document specifies intended release behavior; current evidence is in [STATUS.md](STATUS.md).

## Product boundary

Creating, editing, searching, calculating, and deleting personal financial data must work after a fresh install without creating a Penny account or enabling cloud backup. Local storage is authoritative. Optional iCloud or Google Drive holds encrypted backup snapshots. Restoring a snapshot is an explicit replacement operation, not ongoing synchronization; multiple devices never silently merge or overwrite each other's live databases.

The new native applications have separate local contracts from the existing Flutter/API product. No existing Firestore types, API routes, exact category strings, or user data are rewritten by this foundation. Future imported records are mapped through a versioned migration adapter. Source inspection takes precedence over older hybrid-Firestore documentation: active legacy providers use the standalone API, and an encrypted local shadow does not establish local authority.

## Local storage and key ownership

Generate an independent random 256-bit device vault key with the platform CSPRNG. Encrypt persisted sensitive records and attachment bytes with authenticated encryption. SQLite is acceptable for scalable query/index/transaction behavior only with encrypted sensitive pages or payloads; a plaintext index containing merchants or notes defeats encrypted payload storage. All temporary, rollback, log, thumbnail, and OCR files need the same protection. Pure encrypted atomic-file storage is acceptable for the bounded first slice; production scale must be benchmarked before keeping it as the full ledger implementation.

On iOS, keep the foreground vault key in Keychain using `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, a stable app-specific service, and no synchronization attribute. This accessibility class does not migrate to a different device. Store vault files in Application Support with complete file protection and exclude the vault, encrypted rollback generations, caches, and device-key-dependent state from automatic OS backup. A device-only Keychain key is not a general-purpose Secure Enclave AES key; do not claim that distinction away. [Apple Keychain accessibility](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)

On Android, use Android Keystore to generate a non-exportable AES-GCM key, inspect the achieved hardware security level, and avoid claiming StrongBox availability on every device. Put sensitive vault state under app-private storage. Explicitly exclude vault state from both cloud Auto Backup and device-to-device transfer using old and Android 12+ extraction rules; `allowBackup=false` alone is insufficient on some manufacturers' transfer implementations. Losing the key must produce a recoverable locked/error screen, never silently create a new empty vault. [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [Android backup rules](https://developer.android.com/identity/data/autobackup)

Android 16 QPR2 also defines a separate cross-platform transfer mode. Omitted transfer sections enable that mode for ordinary app files; use `noBackupFilesDir` for device-key-dependent vault files and cover supported transfer modes explicitly. [Android extraction rules](https://developer.android.com/identity/data/autobackup)

Store the backup recovery key separately from the local vault key. It may be retained only under local device-key protection for subsequent automatic backups. Neither key belongs in telemetry, console logs, crash reports, analytics, clipboard by default, backup metadata, environment files, or source control. The public deterministic keys under `fixtures/` are test data only. A device without a secure lock remains a supported implementation decision to resolve before release; do not silently downgrade a biometric promise.

## Expense snapshot v1

`snapshot.schema.json` and `categories.json` define exact fields. Both apps must consume the same fixture corpus. v1 supports CAD expense entries only; it does not claim legacy domain parity.

| Field | Wire value and validation |
| --- | --- |
| `schemaVersion` | Integer `1`; reject unsupported versions without altering the vault. |
| `snapshotId`, `vaultId` | Lowercase hyphenated UUID strings; generate random UUIDs. Snapshot ID is unique for each backup. Vault ID identifies the logical ledger, not a cloud account. |
| `createdAt` | Exact UTC `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`, valid Gregorian date/time and strict roundtrip. |
| `expenses` | At most 10,000 complete expense objects; duplicate IDs are rejected. |
| `attachments` | Empty array in v1; nonempty arrays are refused to prevent silently losing receipts. |

Each expense has exactly `id`, `merchant`, `amountMinor`, `currencyCode`, `expenseDate`, `category`, `note`, `createdAt`, and `updatedAt`. No API identity, cloud URL, group role, synchronization metadata, or pending AI action is carried in this format.

| Expense value | Rule |
| --- | --- |
| `id` | Lowercase hyphenated UUID, unique within the snapshot. Normalize generated native UUID output to lowercase; reject noncanonical imported values. |
| `merchant` | Trim before creating a record; imported values must already be trimmed. 1–200 Unicode code points. |
| `amountMinor` | Integer cents, 1 through 99,999,999,999. Never persist binary floating-point money. Max snapshot sum is 999,999,999,999,999 with checked arithmetic. |
| `currencyCode` | Exactly `CAD` in this initial format. No FX conversions or mixed-currency totals. |
| `expenseDate` | Exact `YYYY-MM-DD` civil date, years 0001–9999, Gregorian-valid. Never timezone-convert it. |
| `category` | One of the 38 exact strings in `packages/shared/src/categories.ts`, mirrored in the fixture. Unknown import categories require review, not silent remapping. |
| `note` | String, up to 4,000 Unicode code points; may be empty. |
| `createdAt`, `updatedAt` | Exact UTC millisecond timestamp; `updatedAt >= createdAt`. Clock anomalies become explicit validation errors. |

UI money input can be localized before conversion, but the reference decimal parser accepts only unsigned decimal digits and an optional period with one or two digits. It rejects exponent notation, grouping separators, rounding, negative values, and zero. Refunds need a deliberate future contract change. Calendar dates must roundtrip exactly, including leap days; platform lenient parsers must not normalize impossible dates into valid ones.

Unknown object members, duplicate JSON members including escaped-equivalent names, invalid UTF-8, invalid base64, unsupported versions, excessive nesting, or excessive byte size are rejected. The Node reference implements strict duplicate-member parsing. Native implementations must either match it or explicitly report the remaining conformance gap; schemas alone do not enforce semantic validation.

## Portable encrypted backup v1

File extension: `.pennybackup`. Content type: `application/json` until a registered/custom platform UTType is configured. Object key ordering and whitespace are not canonical requirements. Encrypt the exact UTF-8 bytes emitted by the writer and authenticate/decrypt those same bytes on the reader. No reserialization occurs before authentication.

```json
{
  "formatVersion": 1,
  "algorithm": "AES-256-GCM",
  "nonce": "<12 bytes, padded standard base64>",
  "ciphertext": "<encrypted UTF-8 snapshot, padded standard base64>",
  "tag": "<16 bytes, padded standard base64>"
}
```

Use platform AES-256-GCM with a fresh random 12-byte nonce for every seal and a 16-byte authentication tag. AAD is exactly UTF-8 `PENNY-OFFLINE-BACKUP:1`. Both version and algorithm are fixed by validation. Use CryptoKit on iOS and `AES/GCM/NoPadding` with a 128-bit tag on Android. Java appends tag bytes to encrypted output; split/join them at the final 16 bytes for this wire format. CryptoKit's `combined` form includes the nonce; do not place the complete combined bytes inside `ciphertext`.

The recovery key is 32 random bytes represented as `pny1-` followed by exactly 64 lowercase hexadecimal digits. Trim surrounding whitespace only. It is directly the AES key; no user-selected password, password-derived key, or custom cipher is involved. Future friendlier encoding requires a versioned format; QR presentation can carry the exact current string. This key unlocks every backup created with it, so an encrypted backup and the recovery key should not be stored together. Rotating the key protects future backups; old copies retain the old key.

Both limits apply independently: encoded envelope at most 20 MiB and decrypted snapshot at most 15 MiB, including all data and JSON syntax. For every new local save or export, writers additionally require `4 * ceil(snapshotUTF8Bytes / 3) + 1024 <= 20 MiB`, reserving 1,024 bytes for envelope syntax and metadata. Serialize base64 without escaped slashes. This common conservative export predicate prevents accepting a local vault that cannot be exported; readers retain the original bounds for backward compatibility. Encoders also check the actual serialized envelope size. Read from external providers in bounded chunks and refuse oversized input before loading it wholly into memory. No compression, archive extraction, arbitrary filenames, or receipt URL fetching is permitted. Authentication failures never expose partially decrypted content.

Backup IDs, counts, amounts, merchants, file names, and receipts remain inside encrypted content. Cloud object names use opaque random IDs. Encryption does not hide file size, backup frequency, or provider account metadata.

## Recovery and restore UX

1. Enable backup only after explaining that the recovery key is required after device loss and cannot be reset by Penny. Let the user defer backup and continue local use.
2. Show the key on a dedicated privacy screen and let the user explicitly copy/save it in a password manager or private offline location. Do not upload the key beside the backup. Request a key re-entry or equivalent verification before displaying recovery as configured.
3. Prepare an encrypted backup in local protected storage. Complete encryption, flush, reopen, and verify the backup before offering export or cloud upload. Provider dismissal/cancellation is not success.
4. For restore, authenticate, decrypt, and validate into an isolated candidate. Show creation date, record count, total, and that current data will be replaced. This preflight must not mutate the current ledger or turn on background backup.
5. After explicit replacement confirmation, freeze ledger writes. Recheck candidate identity and current vault revision, stage an encrypted replacement under the current device key, verify it, then commit through one SQLite transaction or an atomic generation/pointer replacement. Never delete the live vault before replacement succeeds.
6. Keep one encrypted local rollback generation until the new state has been reopened and verified. On cancellation, low storage, failure, process death, key failure, or validation error, the previous generation must remain available. Re-encrypt imported data under the receiving device's independent local key.
7. After restoring an older snapshot, warn before future backups replace newer history. Do not automatically prune provider backups based on untrusted remote timestamps or just because an old backup was selected.

The Node tests exercise preflight purity and cryptographic validation. They do not demonstrate native atomic file replacement, SQLite rollback, disk-full recovery, Keychain/Keystore failure behavior, interruption durability, or user confirmation flows. These require native fault injection and device tests.

## Expense and receipt snapshot v2

P2 freezes schema version 2 in `snapshot-v2.schema.json`. The envelope format, AAD and original read limits remain version 1. Top-level fields and expense fields remain unchanged, except `schemaVersion` is `2` and `attachments` contains complete embedded receipts. A version 1 reader rejects version 2. New readers validate version 1 exactly, including its empty attachments and closed field set, before changing only `schemaVersion` to 2. They preserve expense IDs, money, text, timestamps, snapshot/vault identity and every other represented field. They never interpret a legacy receipt URL as saved bytes or drop unknown fields during upgrade.

Each attachment has exactly these fields; all are inside AES-GCM authenticated ciphertext:

| Field | Rule |
| --- | --- |
| `id` | Canonical lowercase UUID, unique among attachments. Never a path or filename. |
| `expenseId` | Canonical lowercase UUID naming exactly one existing expense in this snapshot. Multiple attachments may belong to one expense. |
| `mediaType` | Exactly `image/png` or `image/jpeg`; static images only. Reject APNG and other media rather than silently converting imported backups. |
| `byteCount` | Integer decoded byte count, 1 through 2,097,152 (2 MiB), matching actual bytes. |
| `sha256` | Exactly 64 lowercase hexadecimal digits, SHA-256 of the exact decoded image bytes. |
| `dataBase64` | Canonical padded standard base64 of complete image bytes. No whitespace, URL, provider reference or external filename. |

At most 100 attachments and 8,388,608 decoded attachment bytes (8 MiB) fit one snapshot, independently of expense and encoded snapshot limits. Enforce the encoded string bound before decoding. Require each image's width and height from 1 through 4,096 and at most 16,000,000 pixels before allocating a full decoded image. PNG must have its eight-byte signature and first 13-byte IHDR. Walk PNG chunks with overflow/remaining-byte bounds, require image data and a final zero-length IEND, and reject any `acTL` animation control chunk, even when only one animation frame exists. JPEG must start `FF D8 FF`, end `FF D9`, and supply valid frame dimensions. Native apps additionally require successful bounded full image decoding; matching a digest or media signature alone does not establish an image is decodable. The dependency-free Node reference checks signatures, PNG chunk boundaries and dimensions, not complete PNG/JPEG decoding, and is not sufficient image admission evidence by itself.

Reject unknown fields (including `path`, `filename`, or `url`), duplicate attachment IDs, missing owners, byte/digest mismatches, invalid images, unsupported versions or exceeded limits before changing any active state. Duplicate JSON members also fail strict parsing. There are no extraction paths or filesystem references to follow, so traversal strings cannot redirect writes. Do not recover from a missing or invalid receipt by silently dropping it. An expense and its new receipt commit atomically; removing an expense removes its owned attachments in the same commit. Cancelled drafts do not become saved receipts.

The first implementation embeds bytes to make expense/receipt persistence and portable restore one atomic encrypted operation. iOS may atomically replace its encrypted snapshot; Android may commit encrypted records and receipt rows in one SQLite transaction. All successful exports enumerate every saved receipt. Failure during save or restore preserves the old complete ledger and receipts. Never copy a live SQLite database/WAL or independently changing receipt folder. Thumbnails and caches must remain protected and cannot become unencrypted backups.

These conservative bounds are a development capacity gate, not approval for a large production receipt library. Inline base64 adds memory and rewrite costs. Before substantial receipt collections, measure native open/save/export/restore peak memory and latency and design a separately versioned streaming encrypted-blob format with authenticated ownership, bounded staging, unique nonces and rollback-safe generations. Do not silently raise or reinterpret version 1 envelope limits.

Shared v2 fixtures include a decoder-valid synthetic PNG, complete snapshot and deterministic encrypted archive, plus mutation and capacity cases. Native tests must prove failed validation and interrupted replacement preserve the old vault; reference vectors alone do not prove disk durability. Version 2 alone cannot represent budgets, income, savings or other unrepresented legacy fields. Expense-and-receipt backup is not full legacy-domain parity.

## Finance snapshot v3

`snapshot-v3.schema.json` and [FINANCE_CONTRACT.md](FINANCE_CONTRACT.md) define the complete closed field sets, bounds and calculations. Version 3 keeps every expense and receipt field and adds separate expense descriptions and recurrence identity, plus budgets, income sources, explicit received payments, savings goals and contributions, and recurring expense templates. These arrays are all part of the same authenticated snapshot and atomic native replacement. There is no separate unprotected finance database or optional unverified sidecar.

Strictly validate older snapshots before upcasting. Add only the defined empty finance arrays and expense defaults. Decode and preserve original Unicode string values and receipt bytes; do not use a normalizing or lossy intermediary JSON serialization during upgrade. Unsupported fields, duplicate occurrences, broken references and aggregate overflow prevent restore. Scheduled income, planned contributions and unposted expenses never become actual cash by restoration or background calculation.

All prior envelope, receipt and total byte limits continue to apply. A new native save must remain exportable, including its finance fields. Captured iOS and Android runtime archives in `fixtures/native-exports/` carry public synthetic records and recorded digests. Mandatory native tests consume the opposite platform's archives, and the Node reference verifies every domain by record ID. Array order is not ledger identity. These fixtures establish format interoperability; they do not establish live cloud transport or real-device recovery.

The legacy preflight in [MIGRATION.md](MIGRATION.md) maps representable schema 3 fields and retains a separate local provenance report. Incomplete savings history, conflicting cached balances, unknown fields and unsupported source records are quarantined. A readable source/provenance report is not part of the encrypted native backup and must remain protected by the person performing migration.

## Optional cloud transports

| Transport | Implementation and authorization | Evidence needed before marking complete |
| --- | --- | --- |
| Manual encrypted export/import | Native document export/picker lets users choose Files/iCloud Drive on iOS or a Storage Access Framework provider on Android. A chosen provider may be local or remote. | Actual import roundtrip from a second native app; provider cancellation and unavailable-file behavior. Saving through a picker is not automatic cloud backup. |
| Automatic iCloud backup | Dedicated provisioned iCloud document container. Coordinate file access with `NSFileCoordinator`/`UIDocument`, discover with metadata query, resolve downloaded state, and observe upload completion. Local vault remains outside the container. | Signed Apple ID device test, unavailable iCloud account, revoked/changed account, quota, background scheduling, upload/download integrity and second-device recovery. |
| Automatic Google Drive backup | Drive v3 `appDataFolder` using the optional `drive.appdata` scope, acquired through Android authorization APIs when backup is enabled. Store opaque immutable encrypted files. Use explicit provider account selection, resumable upload and full listing pagination. | Configured OAuth consent + package/signing registration, user authorization, revocation/quota/retry tests, clean-device restore and wrong-account handling. |

Google documents `drive.appdata` as non-sensitive. Its hidden folder is app-specific and separate from Drive's reserved device-backup folder, cannot be shared or trashed, and may be deleted by the user. Therefore retention uses permanent file deletion only after a newer backup is verified and a conservative retention plan has been previewed. [Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata)

Google authorization is separate from authentication for app usage. Request only backup scope on the backup action; denied or expired authorization leaves local finance functions working. Access tokens stay in the platform credential path and never in exported snapshots. [Google AuthorizationClient](https://developers.google.com/android/reference/com/google/android/gms/auth/api/identity/AuthorizationClient)

Apple's document synchronization APIs are transport mechanics. Penny's immutable encrypted snapshots retain explicit restore semantics even though iCloud transfers those files across devices. A successful local write is not a verified uploaded backup. Official current synchronization documentation and the archived design guide explain coordination and document discovery. [Apple document synchronization](https://developer.apple.com/documentation/uikit/synchronizing-documents-in-the-icloud-environment), [Apple iCloud document design](https://developer.apple.com/library/archive/documentation/General/Conceptual/iCloudDesignGuide/Chapters/DesigningForDocumentsIniCloud.html)

CloudKit record synchronization is not required for this product boundary. iCloud backup is Apple ecosystem-specific; Drive on Android does not automatically restore an iCloud backup. The portable encrypted file plus recovery key provides manual cross-platform transfer. Neither cloud transport has been authenticated or exercised by the shared contract work.

Choose a conservative default of the most recent seven verified backups per vault, with additional retention of the last pre-migration backup and the last manually protected backup. This is an intended default, not active deletion code. Always upload under a new random object ID, verify remote bytes by authenticated roundtrip/download before recording a verified backup, and prune only after success. Keep statuses distinct: prepared locally, queued, uploaded, verified, failed. Background scheduling is opportunistic, so show the last verified timestamp and never promise an exact daily completion time.

Detailed publication, account-binding and failure requirements are in [CLOUD_BACKUP.md](CLOUD_BACKUP.md). A future authenticated manifest requires its own versioned context and vectors; no current snapshot validator accepts arbitrary manifest data.

## Legacy migration and release gates

Legacy migration is a separate opt-in, online import into a local candidate. Authenticate through existing supported paths, enumerate all authorized personal records with pagination, fetch permitted attachments, preserve provenance in a new-schema migration report, and compare counts/totals before commitment. Group-shared data needs explicit product and permission treatment; it cannot silently become a shared offline group. Exclude credentials, tokens, admin data, third-party private fields, and server-only operational state.

Convert legacy numeric amounts with exact decimal parsing and a documented cent policy. Quarantine unsupported categories/currencies, sub-cent values, refunds, invalid dates, duplicate IDs, and missing receipt bytes for user review. Do not read another app's sandbox or assume Firebase account identity is the provider backup account. Do not delete or mutate legacy cloud data as part of successful import. Keep migration idempotent with source ID mapping and an encrypted completed-import marker; test partial pagination, expired auth, interruption, and retry.

Release evidence must include: schema/category conformance on both native apps; iOS-to-Android and Android-to-iOS backup restore; wrong-key and all-component tamper refusal; duplicate/malformed/oversized input; dry-run without writes; rollback under failed replacement and process death; reinstall plus recovery on a physical device; secure-storage and backup-exclusion inspection; receipt and full-domain completeness; migration counts/totals; and cloud authorization/retention failures. The complete major release is blocked until those domain/device gates are met, regardless of passing reference vectors.
