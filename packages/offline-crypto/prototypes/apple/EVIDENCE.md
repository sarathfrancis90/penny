# Swift frame prototype validation

Completed 2026-09-13. Scope: experimental frame encoding/authentication only.

## Actual iOS simulator gate

`run.py` generated and compiled a separate hostless XCTest bundle with Xcode 26.6
(17F113), Swift 5 mode, deployment target iOS 26.0, and the previously verified
libsodium 1.0.22 minimal static simulator build. The run used the explicitly owned
iPhone 16e simulator `F70A4E8F-78ED-4E96-85E6-0EAEB6D34088`, arm64, iOS 26.4.1
(23E254a). It began shutdown and the runner shut it down again. Demo and Flutter
CI simulators were not used.

**15 XCTest methods passed; zero failed, skipped or expected failures.** The
xcresult interval was 10.957 seconds (test-session interval, not a throughput
benchmark). There were no Swift compiler errors or warnings. Xcode emitted its
ordinary missing-AppIntents metadata warning for this non-AppIntents bundle.

Evidence under `.build/validation-01/`:

- `Frames.xcresult`, `test-summary.json`, `xcodebuild.log`.
- `provenance.json`: exact build/test/simulator commands, source snapshot hashes,
  selected device and input library/source pin.
- `Sources/`, `Tests/`: source snapshot actually compiled.
- `attachments/`: original XCTest attachment files and export manifest.
- `native-exports/`: copies normalized to their fixture names, with original
  metadata and ciphertext size/SHA-256 rechecked after extraction.

The tests cover single-byte through full-chunk FINAL, full and partial final
boundaries, forced short reads, bounded input requests, fresh random headers,
legacy recovery-key trimming/rejection, every header/frame-header/ciphertext byte
mutation in a small file, truncation at every small-file offset, trailing bytes,
hostile unsigned lengths and sequences before body reads, reordered/duplicated
frames, cross-archive splicing, a missing final frame, early authenticated frames
discarded on late corruption/I/O failure, source over-read and unstable EOF,
source/sink/finish failures, cancellation after appends/writes and within both
finish callbacks, existing-file collision, symlink refusal and closed input.

The simulator independently decoded all four reference goldens (empty ledger
layout, one receipt layout, full FINAL, multi-frame) and rejected all 28 generated
negative recipes from the shared fixture manifest. Their logical contents were
**not** admitted as a ledger: only frame sizes/counts/hash/authentication were
checked. Test-only in-memory fixtures are at most a few MiB; the codec and real
file paths stream bounded chunks.

## Independent verification of Swift output

The contract agent independently decrypted both actual simulator-produced files
using the pinned host ctypes reference implementation and checked exact native
metadata hashes and the `i % 251` plaintext pattern. Both passed. The Swift writer
uses normal random salt/header creation; no oracle test RNG hook is linked into
the Swift process. The public fixture root key is `07` repeated 32 bytes.

| Native export | Plaintext bytes | Frames | Ciphertext bytes | Ciphertext SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `native-full-final.pennyframe` | 1048576 | 1 | 1048679 | `99cf5a5dc377f82d86213a16b0d910421c02e40e78c4c65509dea8807fa0f0b6` |
| `native-multi.pennyframe` | 2097189 | 3 | 2097358 | `bcf9deec58c60709ff37258c02e3c9e850893462cafcd90ed1ed9f0e33029ccf` |

Plaintext hashes respectively:
`631b84027d6b9e52b539c4e8373622d23032dfadc64d60af87339c9037e4f769`
and `d4a6a5c160293ee7f0ac94b89193501ce4f4ca3405a6ee625bace8b1f79fe873`.

Installed static library SHA-256:
`fc5bf957e4d857a492af799a26328ceaa06754681d9590deee66aa0bdf58b549`.
Source tree pin:
`2871798a902683da8f5767ab32920d5e04ee7fc89cf8eedeeb7e2fe48e8e9407`.
Compiled source hashes:

- `Sources/V4FrameCodec.swift`: `7cdebf355eeaf2c5be570443adad09c0b6f2d457914a44a7968dc1e61c2a9bca`.
- `Sources/V4FrameFiles.swift`: `fef8d74f16ee7b22aceaa6230d340a936d7293a0b4ecae4025839f66928ad350`.
- `Tests/V4FrameTests.swift`: `a6a6434114a2d9a8191bc1e0daf577e2f98dd135a9a44588f32d17d3e2426088`.

After the simulator run, the runner gained resolved-path character checking and
exact installed-header inventory checking to prevent include shadowing.
`python3 packages/offline-crypto/prototypes/apple/check_runner.py` passed 5/5
boundary tests: shell syntax rejected without output/marker creation, symlink to
an unsupported path rejected, and reserved simulator rejected before any
process or output mutation; an unrecorded `include/stdint.h` was rejected through
the CLI preflight before any process/output mutation; file and directory symlinks
under the include path were rejected. The existing verified library also passed
the new read-only preflight. Runtime Swift source was unchanged after its pass.
The independent oracle record is in
`../reference/verification-evidence.json`.

## Actual Android-to-Swift runtime interchange

A separate focused XCTest **passed 1/1, zero failed/skipped** on the same iOS
26.4.1 arm64 simulator. It imported the two immutable Android API37/arm64-v8a,
16 KiB page runtime exports under
`../android/.build/validation-api37-01/native-exports/`. The runner verified
ciphertext sizes/hashes before copying and the Swift sink checked every
plaintext byte against `i % 251`, plus exact plaintext SHA-256, byte sizes,
frame count and successful final/EOF completion.

- Android full-FINAL ciphertext SHA-256:
  `652369e1f99f762aae3f63c3953e01d831d1d48c5231e03cae8123e04bf47ad4`.
- Android multi-frame ciphertext SHA-256:
  `4cce4c01a5122a4a3e89aa172d6789347eb0dabb09615cb47498ca27b13b44b2`.

Evidence: `.build/interchange-01/{Frames.xcresult,test-summary.json,provenance.json}`
and immutable input copies under `.build/interchange-01/Fixtures/Native/`.
The provenance includes the native manifest digest and actual compiled source
hashes. The session interval was 9.145 seconds. Only the focused interchange
test ran; the earlier 15/15 suite and exports were not regenerated or modified.
The runtime codec source remains identical to the passing earlier snapshot.

## Remaining gates

This is not production adoption or a format-freeze approval. Pending work
includes the logical record parser, JSON/type/order/count/ownership/image and
aggregate profile validation, encrypted candidate storage, pinned generations,
atomic restore/rollback with state guards, legacy dispatch integration, cloud
transport, and app lifecycle/background integration. No physical-device run,
full 640 MiB/640-frame boundary run, peak RSS measurement, disk exhaustion,
process kill, device-lock/file-protection or production concurrency validation
was performed in this slice. Caller input ownership and sink isolation are
explicit API obligations. The reference oracle exchange and Android-to-Swift
runtime import establish the frame paths recorded here. Reverse-direction
runtime import is reported separately by the Android prototype agent.
