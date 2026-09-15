# Experimental logical gate

`LogicalSources/V4LogicalGate.swift` incrementally parses the normative draft
record stream **only through `V4FrameCodec.open`**. The private parser cannot be
constructed by callers with synthetic final/EOF events. It returns a gate
summary after strict EOF and mandatory sink validation. It does not return a
persisted candidate, install a vault, authorize a restore, or freeze v4.

The gate retains a nine-byte partial record header, at most 65,536 JSON bytes,
per-kind prior UUIDs and small counters. It streams raw receipts in chunks of at
most 65,536 bytes. It validates record kind/order, strictly increasing canonical
UUIDs, exact closed JSON shapes (including schedule/count objects), native strict
UTF-8/duplicate/depth rules, exact integer tokens, BEGIN identity/profile/bounds,
receipt pairing/length/SHA-256, transcript, observed/declaration reconciliation,
and END's final byte at the end of the FINAL frame. Policy metadata accounting
includes BEGIN/END and every header; declared body accounting excludes complete
BEGIN/END records and raw payloads. Those distinct totals appear in the summary.

`V4LogicalValidationSink` is mandatory and has no permissive default. Validated
BEGIN metadata is immutable and supplied before records. The sink must validate
per-object and cross-domain semantics and complete native image decoding while
keeping all work isolated. Even its finish callback is reversible: failure,
cancellation during finish, a later bad frame or trailing file bytes discards
the operation. Only `finishFrames`, invoked by the frame codec after EOF, can
invoke `finishLogical`. There is no frame-only success shortcut in this API.

`V4NativeValidationSink` is the experiment's validation-only implementation.
It reuses frozen stateless native model/date/finance/strict-JSON/PNG/ImageIO
validation helpers from `LogicalSupport/`. It keeps typed source/goal/template/
expense IDs, budget category-month pairs, recurrence occurrence pairs and checked
financial totals. These indexes inherit the gate's profile cardinality limits;
no expense/finance object graph is retained. It holds only one receipt up to
2 MiB for the inherited complete native image decode, with dimensions/pixels
checked before raster creation. Existing per-object limits and schemas are
retained; old whole-snapshot caps are never invoked. The original native app is
unchanged, including its existing capacities.

`LogicalSupport/source-provenance.json` records original source and frozen-file
SHA-256. The extracts contain stateless helpers only: no VaultSnapshot, vault
store, app lifecycle, live database, Keychain, cloud or mutable production state.
This copy is deliberate experimental isolation and requires an explicit diff
before future resynchronization/adoption. `V4ExactNumbers` rejects fractional
tokens that Double could round into an integer; exact decimal/exponent integer
forms and mathematical negative zero remain allowed. Raw transcript bytes are
never normalized.

## Reproduce

With the pinned Apple library and reference fixtures already materialized:

```sh
python3 packages/offline-crypto/prototypes/apple/run.py \
  --apple-build apps/ios/.build/crypto-build-validation/apple \
  --negative-fixtures packages/offline-crypto/prototypes/reference/.build/negative-files \
  --output packages/offline-crypto/prototypes/apple/.build/logical-next \
  --simulator F70A4E8F-78ED-4E96-85E6-0EAEB6D34088 \
  --logical-fixtures packages/offline-crypto/prototypes/reference/.build/logical-fixtures-v2
```

This mode verifies every logical fixture's size/hash, copies the frozen support
and logical code into the isolated test bundle, and runs only `V4LogicalTests`.
It seals fixture plaintext through the real random native frame writer, then
feeds the resulting file through the frame reader and mandatory native sink.
For the END-in-MESSAGE case it adds one final byte to ensure the first full
chunk is an actual MESSAGE frame. Fixture plaintext and hashes remain immutable.

## Completed evidence and limits

`.build/logical-05/` contains the final source snapshot, source hashes, fixture
manifest hash, complete commands/logs, `Frames.xcresult` and `test-summary.json`.
On the owned iPhone 16e iOS 26.4.1 arm64 simulator, **6/6 XCTest methods passed,
zero failures/skips**, including all **10 positives and 60 negatives** from the
v2 reference corpus. The initial immutable `.build/logical-01` capture covered
the earlier 7-positive/58-negative corpus. The final run took 13.32 seconds by
xcresult session timestamps; this is not a capacity/performance benchmark.

The final corpus includes valid native PNG receipt decoding, every domain,
10,001 expenses without invoking the old 10,000 cap, split record and END
headers/payloads, structural and semantic rejections, exact decimal/exponent
integers, negative zero, and huge positive/negative exponents on zero. Added
tests reject rounded/tiny nonzero fractions and exercise BEGIN callback failure,
finish cancellation and bad final authentication after a validated BEGIN.
Both `false` and `true` counts are separately rejected before the BEGIN callback.
Every negative requires sink discard, cleared identity and no completion.

Final fixture manifest SHA-256:
`95a2c085a8b59652f9cb16e38fe3adcee39d1e8e839663cab5d7c97c47de5c32`.
Gate source SHA-256:
`2301f5f22dac28d7f417eac5a1da9b5a88ce43a6f6d8369966f399505ac369be`.
Sink source SHA-256:
`35ca217c9ffc772009091274e34682d64756fd20a709fcd901d3707534b74108`.

This demonstrates the recorded parser and native semantic paths. It does not
provide a logical writer, durable encrypted candidate storage, sealed-input
digest binding, preview/commit leases, rollback/reopen, recovery-key/account
epochs, process-death cleanup, disk exhaustion handling, or app integration.
No physical-device, full profile capacity, peak-memory, locked-device or
production scheduling tests were run. Managed JSON/model/image/base64 copies
are bounded by record/receipt limits but are not guaranteed erased. Sink indexes
and a decoded image still require memory measurements at target capacity.

The final lifecycle regression makes the native sink single use. An attempted
BEGIN reserves it permanently; completion and discard consume it. No later
BEGIN can reset it or reuse its typed indexes. Tests first import a valid
archive, then try the same sink with independently reframed/rehashed archives
that omit all expense owners or income sources while retaining their referring
records. Both second imports fail before the BEGIN callback. The same sink
also refuses a subsequent valid archive and reuse after BEGIN failure/discard.
Fresh sinks reject the orphan archives as semantic failures.

The final exact-source run also includes removal of two trailing blank lines
from the frozen Expense/GregorianDay helper extracts. Their provenance hashes
were refreshed; all six logical tests passed again. No behavior changed.
