# Public logical-v4 fixtures

These are unencrypted experimental plaintext streams for the draft logical record
layer. They are not authenticated backups or accepted restore candidates.

`fixture-manifest.json` contains ten positives and sixty malformed cases, each with
`name`, `file`, `layer`, `expected`, a deterministic `recipe`, exact plaintext size
and SHA-256, `frameSizes`, and `finalFrame`. Rejections also record an oracle
diagnostic `expectedError`; native implementations need to reject, not reproduce
that vocabulary. `layer` distinguishes structural from inherited schema3 semantic
checks. Implementations missing a required layer must explicitly report skipped
cases and why, rather than count those cases as passing.

Only three small streams are committed: empty ledger, one receipt and all finance
domains. Recipes materialize the complete corpus, including real 1 MiB split
domain/END headers and END payloads, 10,001 expenses, aggregate money overflow,
typed reference/ownership failures, order/count/transcript defects, duplicate and
escaped-equivalent JSON members and exact-number edges. Valid JSON whitespace
pads split-boundary records within the per-record 65,536-byte bound.

Ordinary cases can be sealed by an experimental native frame writer and admitted
through the authenticated reader plus logical parser. `end-in-message` is special:
its single full-sized plaintext frame contains a complete empty ledger END followed
by padding and has `finalFrame=false`. Feed it as MESSAGE through the authenticated
frame callback or construct that tag with the fixture cryptographic harness.
The logical parser must reject when END completes in MESSAGE. A canonical writer
would otherwise label a single full-sized frame FINAL, changing this test's premise.

The reference image check is structural only; full native receipt decoding is
required separately and must not be inferred from these plaintext fixtures.
See [logical_README.md](../../../offline-crypto/prototypes/reference/logical_README.md)
for read-only tests, verification and materialization commands.
