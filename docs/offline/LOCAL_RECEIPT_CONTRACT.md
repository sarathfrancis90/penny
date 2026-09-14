# Local encrypted receipt foundation v1

Status: byte layout and bindings fixed for the isolated native foundation slice;
no live-store integration or portable backup change. This is a local format,
independent of frozen backup readers/writers v1–v3 and the draft v4 archive.

## Descriptor and key ownership

The caller supplies a uniformly random 32-byte device-protected root. It MUST
NOT be a recovery key, password, account token or an unprotected persisted key.
The root's persistence/protection is a caller responsibility; this primitive
neither provisions it nor proves device protection.

An immutable descriptor has exactly these seven fields:

| Field | Required value |
| --- | --- |
| `vaultId`, `generationId`, `id`, `expenseId` | Lowercase UUID matching `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` |
| `mediaType` | `image/png` or `image/jpeg` |
| `byteCount` | Integer 1 through 2,097,152 inclusive; booleans/fractions forbidden |
| `sha256` | Exactly 64 lowercase hexadecimal characters |

`id` identifies the receipt and `expenseId` its owning expense. UUID validation
matches existing Wire shape, with no added version/variant constraint. UUID raw
bytes are the 16 bytes obtained by removing hyphens and decoding hex in written
order, never a platform-specific UUID struct memory representation. Descriptor
JSON is a fixture representation, not part of the envelope. Native adapters
must obtain exact typed integers from strict metadata validation, never rounded
floating-point coercion or truth values. Unknown/missing fields are rejected.

Let `K` be the caller root, `V` the raw vault UUID and `G` the raw generation UUID.
Derive the 32-byte AES key using standard HMAC-SHA256:

```
HMAC-SHA256(K, UTF8("PENNY-OFFLINE-LOCAL-RECEIPT-KEY:1") || 0x00 || V || G)
```

This is one-step domain separation for an already uniform 256-bit secret, not a
password KDF. Use platform cryptography (CryptoKit; Android HmacSHA256 and
AES/GCM/NoPadding). There is no new dependency or hand-written primitive.

## Exact authenticated encoding

An envelope is `magic8 || nonce12 || ciphertextN || tag16`, where `magic8` is the
ASCII bytes `PNYRCP01`, `N == byteCount`, AES-256-GCM uses a 96-bit nonce and a
128-bit tag. Runtime encryption generates a fresh random nonce for each write.
The envelope is exactly `N + 36` bytes (37 through 2,097,188 bytes); extensions,
truncation and trailing data are rejected. No alternative algorithm/version is
negotiated, and invalid magic has no fallback decoder.

AAD is the following exact concatenation, with no length prefixes or padding:

```
UTF8("PENNY-OFFLINE-LOCAL-RECEIPT:1") || 0x00 || magic8
|| raw16(vaultId) || raw16(generationId) || raw16(id) || raw16(expenseId)
|| media1 || uint64be(byteCount) || raw32(sha256)
```

`media1` is `0x01` for PNG and `0x02` for JPEG. `raw32(sha256)` decodes the
hexadecimal digest. AAD is exactly 143 bytes: domain including NUL at offsets
0–29, magic 30–37, four UUIDs 38–101, media 102, length 103–110,
digest 111–142 (zero-based, inclusive). The unsigned 64-bit length is big-endian with the same
2 MiB policy bound; it is not decimal text. GCM authenticates nonce, ciphertext
and all AAD fields. The generation binding in both KDF and AAD prevents moving
a blob between generations; authenticated ownership does not itself prove the
expense exists in a financial candidate.

Reading validates the descriptor and exact bounded envelope size/magic before
opening AES-GCM. Plaintext is provisional until GCM succeeds, its exact length
and SHA-256 match the descriptor, and native image validation succeeds. Apply
existing receipt rules, including complete decode, type/dimension/pixel limits,
PNG integrity and animation restrictions. Do not publish unauthenticated bytes
or write plaintext temporary files. The Node oracle reuses the existing
structural image checker; it does not prove complete native image decoding.

## Isolated file-store lifecycle

A new OPEN operation exclusively creates an owned generation beneath private,
protected app storage. A trusted native storage context/directory capability
(e.g. Android filesDir or an iOS private directory URL) may be injected, including
for a test sandbox; it must not originate from backup/descriptor data.
The iOS parent must already be excluded from operating-system backup; the
primitive verifies that precondition without changing attributes through a
pathname. Receipt file protection is selected atomically when each device file
is created. The simulator implementation is explicitly a filesystem simulation,
with no claim that it enforces Apple's hardware data-protection classes.
Generate
its UUID privately; callers provide a vault ID,
not a path or chosen generation. Validate every descriptor's vault/generation
against the operation's captured identity. The only final relative path is
`generationId/id.pennyreceipt`; identifiers cannot carry path syntax. Exclusive
creation and no-follow/regular-file checks must prevent collision, traversal,
symlink substitution and accidental adoption of another operation's files.
Device/inode numbers alone do not establish continuing ownership: an unlinked
file's inode can be reused immediately. Keep an owned descriptor pin until
cleanup, or provide an equivalent guarantee that a replacement cannot acquire
the recorded identity. Reopening by name remains a separate validation step.

Accept at most 100 distinct receipt IDs and 8,388,608 aggregate plaintext bytes,
with checked counters. Bind a receipt to one descriptor for the operation;
never silently replace an existing receipt or retry a failed partial write as
success. The native implementation may use an exclusive ciphertext-only staging
file within its owned directory. It must synchronize/close, reopen and validate
what it wrote before admitting the immutable receipt handle. A successful seal
revalidates its complete owned file inventory and yields an unactivated
`ReceiptGeneration`. Seal is one-shot: no subsequent writes, second seal or
reuse after failure/discard. Ownership transfers to the unactivated generation,
which has its own cleanup responsibility; operation discard cannot delete a
transferred generation. Failed writes/seal, cancellation and cleanup errors
must not return success or leak partial handles. Cleanup is scoped to files and
directories the operation owns; a collision must never delete a preexisting
object. Sync/close/protection errors fail closed, and directory durability must
be covered by the native platform implementation's stated guarantees.

Public fixture IDs/nonces are permitted only in pure codec/read tests, never an
option that lets production callers choose paths or reuse nonces. The shared
lifecycle scenarios are native acceptance requirements, not a Node filesystem
proof. This slice creates no active pointer, live store mutation, recovery
candidate, archive success or cross-domain ownership approval.

## Deferred integration gates

A later reviewed candidate must bind validated input digest, source vault,
local store identity/incarnation, expected revision, key identity and cloud
account/operation identity where applicable. It must prove referential checks,
full inventory, cancellation and account/revision guards before atomic install,
and preserve/reopen the old generation on failure. Root provisioning, crash
recovery/garbage collection, generation pinning, encrypted database references,
legacy export assembly and application migration remain separate work.

## Public fixtures and oracle

`packages/offline-contract/fixtures/local-receipt-v1/fixture-manifest.json`
records deterministic public inputs, exact derived key/AAD and ciphertext hash.
The root is 32 bytes of `0b`, nonce is `000102030405060708090a0b`, and plaintext
is the existing public 70-byte `receipt.png`. These values are test-only and
provide no secrecy. Known-key authenticated malformed fixtures test checks
beyond GCM. Varying public fixtures under a repeated nonce is not a runtime
pattern. `local-receipt-fixtures.mjs verify` is read-only; `generate` updates the
owned corpus. Native golden decrypt/encrypt and lifecycle evidence are reported
separately by each platform.
