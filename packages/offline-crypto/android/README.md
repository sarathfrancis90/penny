# Verified libsodium Android static build

This folder builds minimal, static, position-independent libsodium 1.0.22 for future native consumers. It adds no production app linkage, JNI API or backup reader. Source acquisition, detached-signature verification, the exact source-tree manifest and licensing belong to the parent `offline-crypto` package. This builder never downloads anything or installs tools.

Python 3.11+, make and the existing Android NDK **28.2.13676358** are required. The host must be macOS or Linux. Invoke with explicit absolute paths; source/output/NDK paths must have no spaces or shell metacharacters because Autoconf/libtool evaluate tool strings through a shell. The output must not already exist and must be outside the verified source tree:

```sh
python3 packages/offline-crypto/android/build.py \
  --source /absolute/verified/libsodium-1.0.22 \
  --manifest /absolute/penny/packages/offline-crypto/source-manifest.json \
  --ndk /absolute/android-sdk/ndk/28.2.13676358 \
  --output /absolute/ignored-build-output/android-sodium
```

All four ABIs are built for **API 26**: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`. The current Penny app has no ABI filter and its dependency APK contains all four; hosted native emulator CI uses x86_64, while local device probes use arm64. A two-ABI library would silently lose existing 32-bit compatibility if adopted without a separate product decision. This build does not change that policy.

The builder checks the complete source tree with the common verifier before running `configure` and again after building. It refuses a changed manifest policy, wrong NDK/API, missing tools and pre-existing output. Compiler flags, configure-site settings and build-tool environment are controlled rather than inherited. Every ABI uses out-of-tree `--enable-minimal --disable-shared --enable-static --with-pic`; no optional ARM crypto instruction set is imposed as a device baseline. Android's target triple/API convention and supported Autoconf variables are documented in the [NDK guide](https://developer.android.com/ndk/guides/other_build_systems).

Outputs are `<ABI>/lib/libsodium.a`, `<ABI>/include/`, per-ABI configure/build logs, ELF reports and `build-result.json` with source identity, tool version, exact commands and artifact hashes. `work/` contains scratch products. Failed builds leave their new output for diagnosis but do not write a success report. Do not reuse partial output or copy artifacts without their matching report. Keep all output ignored; no binaries are vendored.

Archive timestamps and source/build path mappings are normalized. These settings support reproducible local builds; bit-for-bit identity across different host toolchains/operating systems is not established. Pinning NDK does not pin the host make or system utilities. The report records host/compiler identity so comparisons can state their actual scope.

## Future CMake and Gradle consumer

After a separately reviewed JNI wrapper exists, explicitly import this helper from that wrapper's CMake project (CMake 3.19+; validated with SDK CMake 3.22.1). It checks the official NDK toolchain's `ANDROID_NATIVE_API_LEVEL`, `ANDROID_NDK_REVISION`, canonical toolchain path and `source.properties`, then verifies the output manifest hash, selected archive hash and exact installed-header inventory/digests before linking. Call it once; pre-existing `penny_sodium` targets are refused rather than silently reused:

```cmake
include(/absolute/penny/packages/offline-crypto/android/PennySodium.cmake)
# add_library(penny_crypto SHARED ...reviewed wrapper sources...)
penny_link_sodium(penny_crypto "${PENNY_SODIUM_OUTPUT}")
```

The future Gradle module must set `ndkVersion = "28.2.13676358"`, retain `minSdk = 26`, and supply `-DPENNY_SODIUM_OUTPUT=/absolute/build/output` through `defaultConfig.externalNativeBuild.cmake.arguments`. Its CMake `ANDROID_PLATFORM` must be `android-26`. Preserve all four ABI variants or explicitly review any support change. Do not make Gradle fetch a moving release or implicitly build unverified source. The production app has not adopted this helper.

A static archive has no ELF load segments of its own. The build therefore links **every archive member** into a disposable shared object using `-z defs`, `-z max-page-size=16384` and `-z common-page-size=16384`, then checks the resulting architecture, every LOAD alignment and absence of text relocations. This establishes linkability/PIC and ELF alignment for each compiled ABI. The final consumer must apply these flags to its own shared library and check **all** packaged libraries plus APK ZIP alignment; these static checks do not establish a final APK or device runtime. See [Android 16 KiB packaging guidance](https://developer.android.com/guide/practices/page-sizes).

Current runtime probes from the earlier investigation cover only its separate arm64 test wrapper; they do not validate these newly built libraries, a production JNI API or all four device ABIs. Consumer acceptance still requires Kotlin/JNI boundary tests, secretstream/HKDF cross-platform vectors, cancellation/key lifetime review, final APK inspection and supported-device execution.

## Repeatable consumer checks

`check_consumer.py` configures and links a real CMake consumer for every ABI, then requires specific rejection of pre-existing imported targets, altered exported headers and altered static archives. Mutations use a separate copy; original library/header hashes must remain unchanged. Supply a new output directory and SDK CMake 3.22.1 with its sibling Ninja:

```sh
python3 packages/offline-crypto/android/check_consumer.py \
  --built /absolute/path/to/android-build \
  --output /absolute/path/to/new-consumer-checks \
  --cmake /absolute/android-sdk/cmake/3.22.1/bin/cmake \
  --ndk /absolute/android-sdk/ndk/28.2.13676358
```

The native Android CI job explicitly prepares authenticated source, builds all four ABIs and runs this check. Its report/logs are uploaded separately from the development APK; successful build checks do not imply that the app links this dependency.
