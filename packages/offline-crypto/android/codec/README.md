# Shared Android v4 reader sources

The native app and isolated frame prototype compile these same Kotlin/JNI sources directly. There is no copied codec or prebuilt codec binary. The original `ca.penny.v4frameprobe` namespace/JNI symbols are retained to avoid changing the tested boundary; the three moved implementation files are byte-identical to the preceding prototype checkpoint. `LogicalCodec` continues to use the existing Android schema3 validators in each receiving build.

Both builds pin NDK28.2.13676358, API26, CMake3.22.1 and all four ABIs. Supply the authenticated static build using `-PpennySodiumOutput=/absolute/output` (the native app also accepts `PENNY_SODIUM_OUTPUT`). Shared CMake imports `../../PennySodium.cmake` to verify the build report, manifest, selected archive and complete headers, then applies 16KiB linker flags. It does not fetch or build dependencies. Keep generated native outputs ignored.

The app's internal `V4BackupReader` adds current count/receipt/metadata limits and requires an isolated sink. Its success is logical admission, not an installed candidate, preview, export or complete portable-backup capacity acceptance. App production backup selection remains unchanged. The app packages exact `LICENSE.libsodium` bytes as an asset.

App device tests require `-PpennyV4TestAssets=/absolute/assets` containing the existing materialized `v4-frame-negatives` and `v4-logical-materialized` directories. Missing manifests fail the tests. Only their named fixture files are copied into the test APK. Prototype fixture properties remain unchanged. Historical prototype evidence keeps its original pre-move paths; current app/shared-source evidence is in `apps/android/evidence/v4-app-reader.json`.
