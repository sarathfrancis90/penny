# Private cloud backup implementation contract

P5 contract, updated 2026-09-13. Both native provider adapters and default-off scheduling are implemented and tested with synthetic providers. Real-account publication and clean-install recovery remain unverified; these results are not evidence of a shipped cloud backup. Normal local operations and on-device AI remain independent of this optional feature.

## User and key lifecycle

Backup is disabled on a fresh install. Enabling it requires an explicit provider action and confirmation by re-entering the independently generated recovery key. A saved-key checkbox alone is insufficient. Store the confirmed recovery key with device-only protection separately from the local vault key. Never include it in remote snapshots, manifests, analytics, logs or crash attachments. Explain that losing every device and the recovery key makes recovery impossible; do not imply an account password can decrypt a backup.

Bind each configured backup to the selected provider account's opaque identity. Capture and compare that identity before creating a snapshot, before upload, after verification and before changing a manifest or retention. An account change cancels outstanding work and requires explicit re-enablement for the new account. Removing provider consent stops backup work and clears locally held provider credentials; it never deletes the local ledger or silently removes remote backups.

Recovery-key rotation must preserve the last recoverable backup until a snapshot under the new key is uploaded, downloaded and verified. Old backups still require their old key. A distinct explicit cleanup action or documented retention policy controls deletion; rotation must not pretend to re-encrypt immutable old snapshots.

## Snapshot publication and verification

1. Read a coherent local snapshot/revision. Validate all domains and receipt bytes. Seal it with the existing portable envelope and a fresh random nonce; write only encrypted staging bytes to a protected, excluded local location.
2. Reopen and authenticate the staged file. Upload it under a new random snapshot identifier without replacing any previous good object. Only ciphertext and necessary opaque transport metadata leave the device.
3. Wait for provider-specific remote completion. Download the uploaded object through the provider API, enforce byte bounds, compare the ciphertext digest and authenticate the full snapshot. The provider's acceptance response or local file write alone cannot establish this state.
4. Recheck account identity and cancellation. Publish a new immutable authenticated manifest referring to the verified immutable object, then download, authenticate and compare the exact manifest bytes. The frozen manifest contract below has a distinct authenticated context. Do not maintain a shared mutable "latest" pointer.
5. Record the exact snapshot revision and remote verification time locally. Edits made during upload stay dirty for a future backup. Never label the current vault as fully backed up if it advanced after the staged revision.
6. Automatic deletion is disabled for this slice. Leave previous verified generations, failed-publication orphans and unknown objects intact. Retention remains a later policy requiring concurrency proof and explicit protection of pre-migration/manual generations; do not silently prune because a listing or count reaches a bound.

## Frozen cloud manifest version 1

`packages/offline-contract/cloud-manifest.mjs` is the executable wire reference. `cloud-manifest-v1.json`, `cloud-manifest-v1.pennymanifest`, `cloud-snapshot-v1.pennybackup`, `cloud-golden-vector-v1.json` and `cloud-conformance-v1.json` in its `fixtures/` directory are independent public synthetic vectors. The cloud fixture uses a different public recovery key from the portable v1/v2/v3 fixtures. No production key or account is present.

One manifest describes one publication. All following keys are required, unknown keys rejected, null explicit:

| Manifest key | Value |
| --- | --- |
| schemaVersion | Integer 1 |
| manifestId, writerId | Canonical lowercase UUID strings; manifestId is new per publication, writerId is stable per installation |
| provider | `icloud` or `drive` |
| accountTag, vaultTag | 64 lowercase hexadecimal SHA-256 characters |
| localRevision | Integer 0 through 9,007,199,254,740,991, monotonic only within that writer's vault |
| createdAt, verifiedAt | Exact Gregorian `YYYY-MM-DDTHH:mm:ss.SSSZ`; verifiedAt records snapshot remote verification, createdAt records manifest creation |
| previousManifestId | Prior locally verified manifest UUID or null; must not equal manifestId; advisory lineage, never a permission to delete |
| snapshot | Exact descriptor below |

The snapshot descriptor requires `objectId` (fresh canonical lowercase UUID for the remote immutable object), `snapshotId` (canonical UUID inside the portable snapshot), `envelopeVersion` (integer 1), `snapshotSchemaVersion` (integer 1, 2 or 3), `sha256` (64 lowercase hex, of the exact encoded encrypted envelope bytes), `byteCount` (integer 1 through 20,971,520), and `createdAt` (the exact timestamp inside the snapshot). It has no URL, provider file ID, relative path, plaintext balance, account name, email or token. Logical transport names are exactly `snapshot-<objectId>.pennybackup` and `manifest-<manifestId>.pennymanifest`; provider adapters resolve these within their configured container/space and reject ambiguous duplicate names.

Tags use SHA-256 over UTF-8 bytes, with each `\0` below meaning one zero byte: accountTag input is `PENNY-OFFLINE-CLOUD-ACCOUNT:1\0<provider>\0<opaqueIdentity>`; vaultTag input is `PENNY-OFFLINE-CLOUD-VAULT:1\0<canonicalVaultUUID>`. Account identity is a stable provider-issued opaque identity, 1–1024 Unicode code points with no ASCII controls; it must never be an email address, access token or account password. This is an adapter obligation, not something hashing can establish. Tags are binding identifiers, not proof of authorization. No secret device-only value participates in their derivation.

Manifest encryption uses the confirmed recovery key's 32 bytes with AES-256-GCM, a fresh random 12-byte nonce, a 16-byte tag and exact UTF-8 AAD `PENNY-OFFLINE-CLOUD-MANIFEST:1`. Its closed envelope has the same five field names as portable backups: `formatVersion`=1, `algorithm`=`AES-256-GCM`, and canonical padded standard-base64 `nonce`, `ciphertext`, `tag`. It is a separate format distinguished cryptographically by AAD and by `.pennymanifest`. Plaintext is bounded to 8,192 UTF-8 bytes; encoded envelope to 12,288 bytes; ciphertext is nonempty and at most 8,192 decoded bytes. Enforce byte limits before parsing/decryption. Strict UTF-8, Unicode scalar, duplicate-key and maximum-depth-32 JSON checks match portable backups. JSON member order is unrestricted; vectors use the reference's exact serialized order only for deterministic ciphertext testing. Random nonce generation remains mandatory outside `sealManifestForTest`.

After decryption, require selected provider and accountTag equality. A known-vault operation also requires vaultTag equality. Clean-install discovery may omit an expected vaultTag: the selected authenticated manifest supplies it, then downloading its snapshot must match byte count, SHA-256, authentication, snapshot ID, schema version, timestamp and the tag derived from its decrypted vault ID. This requires the recovery key and selected provider identity, with no old writer ID or old device secret. Native restore still fully decodes receipt images and requires explicit replacement after preview. A structurally valid authenticated manifest alone does not establish a currently downloadable, recoverable snapshot. Timestamps are displayed provenance; do not rank writers by device clocks.

## Bounded discovery and publication model

List at most 100 objects per page, 10 pages and 1,000 objects total, counting unknown files too. Page tokens are opaque Unicode strings of at most 2,048 code points; repeated tokens or IDs, ambiguous recognized names, excessive pages/items, or an unfinished page chain produce an explicit incomplete/unavailable listing. Never label a truncated list complete or empty. At most 100 manifest candidates may be downloaded, each under the 12 KiB bound; a full scan therefore downloads at most 1,228,800 manifest bytes. Exceeding this baseline requires a user-visible capacity action or a future reviewed pagination design. Unknown names are ignored and never deleted. A recognized filename must equal the authenticated manifest's manifestId before display/adoption; every snapshot name must resolve uniquely as well.

Group verified candidates by vault and writer. Revisions compare only within one writer; multiple writers are displayed explicitly, and same-writer/same-revision candidates with different snapshot digests are a conflict. Neither group order nor device timestamps select a cross-writer "latest" backup. Users choose a candidate for restore; both writers' immutable generations remain available. Clean-install discovery can expose multiple vaults after authentication rather than guessing one.

`cloud-publication.mjs` models four provider suspension points: snapshot upload completion, snapshot download, manifest upload completion and manifest download/readback. `beginPublication` takes the staged snapshot and planned manifest fields; timestamps in that plan are replaced when the snapshot-download event supplies the actual verifiedAt, createdAt and freshly sealed manifestBytes. Adapters verify the downloaded snapshot before constructing/sealing those manifest bytes. The reducer independently authenticates both before emitting manifestUpload. Native adapters must check provider/account identity, a binding-session epoch, cancellation and operation ID before each effect and after every internal await. Switching away and back still changes the epoch. A late callback from another operation cannot advance this one. Last-good state changes only after digest/authentication verification of the snapshot and exact-byte authenticated manifest readback. Local revision advances during upload may leave a valid older published generation, but current changes remain dirty; status must be recomputed against the live revision. No transition emits deletion. Model/fake transport success does not prove provider upload completion, account correctness or durability.

Restoration lists verified candidates, downloads a bounded encrypted object, requests its recovery key, validates the full schema and images, and shows all-domain counts and balances. Only explicit replacement commits it. The local revision guard prevents a stale preview from erasing intervening edits. Wrong keys, unsupported versions, quota/network failures, corrupt manifests or interrupted transfers preserve the active vault. Restore into a clean installation is a separate required test.

## Provider boundaries

### iOS

Use a dedicated CloudKit container's private database with immutable records and encrypted `CKAsset` payloads. Portable manual export remains a Files document. CloudKit requires configured signing entitlements and an available account; the ad hoc simulator build does not establish production access. Derive accountTag from the container's opaque user record ID `recordName`, never an email. Check account status, observe account-change notifications, and advance the binding epoch on every identity/consent transition.

Save new records using `modifyRecords(saving:deleting:savePolicy:atomically:)` with an empty deletion list and explicit `.ifServerRecordUnchanged`. Inspect every per-record save result as well as thrown errors; successful request completion alone can contain individual failures. On conflicts, preserve both immutable generations instead of overriding change tags. [Apple modifyRecords](https://developer.apple.com/documentation/cloudkit/ckdatabase/modifyrecords(saving:deleting:savepolicy:atomically:)), [Apple savePolicy](https://developer.apple.com/documentation/cloudkit/ckmodifyrecordsoperation/savepolicy)

After server save completion, explicitly fetch the record through the private database API and read its fetched asset bytes under the shared bounds, checking digest and authentication. Reopening the local upload staging asset does not count as remote verification. Publish/fetch the immutable manifest only after snapshot verification. There is no mutable latest record or automatic deletion. Background expiration leaves the prior verified state intact. Entitled real-account upload/fetch and clean-install restore remain required gates.

### Android

Request Google authorization only when enabling Drive backup, using AuthorizationClient. Keep this separate from local app access. The Android OAuth registration must match the final application ID and signing certificate; no embedded client secret or Penny server is required for the selected on-device authorization flow. An access token alone does not identify which account the user selected; resolve and bind account identity explicitly. [Android authorization guidance](https://developer.android.com/identity/authorization)

Use only the `drive.appdata` scope and `appDataFolder` space. Upload new immutable files, list using that space, and download bytes with `files.get?alt=media`. The folder is hidden from ordinary Drive UI and other apps; it is distinct from Android device backups. Its files cannot be trashed, so retention must use carefully scoped permanent deletion only after all verification gates. [Drive app data documentation](https://developers.google.com/workspace/drive/api/guides/appdata)

Use a bounded HTTP client that rejects redirects carrying authorization to another origin, does not log tokens or response bodies, enforces TLS and content limits, and maps revoked access/quota/transient failures explicitly. Account identity can be resolved through the authorized Drive user metadata when available; failure must prevent upload rather than guess an account. [Drive about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)

The Android manifest declares Internet and network-state permissions for optional Drive backup and WorkManager constraints. Platform TLS trusts system roots only for the exact Drive host; static guards exclude other app-owned networking and Firebase/cloud-AI imports. A credential-free emulator probe completed TLS to Drive and rejected the ML Kit logging host before HTTP. This does not prove custom SDK, AICore or same-host traffic behavior. WorkManager schedules eligible retries with backoff; it cannot promise an exact clock time. Manual backup remains available when background work is deferred.

## Default-off automatic scheduling

iOS registers an app-owned BGProcessing handler and uses the same publication coordinator as foreground work. Android uses unique constrained periodic WorkManager work and silent authorization only. Both coalesce unchanged revisions, bound retries and expiry, cancel on consent/key/account changes, and preserve local operations during provider I/O. An independently persisted stop marker prevents failed opt-out or error-state writes from reviving automation after restart. Android captures snapshot, revision and incarnation in one SQLite transaction across foreground and worker connections. Consent UI and fake-provider lifecycle tests passed; real OS scheduling, account consent and remote recovery remain open.

## Required evidence before shipping automatic backup

- Native fake-provider tests for account switch at every suspension point, permission revocation, expired credentials, quota, transient failures, cancellation and retry idempotence.
- A last-good manifest and snapshot survive every failed publication or retention step. Unknown remote files are never deleted. Older schemas remain recoverable.
- Concurrent local edits during backup remain pending; concurrent writers never silently prune each other's latest recovery point.
- Signed native account authorization, upload, provider completion, download, digest/authentication verification and explicit restore on a clean second installation.
- Airplane-mode local CRUD/reports/OCR while backup is unavailable, and packet evidence that plaintext financial content and AI prompts never leave the app.
- User-visible last verified remote completion, backed-up revision, pending changes, unavailable/account-action states, and a recovery key ceremony tested without agent shortcuts.

Real account consent, matching OAuth/signing registration, iCloud entitlements and clean-device access are external gates. Provider adapters, fake transport tests, UI and configuration validation can be implemented before those gates are available. A mocked transport test must never be recorded as a real cloud backup.
