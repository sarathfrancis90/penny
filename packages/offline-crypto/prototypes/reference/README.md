# Experimental v4 frame reference

This Python ctypes oracle calls the pinned libsodium implementation for
HKDF-SHA256 and secretstream. It independently checks the draft's byte framing,
AAD, sequence/length bounds, MESSAGE/FINAL rules, authentication and strict EOF.
It returns only a digest/count summary after complete frame verification. It has
no logical record validator, restore transaction, cloud transport or production
writer. A successful result must never authorize an import or expose a preview.

The files are development tools for **public fixtures only**. `frame_oracle.py`
uses normal upstream randomness by default; `fixtures.py` explicitly enables a
test-only deterministic randomness implementation for exact golden regeneration.
No cryptographic primitive is reimplemented. The public byte generator hashes the
fixed label `PENNY-PUBLIC-V4-FIXTURE-RNG:1\0` and the ASCII fixture name, then hashes
that seed with a big-endian 64-bit counter. Each callback request consumes whole
32-byte blocks and discards its unused suffix. The upstream pinned API call
sequence determines the output, which is checked against committed hashes.

From the repository root, with the pinned source already prepared through the
common dependency tooling, run (both builder paths must be absolute and the
output directory must be new):

```sh
python3 packages/offline-crypto/prototypes/reference/build_reference.py \
  --source "$PWD/artifacts/offline/crypto-source/libsodium-1.0.22" \
  --output "$PWD/packages/offline-crypto/prototypes/reference/.build/host" \
  --check
python3 packages/offline-crypto/prototypes/reference/fixtures.py verify
python3 -m unittest discover \
  -s packages/offline-crypto/prototypes/reference -p test_oracle.py -v
```

The first command accepts the actual prepared source directory at `--source`;
the path shown is an example. It performs no download and verifies that tree
against the shared source manifest before and after building. `--check` runs
upstream `make check`, requires every reported test to pass without skips, and
records the counts alongside library SHA-256 in `build-result.json`. This is a
host library build, not Apple/Android distribution evidence.

`fixtures.py verify` is read-only: it regenerates candidate bytes in memory and
compares every manifest field, all four committed files and all 28 negative
recipes. To use a different host build, put
`--build-report /absolute/build/build-result.json` before `verify`. Unit tests use
the default `.build/host` report. The loader checks the report's source pin,
library SHA-256, version and expected API sizes before invoking that library;
the build report itself is trusted local build input, not an untrusted archive.

Native tests can materialize the negative recipes to a new ignored directory:

```sh
python3 packages/offline-crypto/prototypes/reference/fixtures.py materialize \
  --output packages/offline-crypto/prototypes/reference/.build/negative-files
```

This also verifies the committed positives and writes `negative-manifest.json`
with per-case filenames, public reader keys, hashes and expected rejection.
Re-running materialization requires a new destination; it does not overwrite
existing results. `fixtures.py generate` deliberately rewrites goldens and is
reserved for reviewed draft/vector changes, never a CI verification step.

To independently verify a native public export, supply the expected plaintext
length and digest from the corresponding pattern fixture in the shared manifest:

```sh
python3 packages/offline-crypto/prototypes/reference/frame_oracle.py verify \
  /absolute/path/native-full-final.pennyframe \
  --expected-bytes 1048576 \
  --expected-sha256 631b84027d6b9e52b539c4e8373622d23032dfadc64d60af87339c9037e4f769
```

The CLI uses only the public `07` fixture root. Native writers use fresh real
randomness, so their ciphertext hashes differ; plaintext hashes must match.
No private/user archive should be supplied to these fixture tools.

Tests cover fragmented reads, exact digest/count agreement, all negative recipes,
rejection of oversized unsigned declarations before reading their bodies,
reserved prefix/EOF handling, and an input failure after an authenticated prefix.
They do not qualify the maximum 640 MiB frame stream or Profile A's logical
capacity. Native cancellation, sink ownership/rollback and runtime behavior
need separate native tests. Neither these tools nor their evidence freeze v4.

[`verification-evidence.json`](verification-evidence.json) records the local
upstream test counts, source/library/fixture hashes, focused source scan and
independent verification of native runtime exports. Large native captures and
raw build/test logs stay in the referenced ignored build directories. Recreate
those exports with the respective native prototype harnesses; their fresh
randomness produces different ciphertext hashes on a later run.
