# Native v4 export checkpoint

The actual iOS app target passed **19/19, zero skips** on the isolated iPhone 16e simulator, iOS 26.4.1: six writer tests, six Files restore tests, and seven existing candidate tests. Exact source, app/test binary, fixture, and raw result pins are in `v4-export.json` and its referenced immutable artifact provenance. Earlier build attempts stopped at compiler errors and provide no runtime evidence.

`VaultStore.prepareV4Export` captures the actual durable source digest and local identity using the current device key without provisioning. A worker captures authenticated receipt-free metadata under a brief root lease, takes the existing receipt-directory shared locks, and releases the root lease before encoding. Ordinary edits can continue; GC preserves the pinned receipt groups. Every borrowed receipt is authenticated and fully native-decoded before use. The pull writer sorts domain IDs and receipt descriptors, checks exact encoded sizes, and emits the existing BEGIN/records/END transcript through the unchanged authenticated frame codec. It retains bounded typed metadata and one receipt, without aggregate receipt base64 or a plaintext spool.

The private ciphertext output uses descriptor-relative exclusive creation, an inode pin, existing strict device protection policy, checked writes, sync, and close. Source receipt locks are released after source close. A complete native reader pass then checks FINAL, strict EOF, models, images, transcript, expected sizes and hashes before an opaque export handle is returned. Every later exported reader itself enforces expected ciphertext size, digest, true EOF, and actual close; it cannot silently copy changed same-inode bytes.

Executed writer checks:

- All-domain finance/receipt and quote, slash, backslash, newline, Unicode roundtrip; empty durable vault output; single-use handle cleanup.
- Real Android-produced ciphertext into iOS preparation, guarded installation, and a second store instance reopening the complete expected snapshot and original receipt bytes.
- Two ordinary edits and GC during a pinned export; old receipt groups remain available until reads close, then become collectible.
- Capacity rejection before output creation for a current-limit snapshot whose v4 record overhead exceeds the unchanged app metadata cap.
- Missing key and damaged source receipt rejection without deleting evidence or generating output.
- Exceptions injected after actual partial ciphertext write, sync, and close; cancellation at source-pinned, sealed, and verified boundaries; modified same-inode output rejection; cleanup preserving unrelated files.

The public-fixture-key iOS output is `artifacts/offline/v4-export-ios/validation-01/ios-v4-finance.pennybackup` (5,287 bytes; SHA-256 `a8f04fd31473f78aef3a146d25af1edea04fcae1bb3d3f6c4d1cfadaf7ad6565`). It is suitable for the reciprocal Android test; this report does not claim that separate test's result.

This checkpoint adds an internal export API, with no Files export presentation or provider publication. Existing caps and final restored Snapshot hydration remain. Simulator tests use the explicit simulated filesystem protection branch; physical device protection and hardware durability were not exercised. Injected errors are not full-volume or actual failing-close tests. Second-store reopen is in the same XCTest process. No performance, larger-capacity, or constant-memory claim is made. The normal demo was untouched and the owned F70 simulator was shut down after validation.
