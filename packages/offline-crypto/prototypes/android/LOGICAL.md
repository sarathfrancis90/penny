# Experimental incremental logical admission

`LogicalCodec.decode` composes `FrameCodec` with an incremental nine-byte record
parser and a required `LogicalValidationSink`. Its result is an uncommitted
logical summary, not a restore candidate or permission to replace a vault. No
concrete encrypted staging store, durable reopen, preview/account/revision binding,
atomic install or production integration is implemented here.

The parser enforces closed BEGIN/END fields, profile/count/byte declarations,
unsigned lengths before allocation, domain/ASCII-ID ordering, receipt pairing,
observed policy and body byte counters, record count, and the exact original-byte
SHA-256 transcript. Headers and payloads can span authenticated frames. A new
internal frame-boundary callback rejects END in MESSAGE and requires END exactly
at FINAL. Sink finalization starts only after FrameCodec has returned from strict
EOF and owned-stream close. Cancellation and all failures invoke discard; finish
and close failures cannot return success. The sink must itself implement reliable
discard and encrypted, isolated staging; this probe tests that contract with a
nonpersistent sink, not fault-tolerant storage.

The Gradle build copies six current native sources unchanged into generated
probe sources: Categories, Expense/Wire, FinanceModels, StrictJson, Attachment
and ReceiptImage. Their individual schema3 decoders retain exact field sets,
money/date/Unicode/category/nullable/schedule rules. A probe-only bounded input
helper satisfies ReceiptImage's unused preparation API without importing the
live BackupExporter, vault, recovery store or UI. No production sources change.

The logical layer maintains bounded typed ID sets, recurrence and budget-period
uniqueness sets, per-domain checked sums and per-goal savings balances. It checks
income/savings/recurring/receipt references without retaining full records.
Parser-owned semantics are finalized before giving detached mutable JSON to the
sink. Snapshot ID, vault ID and validated creation timestamp are retained in the
summary. `nonReceiptBytes` is the declared body count; `policyMetadataBytes` also
includes BEGIN/END. Neither is inferred from the other.

JSON is capped at 64 KiB. StrictJson validates syntax, UTF-8, duplicate/escaped
duplicate keys, scalar pairs and depth. A second lexical pass validates exact
integer values and normalizes only numeric tokens before JSONObject conversion;
hashes still cover the original bytes. This prevents decimal rounding/underflow.
Exact `1.0`, `1e0`, `-0` and zero with a huge signed exponent are accepted; a zero
mantissa is recognized before exponent conversion. Nonzero fractions and
excessive exponents fail without allocating an enormous integer.

One raw receipt of at most 2 MiB is buffered, hashed, checked against its owner,
length and media declaration, and fully decoded with the current native receipt
decoder (including PNG integrity checks and API26 compatibility). The bitmap is
recycled, and the borrowed receipt bytes are wiped after the synchronous sink
call. There is no aggregate inline receipt graph. JSON buffers are wiped on
completion/error; managed Strings and indexes have ordinary runtime lifetimes.

Validation consumes the shared materialized v4-logical corpus: 10 accepted and
60 rejected streams, including real 1 MiB header/payload splits, 10,001 expenses,
references, duplicate occurrences, financial overflow, malformed JSON, counts
and transcripts. Tests encrypt exact logical fixture bytes through native sodium
before calling the actual composed decoder. These bounded test fixtures can be
materialized in memory (up to 8 MiB); the parser does not materialize the archive.
Additional native tests cover receipt decode, sink mutation isolation, all sink
lifecycle failures, discard exceptions, cancellation and frame authentication/EOF.

Use the README's build command with the materialized logical fixture path. The
complete runner now has 16 groups (12 frame and four logical). For only this
layer use `-e class ca.penny.v4frameprobe.LogicalCodecDeviceTest`, requiring
`OK (4 tests)`. Exact commands/hashes, native source provenance and runtime results
are in `evidence/logical-validation.json`. The 10,001-row fixture demonstrates
that legacy aggregate caps were not accidentally reused; it does not qualify
50,000 expenses, 5,000 receipts, memory/performance or durable restore capacity.
