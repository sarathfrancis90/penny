# Capacity v4 implementation direction

2026-09-13. **Design decision, not an implemented format or capacity increase.** Existing native backups remain envelope 1/schema 1–3 at their existing limits. The current development apps do not link libsodium.

## Selected direction

Use the pinned upstream libsodium secretstream implementation as the basis for the next streamed backup design, with a separately derived key from the existing random recovery root. Preserve the receipt/domain semantics, isolated candidate restore, strict completeness and bounded profile A targets in [the proposal](CAPACITY_V4_PROPOSAL.md). The proposal's custom AES-GCM wrapping/chunk construction is superseded as the implementation direction. Do not implement it from that earlier sketch.

This choice delegates stream nonce progression, rekeying and authenticated final tags to one maintained implementation shared by Swift and Kotlin. Penny still owns strict file/record framing, key separation, reference validation, image admission, candidate durability and provider/session guards. Library use does not constitute an audit of Penny's container or native wrappers.

The first measurement target remains 50,000 expenses, 5,000 receipts and 512 MiB aggregate receipt bytes, with independent metadata/file bounds. These are proposed maxima to test; accepted product limits remain unchanged. Multi-GiB profile B is deferred and must be rejected until a separate measured implementation exists.

## Feasibility evidence

The source tested is libsodium 1.0.22, upstream commit `77e1ce5d6dee871c49ef211222ba18ef0c486bda`, release-tar SHA-256 `adbdd8f16149e81ac6078a03aca6fc03b592b89ef7b5ed83841c086191be3349`. The digest matches official GitHub release metadata. The detached source signature has not yet been independently verified.

- Actual Swift XCTest on iPhone 16e ARM64 simulator/iOS 26.4.1 passed five methods: HKDF and 1 MiB secretstream roundtrip, FINAL, wrong key/AAD, order/duplication/splicing, corruption/truncation/trailing data and basic pre-FFI bounds. The minimal simulator library was built against SDK 26.5. Local evidence: `apps/ios/.build/libsodium-ios-spike/`.
- A separate Kotlin Activity called a compiled JNI probe on API 26 and API 37/16 KiB. Both passed eight native scenarios and two JNI input guards. The probe APK passed 16 KiB ZIP alignment. Local evidence: `artifacts/offline/v4-libsodium-android-runtime/`.
- Initial macOS Swift execution and Android API26 C/JNI linking also passed. Upstream supplies an Apple C module/XCFramework builder and an Android Prefab AAR builder; the latter is a C package, not a Kotlin binding. Local source/build evidence: `artifacts/offline/v4-libsodium-spike/`.

These isolated proofs changed no production app, dependency manifest or portable schema. They do not establish iPhoneOS distribution, every Android ABI, cross-platform archive byte exchange, large-file performance or production wrapper lifetime safety.

## Next bounded slices

1. Verify the detached upstream signature; define reproducible pinned mobile library builds, intended ABIs/slices, license notices and dependency-update checks. Keep probe wrappers out of production.
2. Replace the superseded wire sketch with a byte-exact secretstream container and HKDF salt/context definition. Specify parser state transitions, maximum/full final chunks, reserved-prefix rejection, BEGIN/END and strict EOF. Cloud manifest v2 must have an explicit outer version 2 for AAD dispatch; never trial-decrypt alternate versions under outer v1.
3. Produce public golden files and malformed vectors, then independent Swift/Kotlin readers/writers with owned bounded FFI state. Verify actual opposite-platform outputs, error/final/cancel cleanup, and unchanged v1–v3 readers before freezing the format.
4. Introduce incremental local storage, detached encrypted receipts and candidate generations at existing capacity. Prove migration/rollback/process-interruption and key-loss safety before enabling the new archive in the apps.
5. Measure the entire profile A on both platforms, then integrate file-based provider transfers and separately guarded resumable scheduling. Real accounts, physical devices and signed release validation remain additional gates.

Primary references: [pinned upstream release](https://github.com/jedisct1/libsodium/releases/tag/1.0.22-RELEASE), [secretstream](https://doc.libsodium.org/secret-key_cryptography/secretstream), [HKDF](https://doc.libsodium.org/key_derivation/hkdf), [Apple build script](https://github.com/jedisct1/libsodium/blob/77e1ce5d6dee871c49ef211222ba18ef0c486bda/dist-build/apple-xcframework.sh), [Android AAR script](https://github.com/jedisct1/libsodium/blob/77e1ce5d6dee871c49ef211222ba18ef0c486bda/dist-build/android-aar.sh).
