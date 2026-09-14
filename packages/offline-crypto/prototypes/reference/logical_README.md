# Experimental streaming logical-v4 oracle

`logical_oracle.mjs` checks public **unencrypted** logical streams against the v4
draft. It does not authenticate ciphertext, create a restore candidate, freeze
the format or enable application capacity. Its input API accepts complete bounded
frame plaintexts with their authenticated finality supplied by the caller;
`finish(true)` additionally requires the caller to have established actual EOF.
The public-file CLI checks EOF itself. A summary is not permission to import.

The parser incrementally handles nine-byte headers, JSON and raw receipt payloads
across frame boundaries. It checks BEGIN/END identity, domain/ASCII ID order,
receipt pairing/ownership/digests, all declarations and observed counters, exact
transcript SHA-256, FINAL placement and bounded lengths before allocation.
Failure closes the operation; an EOF failure cannot later be turned into success.

It directly reuses the existing reference strict JSON scanner and schema3
per-object validators. An additional bounded exact-number scan prevents JavaScript
rounding from admitting fractional tokens. Exact integer spellings `1.0`, `1e0`
and `-0` are accepted; `1.0000000000000001` and `1e-10000` are rejected. A zero
mantissa remains exact zero with a large signed exponent, without allocating an
integer power. Duplicate and escaped-equivalent members, BOM, invalid UTF-8,
unpaired scalars, excess nesting and unknown fields fail.

The bounded index retains typed UUID sets, unique budget periods and recurrence
occurrences, never whole domain objects or a receipt graph. It enforces all
existing schema3 aggregate checks: expense amounts, actual income entries, and
savings opening balances plus actual savings entries. References remain typed;
the same UUID in distinct domains is allowed. Buffer bounds are one 1 MiB input
frame, one 65,536-byte JSON record or one 2 MiB receipt, plus the nine-byte header
and count-bounded indexes. Receipt hashing is incremental; the single receipt is
also retained for the existing image structure/dimension checker.

**Image scope:** the shared JavaScript checker does not perform full native image
decoding, PNG CRC/inflate validation or all JPEG completeness checks. That gap is
explicit in every oracle summary. No result here establishes complete archive
admission. Native validation must finish decoding every receipt before candidate
completion. No invalid-image-only case is silently counted as rejected by this
reference corpus.

Summary `nonReceiptBytes` is the declared body counter excluding complete
BEGIN/END. `policyMetadataBytes` includes BEGIN/END and every record header;
`receiptBytes` counts only raw payloads. Snapshot ID, vault ID and createdAt are
retained. The old snapshot-level 10,000-expense/inline receipt limits are not used
as v4 validators; unchanged per-object semantics are reused.

From the repository root, with Node available and **no downloaded crypto build**:

```sh
node --test packages/offline-crypto/prototypes/reference/logical_oracle.test.mjs
node packages/offline-crypto/prototypes/reference/logical_fixtures.mjs verify
node packages/offline-crypto/prototypes/reference/logical_oracle.mjs \
  packages/offline-contract/fixtures/v4-logical/finance.pennylogical
```

Tests and `verify` are read-only. They recompute and compare the exact published
manifest, three committed plaintext files and every recipe's bytes/outcome.
Materialize all cases into a **new** ignored directory for native tests:

```sh
node packages/offline-crypto/prototypes/reference/logical_fixtures.mjs materialize \
  packages/offline-crypto/prototypes/reference/.build/logical-fixtures-run
```

`generate` rewrites the reviewed shared fixture manifest/three small files and is
not a CI verification command. The fixture README explains the manifest and the
special END-in-MESSAGE case. Local results and exact hashes are recorded in
`logical_evidence.json`; native runtime suites and production lifecycle gates
remain separately attributed.
