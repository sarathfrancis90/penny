# Read-only Firestore raw evidence exporter

This tool exports a bounded, explicit set of **owned Firestore queries**, at one
server-selected `readTime`. It is not a full account export, native backup,
`PersonalBootstrapPage`, completed migration, or receipt download. Existing
converters and API/Flutter/rules sources remain unchanged.

Run from the repository with Node.js 22 or newer; no installed package dependency is needed. Supply
an existing Firebase **user ID token**, not an OAuth/service-account/custom token,
in a private regular 0600 file. Project and user are mandatory and must match
verified token claims. There is no login, refresh-token, Admin data-access or
write API. Token provisioning remains a separate user-authorized step.

```
node scripts/offline/export-legacy-raw.mjs --project YOUR_PROJECT --user YOUR_UID --token-file /private/path/id-token --output /private/path/evidence.json
node --test scripts/offline/export-legacy-raw.test.mjs
```

The token file must be owned by the current Unix user, unlinked elsewhere and
not a symlink. Nonblocking open lets the regular-file check reject FIFO inputs
without waiting for a writer. Reads allocate at most 16 KiB + one detection byte and reject
size/time changes. The output directory must already exist, be owned by that
user with no group/other permissions, and have a canonical path without symlink
ancestors. Token/output storage and their containing paths are trusted private
contexts with **no concurrent namespace mutation**. Publication uses path-based
operations plus identity checks, not descriptor-relative race-proof confinement.
A 0600 exclusive staging file is synced and published with an exclusive hard
link, then the directory is synced. Existing output/symlink names are refused.
Network/query failures publish nothing; a filesystem error after final linking
can leave a complete output with uncertain durability. The CLI reports failure,
not success, in that case. Treat any staging residue as incomplete evidence.
The output contains sensitive raw finance and receipt URLs, is **not encrypted**,
and must remain in private storage; it contains no authentication token.

## Exact acquisition scope

Every query uses `userId == verified uid`, ordering by full `__name__`, with
exclusive name cursors. Querying only `expenseType == personal` would omit
older owned expenses whose type is absent, so this tool deliberately keeps
those documents and group-associated owned documents for review.

The fixed collection allowlist is `expenses`, `budgets_personal`,
`income_sources_personal`, `savings_goals_personal`, `savings_contributions`,
`monthly_income_records`, `monthly_savings_summary`, `budget_allocation_history`,
`monthly_setup_status`, and `groupMembers`. Every returned document must match
the exact project/database/collection path and owner. This is necessary because
several checked-in legacy list rules permit any authenticated list request.
Group memberships, group-associated rows and ambiguous expense types are
flagged, not silently dropped or converted. Raw histories and cached summaries
remain evidence; they never become fabricated contributions, income received,
opening balances or totals. Unknown source fields are retained with their
Firestore typed values; integer strings retain all 64 bits. Unknown protocol
value kinds, malformed values, duplicate JSON members or bad ownership fail.

A one-document expense probe obtains T; the exporter discards that probe as a
source of collection completeness and rereads **every** collection at T. Empty
probe responses still need a server read time. Every page includes exactly the
same request `readTime`; a short page exhausts that query, while a full page
requires the next exclusive cursor query. Response read times must be present
and nondecreasing within a stream, and cannot precede T. They may be later than
T: the API documents monotonic response times, not equality with the request
selector. Returned document creation/update versions must be no later than T.
All requests, full typed response frames, response hashes/byte counts and cursors
are recorded; actual query exhaustion is distinguished from account completeness.

The standard REST historical window is one hour (the tool uses no PITR mode).
A 15-minute export deadline, 30-second per-request timeout, 100-document pages,
1,000 total query requests including the probe, 50,000 documents, 4 MiB response
and 32 MiB cumulative response limits are conservative acquisition limits,
independent of native product capacity. Oversize, token expiry, denied/missing
index/unavailable query, malformed or truncated response, absent/backwards read
time and cursor anomalies abort the entire export. No skipped collection is
marked complete. Certificates are freshly fetched from Google's fixed endpoint;
Node standard crypto performs RSA PKCS#1 v1.5 SHA-256 signature verification
against the selected official public key, with explicit issuer,
audience, subject, expiry, issued-at, optional not-before and authentication-time checks. Every data
request also goes through Firebase ID-token authorization and current rules.
No local revocation check, live rules/index equivalence or App Check deployment
compatibility is claimed. Those are real-environment validation dependencies.
Redirects are rejected; neither auth nor response bodies are printed. CLI logs
contain only aggregate counts and fixed diagnostic text.

## Receipt and migration boundary

`receiptReferences` retains the exact typed `receiptUrl` and source document name
with `unresolved_not_downloaded`. No URL is fetched, followed, logged, treated as
proof of ownership or converted into local bytes. Firebase Storage has a separate
consistency boundary from Firestore T. A future receipt adapter must authenticate
the explicit bucket and canonical `receipts/<uid>/<single-name>` object, acquire
bounded bytes with generation evidence, reject changed/missing/unsupported
objects, and separately prove native image compatibility. Legacy storage permits
images below 10 MiB; native receipt limits are 2 MiB each/8 MiB total. Acquisition
must not silently truncate or optimize originals to make migration pass.

`scope.ownerQueriesExhausted` means only that these ten exact queries completed
at T. Other owners' group records, other collections/subcollections, device-only
or unsynced records, and all receipt bytes are explicitly outside scope. Existing
migration conversion cannot consume this format directly. A separately reviewed
adapter and completeness/finance reconciliation are still required before any
native replacement. No service, rules, deployed collection or real user data was
accessed during implementation tests.

## Sources and validation

Firebase documents [ID-token REST authorization](https://firebase.google.com/docs/firestore/use-rest-api),
[runQuery fixed-time requests and monotonic response times](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery),
and [token verification constraints/public certificates](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
Direct authenticated Storage download remains a future adapter; the
[official download guidance](https://firebase.google.com/docs/storage/web/download-files)
distinguishes SDK bytes/streams from URL access.

Tests use generated synthetic RSA keys and fake HTTP responses only. They cover
pagination, exact typed value preservation, group/receipt quarantine, missing and
monotonic/backwards read times, document versions newer than T, wrong identity,
wrong signature/audience/expiry, partial/unavailable queries, duplicate rows,
HTTP limits/redirects/deadlines, private token files, FIFO rejection and exclusive output. They
establish client behavior, not production authorization/index availability or
Firestore/Storage end-to-end migration completeness.
