# Raw evidence migration adapter

`migrate-raw-evidence.mjs` converts the representable subset of a retained raw
Firestore export into a schema 3 encrypted backup candidate. It is offline: it
does not authenticate the source again, download anything, change native storage,
or activate a vault. Source files, acquisition evidence and existing outputs are
never overwritten. A candidate is not a complete-account migration.

The adapter handles all ten acquired domains explicitly. `expenses`,
`budgets_personal` and `income_sources_personal` use the existing validated legacy
converters. Any record in `savings_goals_personal`, `savings_contributions`,
`monthly_income_records`, `monthly_savings_summary`, `budget_allocation_history`,
`monthly_setup_status` or `groupMembers` blocks backup production and identifies
the domain/document/reason in the private report. Empty domains still require
their complete query traces. Records are never dropped to make a candidate pass.

Savings is blocked because exact-owner query exhaustion does not prove historical
completeness. The retained code permits direct balance changes and separate writes
for a contribution and its goal balance. This adapter never supplies the legacy
converter's `savingsHistory.complete:true` assertion. Monthly income contains both
received-cash details and allocation summaries; monthly savings caches, allocation
history, setup progress and group membership need separate conversion and
reconciliation. They cannot become guessed native entries or opening balances.

## Command

Use an existing trusted owner-only directory (0700) and owner-only input files
(0600 recommended). The shared bounded reader rejects symlinks, hard links,
nonregular files including FIFOs, and changed/oversized input. No Firebase token
is needed for offline conversion. An explicit project, UID and source timezone
are required. The report is mandatory and contains private source identifiers.

```sh
node scripts/offline/migrate-raw-evidence.mjs \
  --source /private/export/raw.json \
  --receipts /private/export/receipt-evidence.json \
  --project penny-example --user example-user \
  --bucket penny-example.appspot.com --timezone America/Toronto \
  --report /private/export/migration-report.json
```

Add `--output /private/export/candidate.pennybackup --key-file
/private/export/recovery-key.txt` to write an encrypted candidate after clean
preflight. The recovery key uses the existing `pny1-` format; never use the public
fixture key for private data. Omit `--receipts` only when every source expense has
an absent/null receipt reference. Receipt evidence requires an explicit matching
bucket. Exit 0 means successful requested operations, 2 means blocked preflight
with a private report, and 1 means input/IO/encryption/publication failure.

The report and backup are separately exclusive publications. The report describes
preflight, not confirmation that a later backup write succeeded. When encryption
is requested, it records the SHA-256 of the exact planned backup bytes; encrypted
readback is checked before publication. Failure publishing the backup can leave a
valid preflight report. A filesystem failure after a final link can leave complete
output with uncertain durability; no CLI success is claimed. Publication reuses
the reviewed private-directory helper, with its no-concurrent-namespace-mutation
assumption. It is not descriptor-relative confinement or secure deletion.

## Validation and provenance

The adapter independently checks the retained ten-domain trace: exact queries and
owner filters, one fixed requested T, cursor direction/order, full-page continuation,
final exhaustion, document path/owner/version, response time monotonicity, counts,
probe binding, receipt references and quarantine summaries. Unknown structural
fields fail. Response timestamps may advance monotonically as the Firestore API
allows; document versions must still be no later than requested T. Raw HTTP response
bytes are absent from this export format. Consequently retained `responseSha256`
values can be shape-checked but **cannot be independently recomputed**. These local
traces and source-byte hashes are not cryptographic server attestations.

Firestore typed fields are decoded without unsafe integer coercion. Unknown fields,
unsupported value types, invalid flags, foreign/group data, refunds/negative or
sub-cent amounts, nonempty expense history, foreign currency and unsynchronized
records block. Absent/null expense type retains the existing personal default only
without group markers; explicit `isGroupExpense` must be boolean. IDs come from
document names, with a conflicting stored `id` rejected. Missing business timestamps
are not filled from document metadata. Timestamp normalization is allowed only when
exactly representable at native millisecond precision; higher precision blocks.

Internal converter-shaped pages are generated normalized data, not purported API
responses. Business validation first uses a private copy without receipt links to
avoid the old wrapper's orphan-asset error obscuring the actual rejected expense.
Only the subsequent full conversion with all links/assets supplies the candidate.
Existing converter behavior is unchanged. Description and notes remain separate;
stable native IDs, budgets and income schedule semantics are reused.

Receipt acquisition evidence must bind the exact source SHA-256, project, UID,
bucket and T. The adapter checks unchanged selected metadata, generation fields,
current-object status, original Base64, MD5/SHA-256, exact references and totals.
Tokens, arbitrary URLs and download links are not fetched. Native limits apply:
PNG/JPEG only, 2 MiB each, 100 attachments, 8 MiB aggregate. A shared original is
expanded per expense, and limits count the expanded attachment set. Original image
bytes are never recompressed or modified. Portable validation checks structure;
**native full image admission remains mandatory before live restore**.

Reconciliation checks source/native expense, budget and configured gross/net totals
with integer cents and exact record counts. The report includes expenses and budgets
by month/category, separate configured income totals and missing-net count, zero
received income (never inferred from a schedule/lastReceivedAt), receipt bytes,
original document metadata versions, source/native ID mappings, timezone and the
existing converter's provenance. It binds exact source/acquisition bytes by SHA-256.
Reports may contain private IDs, dates and cached source metadata; stdout/stderr
contain only aggregate counts and fixed status text.

Scope flags remain false for full-account migration, history completeness, Storage
snapshot consistency, native image decoding and live source reauthentication.
The source file is bounded to 64 MiB and receipt evidence to 32 MiB. Existing native
count, plaintext and encrypted-envelope caps are unchanged. This bounded converter
materializes input and candidate objects; it is not a streaming large-vault pipeline.

## Public fixtures and tests

`packages/offline-contract/fixtures/raw-migration-v1/fixture-manifest.json` records
the public key, exact hashes, expected snapshot fields/domain totals and two backups:
`positive.pennybackup` and `invalid-image.pennybackup`. The latter has valid AEAD,
valid attachment hashes and valid PNG chunk CRCs but an invalid scanline filter,
reused from the existing PNG corpus. Node accepts its limited image structure;
both native readers must reject it. No native runtime result is implied by these
fixture files. Fixed key/nonces exist only in the deterministic fixture generator.

```sh
node --test scripts/offline/migrate-raw-evidence.test.mjs
node packages/offline-contract/fixtures/raw-migration-v1/generate.mjs --verify
npx eslint scripts/offline/migrate-raw-evidence.mjs scripts/offline/migrate-raw-evidence.test.mjs packages/offline-contract/fixtures/raw-migration-v1/generate.mjs
```

The normal `offline:check` wildcard discovers these tests. Coverage includes every
unsupported domain, malformed traces/owners/cursors/totals, exact-full-page EOF,
strict financial/type/history/timestamp policy, receipt evidence substitution and
native caps, deterministic fixture freshness, encrypted roundtrip, reconciliation,
private exclusive output, failure preservation and CLI redaction. Original source
retention, real deployed acquisition, complete finance/history policy, native
admission and signed-upgrade replacement remain separate migration gates.
