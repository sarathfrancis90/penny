# Android static build validation

2026-09-13, macOS host, installed NDK 28.2.13676358, Python 3.13.5 and GNU Make 3.81. This validates the standalone builder, not a production app integration.

The actual four-ABI build passed against the common manifest's libsodium 1.0.22 source: tree SHA-256 `2871798a902683da8f5767ab32920d5e04ee7fc89cf8eedeeb7e2fe48e8e9407`, 678 files. The common verifier authenticated the current complete tree before and after the out-of-tree build; it was unchanged. Root independently verified the source archive and its detached signature before supplying this tree.

```sh
python3 packages/offline-crypto/android/build.py \
  --source /Users/sarathfrancis/work/git/Personal/penny/artifacts/offline/crypto-verified-source/libsodium-1.0.22 \
  --ndk /Users/sarathfrancis/Library/Android/sdk/ndk/28.2.13676358 \
  --output /Users/sarathfrancis/work/git/Personal/penny/artifacts/offline/crypto-android-build-validation/build-all-abis
```

Exit code 0. `arm64-v8a`, `armeabi-v7a`, `x86` and `x86_64` each produced a minimal PIC static archive. Every archive member linked into its ABI's disposable shared validation object with unresolved symbols forbidden. The expected ELF architecture matched, all LOAD segments aligned to `0x4000`, and no TEXTREL appeared. The build-result JSON includes source/compiler/script/artifact hashes and exact configure/link commands.

Two negative checks passed with exit code 1 and no output directory created: supplying `--api 27`, and supplying a copied source tree with a synthetic README modification. Detailed stderr/commands are in `artifacts/offline/crypto-android-build-validation/negative-cases.json`. Per-ABI logs, ELF reports and `build-result.json` are under that directory's `build-all-abis/`. All build output is ignored and no native binary is vendored.

No network fetch, installation, production Gradle/project/workflow change, app linkage, JNI production wrapper, backup reader, device/UI test or commit occurred. This single-host build does not establish cross-host byte-identical reproducibility or runtime compatibility of these new artifacts.

## CMake consumer correction and validation

Independent review exercised the original helper and found its API/NDK CMake variables did not match the official NDK toolchain. The helper now checks `ANDROID_NATIVE_API_LEVEL=26` and `ANDROID_NDK_REVISION=28.2.13676358`, canonical toolchain path and source.properties. It rejects pre-existing imported targets and verifies the complete installed header inventory/digests as well as the archive digest.

SDK CMake **3.22.1** configured and linked a minimal C consumer using sodium initialization, secretstream and HKDF symbols for all four ABIs (eight successful configure/link steps). Separate configure attempts rejected a pre-existing `penny_sodium` target and a modified `sodium.h`. Exact commands/logs are in `artifacts/offline/crypto-android-build-validation/cmake-consumer-results.json` and `consumer-*.log`; the executable validation driver is `check-cmake-consumer.py` in that ignored directory.

These checks reused the previously built static libraries without recompilation. Before enriching their report with header hashes, the driver reran common source verification and compared every installed header byte-for-byte with that source. `version.h` was independently expanded from its pinned template using version 1.0.22, major 26, minor 4 and minimal=1. The report records this separate header attestation; it retains the original build-script hash and unchanged library hashes. Future builder runs emit header hashes directly. This is build-output verification on the trusted local host, not protection against host rollback or a compromised machine.
