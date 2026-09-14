# Penny streamed backup v4 — normative draft

**NORMATIVE DEVELOPMENT CONTRACT, updated 2026-09-14. Not release-frozen.** The native apps now implement v4 writers and guarded Files restore/export at the smaller current product limits. Profile A below remains a measurement target. MUST/REJECT rules describe the format; implementation and runtime scope are recorded in [V4_EXPORT_INTEGRATION.md](V4_EXPORT_INTEGRATION.md). This document follows [CAPACITY_V4_DECISION.md](CAPACITY_V4_DECISION.md), replacing the superseded custom AES-GCM framing sketch. It does not raise native product limits or change envelope 1/schema 1–3. Public layout fixtures live in `packages/offline-contract/fixtures/v4-design/`; encrypted frame fixtures and isolated native codecs now live in `packages/offline-contract/fixtures/v4-frames/` and `packages/offline-crypto/prototypes/`. Passing frame authentication does not implement the logical/candidate rules below or freeze the format.

## Scope and fixed primitives

V4 is a sequential immutable file containing one complete coherent ledger. There is no compression, archive extraction, URL fetching, algorithm negotiation, synchronization or partial successful restore. File extension remains `.pennybackup`; MIME/UTType registration is a separate integration task.

Use upstream libsodium `crypto_secretstream_xchacha20poly1305_*` and `crypto_kdf_hkdf_sha256_*`. The implementation baseline is 1.0.22, commit `77e1ce5d6dee871c49ef211222ba18ef0c486bda`; dependency provenance/build approval is separate. Do not implement these primitives independently in Swift/Kotlin. Use SHA-256 for receipt/transcript digests. Supported constant sizes are key 32, secretstream header 24, per-message overhead 17, MESSAGE tag 0x00 and FINAL tag 0x03. Validate expected API sizes before operation. [Upstream secretstream](https://doc.libsodium.org/secret-key_cryptography/secretstream), [HKDF](https://doc.libsodium.org/key_derivation/hkdf)

Legacy recovery-key parsing remains exact: trim surrounding whitespace, require `pny1-` plus 64 lowercase hex digits, decode 32 bytes. The root is random key material, not a password. V4 derives a separate stream key; **this does not repair historical AES-GCM nonce reuse or re-encrypt earlier backups**. Existing legacy and cloud-v1 readers/AAD/bounds/fixtures remain unchanged.

## Profile A bounds

Every bound applies independently to both writer admission and reader consumption. Only `capacityProfile="A"` is supported. Any other profile fails; no future profile allowance exists in this draft. These remain measurement targets, not currently accepted app capacity.

| Quantity | Inclusive maximum |
| --- | ---: |
| Expenses | 50,000 |
| Attachments | 5,000 |
| Budgets / income sources / income entries | 1,200 / 1,000 / 10,000 |
| Savings goals / savings entries / recurring expenses | 1,000 / 10,000 / 1,000 |
| Individual receipt payload | 2,097,152 bytes |
| Aggregate receipt payloads | 536,870,912 bytes (512 MiB) |
| All non-receipt plaintext bytes, including every record header and BEGIN/END | 134,217,728 bytes (128 MiB) |
| All plaintext | 671,088,640 bytes (640 MiB), implied by the two preceding bounds |
| Complete file, header/framing/ciphertext included | 805,306,368 bytes (768 MiB) |
| Plaintext chunk / ciphertext chunk | 1,048,576 / 1,048,593 bytes |
| Frames | 640, sequence 0–639; derived from plaintext/chunk bounds |
| Individual JSON payload | 65,536 UTF-8 bytes |
| Logical records, including BEGIN and END | 84,202, implied by all domain counts plus two records per attachment |
| JSON nesting | 32 |

Zero expenses/receipts and empty finance domains are allowed. Receipt payloads must be nonempty. Retain existing image formats, maximum dimensions 4,096, maximum pixels 16,000,000, full native decode, integer money/date/category/text bounds and cross-domain semantics from [BACKUP_CONTRACT.md](BACKUP_CONTRACT.md) and [FINANCE_CONTRACT.md](FINANCE_CONTRACT.md). In particular, per-value money maximum 99,999,999,999 and aggregate maximum 999,999,999,999,999 do not increase.

Binary integers are unsigned big-endian; reject values outside signed64 range before platform conversion, then check the narrower applicable bound. The header chunk-limit constant is explicitly u32; all frame/record wire lengths and sequence numbers are u64. JSON counts/lengths are exact nonnegative integers within their specified bounds, never floating-point approximations, strings or booleans. Use checked 64-bit arithmetic throughout and bounded buffer conversions. Reject excessive declared sizes before allocating or reading bodies; also enforce independently observed cumulative bytes. Claimed totals never authorize more input.

## File dispatch and 70-byte header

Do not strip bytes, Unicode BOMs or whitespace to locate binary magic. Buffer at most eight initial bytes. If input begins the six ASCII bytes `PNYBKP`, it is reserved binary input: require the complete exact eight-byte magic below or reject as unsupported/truncated, with no legacy fallback. A nonempty input ending as a strict prefix of `PNYBKP` is also a truncated binary input. All other input passes unchanged to the existing legacy reader under its original 20 MiB envelope bound; dispatch must not widen that limit. Exact v4 magic followed by any subsequent error never falls back. Empty input fails.

| Offset | Bytes | Encoding/value |
| --- | ---: | --- |
| 0 | 8 | ASCII `PNYBKP4` + LF, hex `504e59424b50340a` |
| 8 | 2 | u16 envelopeVersion 4, hex `0004` |
| 10 | 4 | u32 chunkLimit 1,048,576, hex `00100000` |
| 14 | 32 | Fresh random public HKDF salt |
| 46 | 24 | Exact header output of upstream `init_push` |

There are no padding, flags, optional fields or additional header bytes. Require exactly 70 bytes before processing frame 0. Reject mismatched magic/version/chunk constant before deriving keys. Salt and secretstream header are opaque bytes; they can contain any byte value. Do not special-case zero bytes in readers or treat the layout fixture's zero header as proof of authentication. Header integrity is established by successful frame authentication, not by `init_pull` alone.

Key derivation is exactly:

```
PRK = HKDF-SHA256-Extract(salt = header[14:46], IKM = recoveryRoot32)
K   = HKDF-SHA256-Expand(PRK, info = UTF8("PENNY-OFFLINE-BACKUP:4:SECRETSTREAM"), L = 32)
```

The info string is 35 bytes, no terminating NUL, BOM, newline or normalization. Call upstream extract with 32-byte salt/32-byte IKM and expand with the exact 35-byte info. Expand output is the secretstream key. Writers obtain salt from a platform CSPRNG and call upstream `init_push` with K to generate the 24-byte stream header. Store no PRK, stream key or recovery root in the file. Readers derive K and call `init_pull` with the exact 24 bytes.

Each encryption attempt uses fresh salt and a fresh upstream stream initialization. Retries may resend exact previously sealed ciphertext, but MUST NOT serialize/resume encryption state, append to a completed stream, replay an earlier state with different plaintext or edit a sealed chunk. Confine state to one operation/thread; destroy it on final/error/cancel. Best-effort buffer wiping supplements managed-language ownership; it is not a memory-erasure guarantee.

## Frames and authenticated data

A frame is `sequence:u64 || ciphertextLength:u64 || ciphertext[ciphertextLength]`. The 16-byte frame header is public. `ciphertextLength` is 18 through 1,048,593, because empty plaintext is forbidden and upstream adds 17 bytes. The length covers the entire upstream push output; do not split off or add another tag. Frames have no public final flag or nonce.

AAD is the following exact concatenation:

```
UTF8("PENNY-OFFLINE-BACKUP:4:FRAME\0") || completeHeader70 || frameHeader16
```

Here `\0` denotes exactly one zero byte; the AAD domain is 29 bytes and complete AAD is 115 bytes. This binds magic/version/chunk limit/salt/stream identity plus sequence and declared length. Use exact file bytes, not a decoded/reserialized header. Sequence starts at 0 and increases exactly by 1. Reject missing, duplicate, reordered or excessive sequence before admitting the frame. A forged frame header still fails cryptographic authentication.

Writer plaintext is the logical stream below, partitioned into chunks of at most 1 MiB. Every non-final chunk is exactly 1 MiB and is sealed with MESSAGE (`0x00`). The last chunk is 1 through 1 MiB and is sealed with FINAL (`0x03`). If the logical size is an exact multiple of 1 MiB, the last **full-sized** chunk is FINAL; no empty FINAL frame follows. Writer lookahead or a known pinned stream length must determine finality before sealing. Never reseal a previously emitted MESSAGE chunk as FINAL under the same state.

After a successful pull, require `plaintextLength == ciphertextLength - 17`; allow only MESSAGE or FINAL. MESSAGE must yield exactly 1 MiB. Reject PUSH (`0x01`), REKEY (`0x02`) and any other application tag even though the library exposes them; upstream internal rekeying remains its implementation detail. FINAL can be full-sized. Following FINAL, require actual underlying EOF: any further byte fails. EOF before FINAL, a short frame/header/body, any read error, or cancellation is failure. An empty file/stream cannot represent the empty ledger; it still needs BEGIN and END.

Authenticate a whole bounded frame before exposing its plaintext to the record parser. Successful early frames may populate only an isolated encrypted candidate. No preview success, live record access, restore commit or backup-verification status may follow until **all** frame, record, transcript and EOF rules pass. Discard the candidate on any failure. The library's FINAL tag does not itself enforce EOF or application completeness; the container must.

## Logical record grammar and ordering

Authenticated plaintext chunks concatenate without separators. Each logical record is `kind:u8 || payloadLength:u64 || payload[payloadLength]`. The nine-byte header and payload can cross chunk boundaries, including a split length field. Incremental parsing must retain incomplete headers/records under their own bounds. JSON payloads must be nonempty objects with exact allowed fields; reject invalid UTF-8, BOM, unpaired scalars, duplicate members including escaped-equivalent names, unknown fields, excess depth and invalid numeric syntax using existing strict rules. JSON key order/whitespace are unrestricted within bounds; authenticate/hash exact bytes and preserve Unicode values.

| Kind | Payload | Per-record schema |
| --- | --- | --- |
| 1 | BEGIN JSON | Defined below; exactly first |
| 2 | Budget JSON | Existing schema3 `$defs/budget` |
| 3 | Income source JSON | Existing schema3 `$defs/incomeSource` |
| 4 | Income entry JSON | Existing schema3 `$defs/incomeEntry` |
| 5 | Savings goal JSON | Existing schema3 `$defs/savingsGoal` |
| 6 | Savings entry JSON | Existing schema3 `$defs/savingsEntry` |
| 7 | Recurring template JSON | Existing schema3 `$defs/recurringExpense` |
| 8 | Expense JSON | Existing schema3 `$defs/expense` |
| 9 | Receipt descriptor JSON | Existing attachment fields minus `dataBase64` |
| 10 | Raw receipt bytes | Exactly the preceding descriptor's byteCount |
| 11 | END JSON | Defined below; exactly last |

The source for the inherited object field sets is `packages/offline-contract/snapshot-v3.schema.json`; all existing semantic validation also applies. Its old top-level array/inline byte limits are not reused as a v4 aggregate validator. V4 changes representation and profile bounds only, without silently changing per-object fields. Canonical UUID means the existing lowercase hyphenated shape; do not impose an unannounced UUID version-bit restriction.

The parser state machine is:

1. `EXPECT_BEGIN`: accept kind 1 only, validate profile/count/byte declarations, initialize counters/transcript.
2. `DOMAINS`: accept zero or more records for each kind 2 through 8, in increasing kind order, skipping empty domains. Within each domain IDs must increase strictly by ASCII bytes. Never return to a previous kind or accept a duplicate ID. Advance observed counts with checked arithmetic and reject immediately when exceeding BEGIN or policy limits.
3. `RECEIPTS`: kind 9 transitions to `EXPECT_RECEIPT_BYTES`; validate exactly `id, expenseId, mediaType, byteCount, sha256`, and require its owner in this snapshot. Receipt IDs strictly increase independently of expense IDs. A kind 10 is legal only in this pending state, has the exact declared nonzero length, and returns to `RECEIPTS`. No other record may intervene. Reject dangling descriptors or unpaired bytes. Stream-hash the raw payload, compare exact byte count/digest, and perform bounded complete native image decoding. Do not drop a failed receipt.
4. `END`: kind 11 is legal after BEGIN/domains/complete receipt pairs, even when all domains are empty. Reconcile all declarations and semantics below. Its final payload byte must be the final logical byte in the FINAL frame. END may span frames; receiving a fully parsed END from a MESSAGE frame is failure. No records, padding or whitespace may follow it.
5. `COMPLETE`: entered only after successful FINAL plus strict file EOF and all candidate validation. Anything else is failure, never a partial success.

Transition to RECEIPTS/END finishes domain admission; no domain records can appear afterward. Cross-domain references are typed, so the same UUID in distinct domains is not automatically invalid. Validate missing references, duplicate budget category/month pairs, duplicate income/expense recurrence occurrences, linked nullable fields and checked financial totals exactly as schema3. No receipt paths, names, URLs or filesystem extraction destinations appear on wire.

## BEGIN, END and counters

BEGIN requires exactly `schemaVersion, capacityProfile, snapshotId, vaultId, createdAt, counts, receiptBytes, nonReceiptBytes`. Versions/profile are exactly 4/`A`. Snapshot/vault IDs and exact UTC millisecond timestamps use the existing rules. `counts` is a closed object with exactly `budgets, incomeSources, incomeEntries, savingsGoals, savingsEntries, recurringExpenses, expenses, attachments`; all are bounded integers including zero.

`receiptBytes` is the sum of raw kind 10 payload lengths. Declared `nonReceiptBytes` is the sum of **all bytes strictly between the complete BEGIN and END records**, excluding only raw kind 10 payload bytes. Thus it includes every nine-byte record header between them, including kind 10 headers, and all intervening JSON payloads. It excludes both entire BEGIN/END records to avoid self-referential lengths. The independent 128 MiB policy counter **does include** complete BEGIN/END records and all record headers. This distinction is mandatory: declared body accounting cannot exempt manifest bytes from admission limits.

END requires exactly `snapshotId, counts, receiptBytes, nonReceiptBytes, recordCount, streamSha256`. Identity/counts/byte declarations must equal BEGIN and independently observed values. `recordCount` counts every complete record **before END, including BEGIN**; maximum 84,201. `streamSha256` is 64 lowercase hex characters representing SHA-256 of the exact framed logical bytes before END, including BEGIN, every raw receipt byte and every intervening record header. No END header/payload byte participates. Update the transcript incrementally; hash comparison is an additional consistency check, never a substitute for secretstream authentication.

Successful completion requires the record parser at an exact boundary, no pending receipt, all ownership/reference/money/image checks passed, declared and observed counts equal, aggregate metadata/raw/file limits satisfied, and END terminating FINAL at EOF. Staging/index structures must be bounded or disk-backed; no rehydration of an inline whole-vault receipt graph is permitted.

## Candidate and restoration invariants

V4 decoding returns an owned verified candidate identity/summary, not permission to replace the vault. Preserve all existing recovery ceremony and atomic restore guarantees. Capture a coherent pinned export generation/revision/incarnation. Re-encrypt imported data under the receiving device key in an isolated protected generation; never emit plaintext files or copy a live changing SQLite/WAL/receipt directory.

Preview binds the exact sealed input digest/candidate identity, snapshot/vault identity, current local revision/incarnation and recovery-key epoch. Cloud restore additionally binds provider/account/operation/session epoch. Require explicit replacement, acquire the commit lease, recheck bindings and actual available disk space, then atomically install a fully durable/reopened generation. Preserve the old complete generation until replacement reopen succeeds. Cancellation, wrong key, disk-full, process death, invalid receipt or intervening edits preserve old data. Restore advances local incarnation and leaves automatic backup subject to its existing re-enablement safeguards. These are native fault-injection gates, not established by layout vectors.

## Future cloud-v2 integration — not defined by this draft

Cloud-v1 remains frozen. A future cloud-v2 encrypted JSON envelope MUST use explicit outer `formatVersion=2`, selecting its own exact AAD `PENNY-OFFLINE-CLOUD-MANIFEST:2` before decryption; reject unsupported versions and never trial-decrypt alternate AAD under outer 1. Its authenticated inner schema/descriptor must match the chosen version, v4 envelope/schema, profile A, actual encrypted-file byte count/digest and snapshot identity. This statement does not freeze the cloud-v2 key-derivation, complete envelope or descriptor schema; cloud integration requires its own reviewed contract/vectors. Account/revision guards and verified remote download remain mandatory.

## Layout evidence and freeze gate

`v4-design/layout-vectors.json` contains deterministic header/AAD/HKDF bytes and complete **unencrypted** empty and expense/receipt logical streams. Its secretstream header is deliberately 24 zero placeholder bytes; there is no ciphertext or valid `.pennybackup`. The HKDF expected key matches earlier pinned-library Swift/JNI probes, while `generate-layout-vectors.py` independently computes it with standard HMAC-SHA256. That script builds layouts only, not an encryption implementation.

Before freeze, independent reviewers must check exact offsets/labels/counters/state transitions and then compare real pinned-library Swift/Kotlin writer outputs through opposite-platform readers. Required negatives include reserved/partial prefixes, every header/frame length and byte corruption, oversized declarations, unknown profile/tags/kinds, truncated/reordered/duplicated/spliced frames, full-sized FINAL, empty FINAL, missing/fake/duplicate END, split record headers, raw ownership/digest/image failures, final trailing bytes and all native candidate lifecycle faults. No reader/writer, large-capacity promise or cloud version is approved by merging this draft.
