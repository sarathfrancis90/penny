# Detached receipt file foundation — local validation

`LocalReceiptBlob.kt` implements the unused typed descriptor, local binary envelope and owned receipt-generation lifecycle in `docs/offline/LOCAL_RECEIPT_CONTRACT.md`. No existing runtime source or call site changes. The current 2 MiB individual, 100 receipt and 8 MiB aggregate limits remain enforced. This is not a prepared archive candidate or live store migration.

The standard Android HMAC-SHA256/AES-256-GCM provider matches the shared public golden's derived key, 143-byte AAD and plaintext. Runtime sealing always draws a fresh nonce. A closed descriptor binds vault, privately generated generation, receipt and expense identifiers, media, exact byte length and SHA-256. Both seal and reopen perform the existing complete `ReceiptImage.decode` and recycle the bitmap. Plaintext, ciphertext and native decode allocations are bounded per receipt; this slice does not claim zero-copy streaming or guaranteed erasure of provider/managed-memory copies.

Files are exclusively created with private permissions beneath `noBackupFilesDir/detached-receipt-staging-v1/<generationId>/<id>.pennyreceipt`. Directory capabilities and `/proc/self/fd` anchor filesystem operations; no caller supplies file paths. A read-only descriptor pins every admitted file's inode until cleanup, bounded by the 100 receipt limit. This fixed a real unlink/recreate inode-reuse failure discovered by the replacement test. Original write descriptors still undergo real fsync and close before a separate strict reopen can return a handle. Completion checks exact directory inventory, reopens all receipts and fsyncs both generation and namespace directories before transferring ownership to an unactivated generation. Operation close after transfer cannot delete that generation. Failures close the operation, clear its key and remove only matching owned entries; foreign files, collisions, symlinks and replacements remain intact, and failed cleanup is surfaced.

## Executed checks

The sandbox app and test APK built successfully with Android lint. `LocalReceiptBlobDeviceTest` passed **7/7 groups on API 26 arm64 (4 KiB pages)** and **7/7 on API 37 arm64 (16 KiB pages)** using the same APKs. API 26 page size was read from `/proc/self/smaps`; that image does not provide `getconf`.

- Shared public PNG golden decrypt, exact key/AAD and fresh-nonce round trips; all 35 negative corpus cases rejected: 10 authentication, 7 envelope, 15 metadata, 1 content and 2 image-structure cases. The test APK's three fixture hashes match the shared files.
- One-shot transfer/read/close behavior; repeated append, complete, discard and use after close reject.
- 100 receipt admission, four valid 2 MiB PNGs, aggregate overflow and duplicate identifier failure with cleanup.
- Constructor failure after exclusive directory creation, create/write/sync/close/reopen/directory-sync checkpoint faults, cancellation and partial ciphertext write cleanup. The partial-write case confirms 32,768 envelope bytes reached the new file before the second-write checkpoint threw, preserving an unrelated sibling.
- Namespace and receipt symlinks, exclusive-create collisions, additional directory entries, missing/replaced files, ciphertext tamper, trailing bytes and changed permissions fail closed. Replacements and foreign entries survive cleanup.

Unknown/missing JSON properties and JSON-number type cases are rejected by a **test-only** adapter before the typed production descriptor constructor. The production foundation is not a serialized candidate-metadata decoder. The positive image corpus here is PNG; this is not a physical-camera/JPEG/HEIC quality matrix.

The injected sync failure occurs before the real sync call; the injected close failure occurs after a successful real close. These are explicit checkpoint exception tests, not real full-volume or failing-close evidence. Successful runs do execute real file and directory fsync/close. This does not establish power-loss durability, restart recovery or crash-safe activation. API 26 uses public APIs and explicitly closes descriptors; the explicit `O_CLOEXEC` SDK constant is guarded to API 27 and newer.

## Reproduction and provenance

From `apps/android`, with `ANDROID_HOME=/Users/sarathfrancis/Library/Android/sdk`:

```sh
./gradlew -PpennyTestSandbox=true :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
adb -s SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
adb -s SERIAL install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s SERIAL shell am instrument -w -r -e class ca.penny.offline.LocalReceiptBlobDeviceTest ca.penny.offline.dev.test.test/androidx.test.runner.AndroidJUnitRunner
adb -s SERIAL shell am force-stop ca.penny.offline.dev.test
```

SERIAL was `emulator-5562` for API 26 and `emulator-5560` for API 37. Tests assert the sandbox package and use unique private scratch directories. No normal `ca.penny.offline.dev` data or settings were changed. Exact source, APK, fixture and raw log hashes are in [local-receipt-foundation.json](local-receipt-foundation.json). Ignored raw logs are `artifacts/offline/local-receipt-android-build.log`, `local-receipt-api26.log` and `local-receipt-api37.log`.

Authenticated serialized candidate metadata, expense-owner existence, revision/incarnation/provider/session bindings, key provisioning, live activation, crash recovery, startup GC and retention remain separate gates. Closing the unactivated generation deletes its owned files; there is no persistent generation reopen or activation API in this slice.
