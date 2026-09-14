# Legacy migration preflight

`scripts/offline/migrate-legacy.mjs` converts an already downloaded legacy bootstrap export into a native schema 3 finance backup. `migrate-finance.mjs` maps the additional finance domains. These tools make no network requests and never change the API or source export. A clean preflight establishes conversion of the represented records; authenticated source export, a stable source snapshot, signed Flutter upgrade and complete account migration remain release gates.

The bootstrap export shape was inspected in the user's pre-existing uncommitted API/Flutter work in the original checkout. That work is deliberately excluded from the isolated native review branch, whose retained API does not yet expose `PersonalBootstrapPage`. References below describe that inspected proposed source contract, not an endpoint confirmed in production or delivered by the native branch. The converter is preparation for an eventual verified export/bridge, not a replacement for it.

## Fixed-time raw source acquisition

[`export-legacy-raw.mjs`](../../scripts/offline/export-legacy-raw.mjs) now provides
a read-only acquisition step using an existing Firebase user ID token. It verifies
the token against the explicit project/user, obtains one server read time, and
exhausts ten exact-owner collection queries at that same time. Raw typed values,
unsupported fields, histories, group evidence, cursor traces and unresolved
receipt references are retained. The script does not depend on the proposed
bootstrap endpoint or change the retained API/Flutter work.

[Usage and limits](../../scripts/offline/LEGACY_RAW_EXPORT.md) describe private
output, strict resource/identity checks and exact scope. Nine synthetic transport
and filesystem test groups pass, including partial-query failure, unsafe output
and FIFO-token rejection. This does not establish production rules/index access
or complete account migration. The separate
[receipt acquisition adapter](../../scripts/offline/LEGACY_RECEIPT_ACQUISITION.md)
now downloads explicitly mapped current originals with complete byte/checksum
verification and unchanged before/after metadata. It never fetches source URLs.
Nine new synthetic test groups pass; no live acquisition or historical storage
consistency is established.

[`migrate-raw-evidence.mjs`](../../scripts/offline/MIGRATE_RAW_EVIDENCE.md) now
validates all ten retained query traces and converts represented expenses,
budgets and configured income sources through the existing converter. Any
record in the other seven domains blocks backup output with a private report;
source exhaustion never becomes a savings-history completeness assertion.
Exact source/acquisition hashes, receipt coverage, native capacity, integer
totals and source/native mappings are checked. Description and notes remain
separate, and configured income never becomes received cash. Root verification
passes [28 converter tests](evidence/raw-migration-validation.json).

[Native fixture proof](evidence/raw-migration-native.json) passes two affected
methods on iOS and each Android API26/37: the valid encrypted candidate restores
and reopens with its receipt, while an authenticated invalid image is rejected
before replacement. Each report names its source checkpoint. Complete finance
and history reconciliation, real-account acquisition and signed upgrade remain
open. The original converter below still accepts its own bootstrap shape;
raw input uses the separate adapter.

## Input and completeness

The inspected proposed source shape is represented by `PersonalBootstrapPage` in the original checkout's `apps/api/src/services/mobile-data.ts`. The wrapper contains:

- `exportVersion: 1` or `2`, the exact `userId` whose records were exported, and an explicit IANA `timeZone` for converting legacy instant-based dates into civil dates.
- `pages`: ordered objects containing `requestCursor` (null initially) and the exact bootstrap `response`. All four arrays (`expenses`, `budgets`, `income`, `savings`) must be present. The cursor chain must terminate with `hasMore: false` and `nextCursor: null`.
- Optional `receiptAssets`: objects with exactly `sourceExpenseId`, `mediaType` and canonical `dataBase64`. Each asset must belong to an imported expense and pass the portable receipt validator. URLs alone block conversion; the tool does not fetch arbitrary record URLs.
- Version 2 can additionally contain `savingsHistory: {complete: true, records: [...]}`. Records match the retained `SavingsContribution` contract, including original goal name, period, type, source, note, currency and creation timestamp. Every savings goal requires explicitly complete history, including an empty history where appropriate. The flag is a source-export assertion; the converter cannot prove remote completeness from a file.

Pagination watermarks are not a transactionally frozen snapshot. The inspected bootstrap code generates a fresh watermark on each page. Its savings contribution route updates the goal's balance but does not insert a contribution ledger record. Other retained web source has a separate contribution model. Therefore a bootstrap response alone cannot establish complete historical contributions. Do not manufacture missing entries or claim an authenticated complete migration from this converter.

The inspected bootstrap query also requires `expenseType == 'personal'`, while the retained Flutter model treats a missing/null type as personal. Older documents without that field can be absent from an otherwise complete cursor chain. A source exporter must reconcile those owned legacy documents explicitly and distinguish group records before claiming complete-account migration. The offline converter can validate only records actually present in its input.

## Mapping and quarantine

Expenses preserve description and notes as separate fields. Missing or null expense type follows the retained Flutter personal default only when all group markers are absent. Instant dates are converted using the explicit source timezone; their original values and source/native ID mappings are retained in the optional provenance report. Receipt bytes remain unchanged.

Instant conversion uses an explicit Gregorian era and rejects local dates outside AD years 0001 through 9999. A timezone crossing into the preceding BCE year cannot be relabeled as AD year 1. Civil date strings already inside the supported range are preserved directly.

Budgets preserve category/month, limit, rollover, threshold to exact basis points and notification preference. Income sources preserve gross/net amounts, currency, taxability, recurrence configuration, active state, description and timeline. A last-received timestamp is historical metadata and never invents an actual cash receipt. Native received-income entries start empty because this bootstrap source has no received-cash ledger.

Savings opening balance equals the legacy current balance minus complete imported contributions. Negative opening balances, withdrawals, sub-cent amounts and conflicting caches block conversion. Progress caches are compared to the legacy rounded two-decimal calculation using integer cents. Remaining months and the retained source's 90-percent monthly on-track calculation are checked at the explicit conversion time. Original cached values are preserved in the provenance report; they are not installed as authoritative native balances. Native progress uses its documented floor-to-basis-points calculation. A stale or conflicting source cache is quarantined for review.

Missing pages, duplicate IDs, ownership mismatches, group data, unsupported currency, unknown fields, unsynchronized writes, nonempty expense history, incomplete savings history or invalid native references prevent creation of a replacement backup. No conversion silently rounds money or discards an unsupported record.

Profile/preferences are explicitly excluded and reported. Defaults for absent legacy optional flags follow the inspected Flutter models: budget rollover false, threshold 80%, notifications true; income recurring false, active/taxable true; savings active status, active true and medium priority. Explicit values of the wrong type are rejected. Missing income/savings currency uses the legacy CAD default; an explicit different currency is rejected.

## Commands and local output

Preflight prints aggregate counts and totals, never merchants, notes, receipt text, source IDs or recovery keys:

```sh
node scripts/offline/migrate-legacy.mjs /absolute/path/export.json
```

Save an owner-readable reconciliation/provenance report, including unresolved record IDs, without creating a backup:

```sh
node scripts/offline/migrate-legacy.mjs /absolute/path/export.json \
  --report-output /absolute/path/migration-report.json
```

Create an encrypted backup after clean preflight, using a recovery key already saved securely:

```sh
node scripts/offline/migrate-legacy.mjs /absolute/path/export.json \
  --output /absolute/path/migrated.pennybackup \
  --key-file /absolute/path/recovery-key.txt \
  --report-output /absolute/path/migration-report.json
```

The key file uses the `pny1-` format specified in the backup contract. Never use a public fixture key for real records. Backup and report outputs use owner-only permissions and refuse to overwrite existing files. Files are synchronized before publication. The report is a local readable JSON document containing source IDs and historical dates/caches; keep it protected alongside the original export. It includes a SHA-256 of the parsed source's JSON representation, not a claim about the original file's byte encoding.

Malformed-input errors do not echo raw financial content. An unresolved export returns a nonzero exit status and cannot create a replacement backup; a requested report can still identify the unresolved records. Retain the original export and report until native restore validates all domain counts and balances and the signed upgrade path is verified.

Validation is included in `npm run offline:check`. Synthetic tests exercise exact cents, dual notes, civil dates, cursor completeness, source ownership, independent income cash semantics, savings balance/history reconciliation, cache conflicts, invalid fields, encrypted CLI output, provenance permissions, no overwrite and source immutability. Passing these tests is not evidence of authenticated export or production migration.
