# Experimental Swift v4 frame codec

This is an isolated experiment implementing the authenticated **frame** layer of
`docs/offline/BACKUP_V4_CONTRACT.md`. It is not linked into Penny iOS. Successful
decryption authenticates a nonempty byte stream; it does **not** establish a valid
Penny ledger, receipt archive, or restore candidate. No production format,
capacity, dependency, schema, migration, or legacy reader changes occur here.

`Sources/V4FrameCodec.swift` calls pinned libsodium 1.0.22 HKDF-SHA256 and
secretstream directly through the verified Apple module map. Header and AAD are
exact contract bytes. The writer uses fresh SecRandom salt and the upstream
random secretstream header on every call; there is no deterministic RNG hook,
saved state, or resume operation. Only full MESSAGE frames and nonempty FINAL
frames are accepted, including a full last FINAL at exact chunk multiples. A
FINAL must be followed by actual EOF. Declared lengths, unsigned encodings,
sequence, frame count and total byte budgets are checked before body allocation.

Native key buffers and the correctly aligned FFI state have one call owner and
are wiped/freed on every exit. Frame plaintext is wiped on a best effort basis.
Swift String/Data copies and framework temporaries cannot be guaranteed erased;
this experiment makes no managed-memory zeroization claim.

Input pulls are at most 64 KiB. Plaintext and ciphertext working buffers are each
bounded by one 1 MiB frame plus the 17-byte cipher overhead. Encryption uses a
one-byte lookahead, including at EOF, so it does not buffer a second plaintext
frame. Data copies remain bounded; no peak-RSS or 640 MiB throughput claim has
been established. All APIs are synchronous and belong on a background worker;
the codec checks cancellation around I/O, native calls and completion. Inputs
remain caller-owned and must be closed by the caller.

The plaintext sink must consume in memory or stage encrypted, isolated data.
It must never activate records or persist plaintext. Authentication of an early
frame is provisional: any later authentication, I/O, finality, sink or
cancellation failure calls `discard()`. `finishFrames` is also provisional and
must remain reversible until the later logical layer approves a candidate.
Ciphertext file output uses exclusive 0600 creation, complete file protection,
backup exclusion, sync/close, and inode-checked cleanup. The parent directory
must already be private and owned; the source generation must be pinned by its
caller. No wire bytes become filenames. This wrapper is not a production atomic
restore or publication transaction.

## Reproduce the simulator tests

First run the common verified-source Apple builder documented in
`../../apple/README.md`. Materialize the reference negative fixtures using the
reference prototype. Then select an **owned, shutdown** iOS simulator:

```sh
python3 packages/offline-crypto/prototypes/apple/run.py \
  --apple-build apps/ios/.build/crypto-build-validation/apple \
  --negative-fixtures packages/offline-crypto/prototypes/reference/.build/negative-files \
  --output packages/offline-crypto/prototypes/apple/.build/validation-02 \
  --simulator F70A4E8F-78ED-4E96-85E6-0EAEB6D34088
python3 packages/offline-crypto/prototypes/apple/check_runner.py
```

Requires local Xcode and `/opt/homebrew/bin/xcodegen`, Python 3.11+, and the
existing build report, headers/module map and static library. The runner checks
the report's source pin against the common manifest, enforces the exact installed
header inventory (including rejection of file/directory symlinks), and rehashes
all installed Apple artifacts and every input fixture. This detects stale/damaged local
artifacts; the report is local build evidence, not a signed binary attestation.
It does not fetch dependencies or rebuild libsodium. Paths use ASCII letters,
digits, underscore, hyphen, dot and slash only, including resolved paths. Process
calls use fixed executables and argument arrays with `shell=False`. Output must
be new and inside this experiment's ignored `.build`. The chosen simulator is
booted and shut down by this run; known demo/Flutter CI devices are rejected.
Those two local deny entries are convenience guards; the caller's explicit
selection of an owned, available, shutdown simulator remains required. Add
`--preflight-only` to verify inputs and idle simulator without creating output
or changing simulator state.

Generated project, source snapshot/hashes, commands, logs, `.xcresult`, summary
and original XCTest attachments stay in the output directory. The two native
ciphertexts and JSON metadata are preserved as XCTest attachments for an
independent implementation to decrypt. Native ciphertext is intentionally
different on each run because salt and stream header are random. Only the public
fixture key `pny1-` followed by `07` repeated 32 times is used in these tests.

See `EVIDENCE.md` for the completed simulator gate and outstanding boundaries.
The separate experimental incremental logical parser and mandatory native
validation sink are documented in `LOGICAL.md`; their tests run only with
`--logical-fixtures` and do not change the frame-only API's success meaning.

For the focused Android-to-Swift runtime check, add
`--native-manifest packages/offline-crypto/prototypes/android/.build/validation-api37-01/native-exports/native-manifest.json`
and choose a fresh output directory. This mode validates and copies the two
immutable native ciphertexts, records their manifest digest, compiles the extra
`InterchangeTests/V4NativeInterchangeTests.swift`, and runs only that XCTest.
The ordinary 15-test source snapshot and earlier evidence remain separate.
