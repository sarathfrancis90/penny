# Local frame interoperability evidence

This is an experimental **frame-layer** result. It does not freeze v4, enable a
production writer, admit logical archives, prove atomic restore or qualify
physical-device/product capacity. Legacy readers and fixtures are unchanged.

The source pin, reviewed codec/source hashes, artifact hashes and exact native
ciphertext/plaintext hashes are in
[`verification-evidence.json`](verification-evidence.json). Large runtime captures
and raw logs remain at its ignored build paths.

| Check | Local result |
| --- | --- |
| Pinned host libsodium upstream `make check` | 87 passed; zero skipped/failed |
| Read-only deterministic fixture regeneration | Four positives and 28 negative recipes matched |
| Reference unit tests | Six methods passed, including fragmented reads and failure after an authenticated prefix |
| Focused Semgrep, OWASP + TypeScript configs | Four Python files; zero findings/errors after one documented narrow subprocess false-positive annotation |
| Swift iOS 26.4.1 arm64 simulator suite | 15/15 passed, including all shared fixtures |
| Android API 37 arm64, 16 KiB pages | 11/11 passed, including all shared fixtures |
| Android API 26 arm64, 4 KiB pages | 12/12 passed, including all shared fixtures and Swift imports |

The independent ctypes reader decrypted six real native exports: a full-size
FINAL and a three-frame stream from Swift, Android API 37 and Android API 26.
Every plaintext length/digest and native ciphertext length/digest matched.

Direct native exchange is separate evidence: the exact Android API 37 ciphertext
was imported on the Swift simulator (1/1 focused test), and the exact Swift
ciphertext was imported on API 37 (1/1 focused test) and API 26 (within its 12-test
suite). The Android test APK's embedded Swift files and manifest were independently
hashed against the original exports and tied to both import-run APK hashes.
The Swift import's staged inputs were likewise matched to the Android originals.

Both Android suites include a complete 640 MiB encrypt/decrypt through a bounded
64 KiB pipe and rejection of one extra plaintext byte. This is a native frame
boundary test, not the reference corpus's maximum-size test or qualification of
50,000 expense records, receipts, local storage, cloud transfer or restore.

A bounded independent read of Swift/Kotlin/JNI framing, ABI buffer bounds,
finality and cancellation/state lifetime found no additional concrete defect.
The root review's Swift post-finish cancellation fix was present. Candidate
ownership and rollback remain essential caller/later-layer obligations, especially
for Kotlin's generic output stream.

New hosted source/build/upstream/oracle steps were configured separately by the
root agent and were **pending execution at this local evidence checkpoint**.
No hosted or physical-device result is inferred from these local proofs.
