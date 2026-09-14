# Experimental Android v4 frame codec

This isolated Kotlin/JNI probe implements the authenticated frame layer of
[`BACKUP_V4_CONTRACT.md`](../../../../docs/offline/BACKUP_V4_CONTRACT.md). It
also has an incremental logical parser with a mandatory isolated validation sink,
described in [LOGICAL.md](LOGICAL.md). It has no production restore candidate, cloud
transport, recovery-key UI, or legacy dispatch. A successful frame decode cannot
authorize a restore. The production apps, portable schemas and current limits
remain unchanged; the draft format is not frozen or enabled.

`FrameCodec.encrypt` and `decrypt` accept a caller-owned 32-byte recovery root,
`InputStream`, `OutputStream`, and one-shot `FrameCancellation`. They own and close
both streams on every return/failure. The caller must wipe its recovery root and
use an isolated disposable candidate sink. Early authenticated frames can reach
the sink before a later failure; **only the return value means frame completion**,
and that still requires separate logical validation before any commit. No bytes
from a frame reach the sink before its complete authentication and tag validation.

The implementation delegates HKDF-SHA256 and secretstream to pinned libsodium
1.0.22. It binds the exact header, sequence and ciphertext length into AAD, allows
only full MESSAGE chunks and nonempty FINAL chunks, accepts a full-sized FINAL,
and requires actual underlying EOF. Each encryption attempt gets fresh native
random salt and stream header. State cannot resume or rewind. Length checks
precede payload reads and JNI copies; observed totals are bounded to 640 frames,
640 MiB plaintext and 768 MiB wire. Empty input and all non-v4 headers fail.

Each side holds a 1 MiB plaintext buffer and a 1 MiB + 17-byte ciphertext buffer.
JNI copies only one frame into temporary bounded vectors, and I/O requests use
32 KiB chunks. The writer uses one byte of lookahead, so exact multiples need no
empty FINAL. No whole-archive array, plaintext staging file or archive-size index
is used by the codec. Native keys/state/temporary buffers are explicitly wiped;
managed buffers are cleared best-effort, which is not a managed-runtime erasure
guarantee. Callers must keep the supplied root stable during the operation.

JNI handles are monotonically allocated registry IDs, never addresses. Lookup,
use and removal share one mutex; use is confined to the creating thread, while
close can run on another thread. IDs are never reused, active handles are capped
at 64, and every native error or FINAL removes the state. Close is idempotent.
The public stream methods clean up in `finally`. Cancellation closes both streams
and checks at I/O boundaries, flush and close; it interrupts blocking I/O only
when those streams cooperate with `close()`. Arbitrary uninterruptible streams
need an external transport-specific cancellation mechanism. JNI diagnostics in
this probe are not a production FFI API.

## Build and run

The probe identity is `ca.penny.v4frameprobe`, with no activities, network
permission or vault access. Its test identity is `ca.penny.v4frameprobe.test`.
The build uses the existing pinned Gradle wrapper, Java 17, SDK 37, CMake 3.22.1
and NDK 28.2.13676358/API 26. All four existing ABIs are included. C++ runtime
linkage is static. The common Android CMake consumer verifies installed sodium
archives and headers and applies 16 KiB link alignment.

First prepare/build the pinned dependency following
[`../../android/README.md`](../../android/README.md), and materialize the reference
negative fixtures following [`../reference/README.md`](../reference/README.md).
The negative input directory must contain `negative-manifest.json` and its 28
files; the build stages only those asset types, excluding the duplicate positive
manifest. The four shared positive files come directly from `offline-contract`.
Opposite-native testing also requires the two Swift runtime export files and
`native-fixture-manifest.json` produced by the Apple prototype. The build fails
if either fixture input is missing; none of these tests silently skip.

From the repository root, set the three input paths to their actual absolute
locations (the examples below are the local qualification paths):

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PENNY_SODIUM_BUILD="$PWD/artifacts/offline/crypto-android-build-validation/build-all-abis"
export PENNY_FRAME_NEGATIVES="$PWD/packages/offline-crypto/prototypes/reference/.build/negative-files"
export PENNY_SWIFT_EXPORTS="$PWD/packages/offline-crypto/prototypes/apple/.build/validation-01/native-exports"
export PENNY_LOGICAL_FIXTURES="$PWD/packages/offline-crypto/prototypes/reference/.build/logical-fixtures-v2"
cd packages/offline-crypto/prototypes/android
./gradlew -PpennySodiumOutput="$PENNY_SODIUM_BUILD" \
  -PpennyNegativeFixtures="$PENNY_FRAME_NEGATIVES" \
  -PpennyPeerFixtures="$PENNY_SWIFT_EXPORTS" \
  -PpennyLogicalFixtures="$PENNY_LOGICAL_FIXTURES" \
  :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

Install only the probe packages on an existing chosen emulator. Substitute the
explicit serial; never clear the normal Penny application:

```sh
"$ANDROID_HOME/platform-tools/adb" -s emulator-5562 install -r app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_HOME/platform-tools/adb" -s emulator-5562 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
"$ANDROID_HOME/platform-tools/adb" -s emulator-5562 shell am instrument -w -r \
  ca.penny.v4frameprobe.test/androidx.test.runner.AndroidJUnitRunner
```

Require `OK (16 tests)` with no failures; the shell exit status alone is not a
test result. For only the opposite-native import, add
`-e class ca.penny.v4frameprobe.FrameCodecDeviceTest#readsExactSwiftNativeExportsOnAndroidRuntime`;
that focused run requires `OK (1 test)`.

The export test writes only **public-key ciphertext** and a manifest into probe
`files/native-frame-exports/`. After a successful run, copy each named file with
`adb -s SERIAL exec-out run-as ca.penny.v4frameprobe cat files/native-frame-exports/NAME`
to a fresh ignored evidence directory. Export names are `native-full-final.pennyframe`,
`native-multi.pennyframe` and `native-manifest.json`. The manifest records the
public `07` recovery root, `i % 251` plaintext descriptor, counts/hashes and native
API/ABI/page size. Record the APK/source hashes alongside it. Ciphertext changes
on every run; do not compare it to a previous run's hash.

## Verification scope

Initial frame qualification passed on arm64 API 26 (4 KiB pages, 12/12 groups) and API 37
(16 KiB pages, 11/11 groups plus the new focused Swift import, 1/1). Both Android
export sets passed the independent Python/libsodium reader; Swift XCTest also
decoded the exact API 37 outputs. The APK passed four ABI ELF checks and
`zipalign -c -P 16 -v 4`. Build/lint passed with zero errors and one icon warning
for this activity-free probe. Exact source/APK/fixture hashes, commands, counts
and evidence paths for that historical frame slice are recorded in [`evidence/validation.json`](evidence/validation.json).
Current logical composition evidence is separate in [`evidence/logical-validation.json`](evidence/logical-validation.json).

The device suite checks four independently produced positives and 28 malformed
fixtures, exact Swift-native imports, native exports and local round trips,
chunk edges/fresh randomness/short and zero-result reads, hostile lengths before
body reads, invalid/null/wrong-mode/stale handles, bounded handle allocation and
cross-thread close races, I/O/flush/close failures, cancellation during input,
output and FINAL EOF, and zero remaining handles after each test. It also pipes
the full 640 MiB through 64 KiB of transport buffering, checks its independent
SHA-256, and rejects a 640 MiB + 1-byte writer without a success result.

This is frame interoperability and local runtime evidence, not logical capacity,
RSS benchmarking, production restore/rollback evidence, physical-device
qualification, release signing, or a new supported backup reader. Four ABI build
coverage does not imply runtime coverage of 32-bit or x86 devices. The global
native mutex intentionally serializes frame operations in this bounded probe;
throughput/concurrency qualification is deferred.
