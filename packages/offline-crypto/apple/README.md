# Verified libsodium Apple builds

Build tooling only. This directory does not link Penny, add a backup reader, or freeze the portable format. It consumes the exact source tree approved by `../source-manifest.json` through the shared `../verify_source.py` verifier. Source verification runs before configure and again after both builds. Output must be absent or empty and cannot overlap source.

Use the common source preparation process first, then supply its verified extracted directory explicitly:

```sh
python3 packages/offline-crypto/apple/build.py \
  --source /absolute/path/to/verified/libsodium-1.0.22 \
  --output /absolute/path/to/disposable/apple-build \
  --deployment-target 26.0

python3 packages/offline-crypto/apple/check_rejections.py \
  --source /absolute/path/to/verified/libsodium-1.0.22
```

Requirements: Python 3, local full Xcode with iPhoneOS and iPhoneSimulator SDKs, and Apple's command-line build tools. `DEVELOPER_DIR` may select an installed Xcode; its actual toolchain and SDK paths are recorded. No network downloads, global installs, project modifications or simulator operations occur. `--jobs` is bounded to 1–4 (default 2). Deployment 26.0 must match the pinned manifest; other deployment settings fail before building.

Source, output, helper, selected Xcode, SDK and compiler/archive-tool paths must contain only ASCII letters/digits and `/._-`. Whitespace and shell metacharacters are explicitly unsupported because upstream configure/make expands some tool paths without quoting. Both slices' paths are checked before output creation or configure execution. Unsupported paths produce a configuration error, not a signature-verification diagnosis. Add `--preflight-only` to validate the current verified source and both toolchains without creating output or building.

Both required variants are always built: `ios-arm64` and `ios-simulator-arm64`, each with minimal static libsodium, direct `Clibsodium` module map, upstream headers and an ISC `LICENSE` copy. Sources are configured out of tree. The helper clears inherited compiler/configure hooks, records exact command arguments, sets deterministic archive timestamps, and uses the selected SDK explicitly. No bit-identical output claim is made across different Xcode versions or filesystem paths.

Each slice's `install/` directory contains its static library and public headers. `LinkProbe.swift` links upstream HKDF and secretstream calls into a build-only dylib; the helper checks ARM64 architecture, iPhoneOS versus simulator platform, and minimum iOS 26.0 load-command metadata. It does not execute this probe. `build-report.json` records final status, source verification, toolchain, commands, flags, artifact hashes and timings; per-slice logs retain compiler diagnostics. A failed partial output is retained for diagnosis and cannot be silently reused as successful output. Never commit generated libraries, tarballs or build directories.

`check_rejections.py` copies the source into temporary storage, replaces its configure script with a harmless marker writer, and requires verification to refuse it before that script or output creation occurs. It also checks unsupported deployment rejection. The original source is never edited. These are trust-boundary tests, not cryptographic correctness tests.

The earlier isolated iOS simulator spike proved five Swift/C runtime methods on iPhone 16e/iOS 26.4.1; this helper adds repeatable device/simulator compilation and linkage. Physical execution, release packaging/signing, production wrapper ownership, full cross-platform backups and large-file acceptance remain separate gates. Preserve the ISC notice when redistributing either the headers or statically linked library; the root package owns upstream signature, license and source-pin maintenance.
