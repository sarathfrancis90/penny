# Native backup crypto build tooling

This package prepares and builds the pinned libsodium dependency for the next backup implementation. **The current Penny apps do not link it, and no v4 reader/writer is enabled.** Native core operation continues without any account, network or model requirement.

## Source trust

`source-manifest.json` records the exact release archive, complete extracted-tree identity, upstream commit, public signature key and build settings. `LICENSE.libsodium` preserves the upstream ISC notice. The public `.minisig` is checked in; source archives and compiled binaries are not.

The pinned 1.0.22 archive is 2,008,529 bytes with SHA-256 `adbdd8f16149e81ac6078a03aca6fc03b592b89ef7b5ed83841c086191be3349`. Its Ed25519 file signature and signed filename comment were independently verified with Python cryptography and Node/OpenSSL against the key published in the [official installation documentation](https://doc.libsodium.org/installation). The checked-in verifier uses Node's crypto primitives and the documented [Minisign hashed signature format](https://jedisct1.github.io/minisign/#signature-format); it does not execute downloaded code to verify its own authenticity.

`prepare_source.py` first checks the archive size/digest and independently verifies its signature, then extracts bounded regular files/directories. It rejects traversal, duplicate entries, links and special files. The complete resulting tree must match the reviewed manifest before use. Output must be new: existing directories are preserved, and an interrupted output fails subsequent source verification.

```sh
# Requires Python 3 and Node 22; no Python crypto package is needed.
mkdir -p artifacts/offline/crypto
python3 packages/offline-crypto/prepare_source.py --download \
  --output artifacts/offline/crypto/libsodium-1.0.22

# Alternatively, provide the pinned archive already downloaded locally.
python3 packages/offline-crypto/prepare_source.py \
  --archive /absolute/path/to/libsodium-1.0.22.tar.gz \
  --output artifacts/offline/crypto/libsodium-1.0.22

python3 packages/offline-crypto/verify_source.py \
  --source artifacts/offline/crypto/libsodium-1.0.22
```

Download is explicit and restricted to the fixed HTTPS archive with checked length/digest; ordinary build helpers never fetch. Do not pass build outputs, generated caches or modified source to the verifier. Both native builders verify source before and after out-of-tree compilation.

`penny-tree-v1` hashes all regular files sorted by their POSIX relative names. Each entry is one ASCII JSON line containing `[path, mode & 0777, byteCount, sha256]`, with no optional whitespace and a terminating LF. Directory links, file links, special nodes and privileged modes are rejected. Counts and total bytes are bounded. File contents, membership and executable permissions are part of the identity; owner and timestamps are not. These checks detect altered inputs and stale artifacts on a trusted developer/CI host, not a compromised operating system.

## Platform builds

See [Apple](apple/README.md) and [Android](android/README.md) for explicit commands, supported paths and consumer setup. Apple builds iOS ARM64 device/simulator static libraries with deployment target 26.0 and direct Swift link probes. Android builds API26 minimal static PIC libraries for all four existing app ABIs with NDK 28.2.13676358. Its CMake helper verifies the selected archive and exported headers before linking. No wrapper or app project is automatically modified.

Actual local builds and both Apple Swift link probes passed. All four Android whole-archive ELF checks and CMake consumer links passed, including 16 KiB alignment. Source/configuration/path/header/target rejection checks are recorded in [compact build evidence](../../docs/offline/evidence/crypto-build-tooling.json) and platform evidence. These are local build proofs, not physical-device or store-artifact acceptance; the separate earlier Swift/Kotlin runtime spikes do not substitute for testing future production wrappers. Native CI explicitly prepares authenticated source and builds both platforms; [hosted commit3414197](../../docs/offline/evidence/hosted-crypto-3414197.json) passed those steps, all seven CMake consumer checks and all 87 upstream library tests. The separate app aggregate failed on two UI readiness checks and is not accepted.

Run deterministic source/signature rejection tests with `npm run offline:check`. This does not download source or build native libraries. Actual source preparation/build proof remains a separate explicit command.

## Updating the pin

Review an immutable official release and its signing-key provenance. Verify the detached signature before changing archive/tree pins; never update the expected digest merely to make a failing build pass. Regenerate the complete tree identity from that authenticated archive, retain the license, record exact toolchain/flags/artifact hashes, and rebuild both platforms. Run upstream tests plus Penny's shared/native interoperability and failure suites against the actual linked artifacts before distribution. Use advisory/release review and paired platform updates; normal builds must never resolve a moving branch.

The v4 wire draft lives in `docs/offline/BACKUP_V4_CONTRACT.md`. Experimental bounded Swift/Kotlin frame codecs and actual encrypted cross-platform results are in [prototypes/reference/EVIDENCE.md](prototypes/reference/EVIDENCE.md). The next experimental layer adds [shared logical fixtures/oracle](prototypes/reference/logical_README.md), an [Apple logical gate](prototypes/apple/LOGICAL.md) and an [Android logical gate](prototypes/android/LOGICAL.md). Native semantic and image validation remain mandatory before logical completion. These experiments do not change either app or supply durable candidate storage, restore commit, production integration, complete capacity measurements or provider transfers.
