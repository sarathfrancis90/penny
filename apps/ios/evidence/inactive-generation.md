# iOS inactive receipt-streamed preparation

`DurableVaultStorage.Preparation` accepts a receipt-free typed Snapshot, ordered `DurableReceiptDeclaration` values, supplied device key and local metadata. Missing/invalid supplied keys and complete metadata/declaration/reference/capacity failures reject before root provisioning. Each receipt is encrypted in a uniquely owned group. Finish writes and closes inactive encrypted metadata, authenticates the full generation with existing native image/inventory checks, and returns an opaque `InactiveCandidate` with an informational summary. It never writes the live pointer or accesses Keychain.

The candidate is **internal, unexposed and uninstallable**. Existing Snapshot commit, source/revision/incarnation guards, final hydration, pending recovery and rollback remain unchanged. No current UI or backup reader can use this new candidate for installation.

Both receipt input forms are bounded: complete `Data`, or an owned `DurableReceiptSource`. The latter requests at most 64 KiB per read, enforces declared length and true EOF, and attempts source close exactly once before accepting raw bytes. Read, close, EOF and cancellation failures permanently consume preparation and clean its owned staging. Current metadata arrays remain materialized. Preparation retains no aggregate receipt/base64 graph; the existing native image validator temporarily constructs one receipt/base64.

Receipt directory shared locks survive candidate transfer and let ordinary saves proceed. GC skips candidate groups without blocking. Original inode pins plus ownership checks around finish/reverification reject even same-ciphertext file replacement. Close removes only owned entries; foreign replacements and unknown receipt entries remain, with cleanup failure surfaced. Closing a transferred preparation cannot delete its candidate; candidate close owns cleanup.

Actual simulator results, zero failures and zero skips:

| Checkpoint | Tests | Source scope |
| --- | ---: | --- |
| Tests02 | 53/53 | Candidate 8, durable 12, receipt foundation 9, vault 18, archive worker 4, raw migration 2. Includes ownership correction; before owned-source overload. |
| Tests03 | 19/19 | Final source: candidate 10 and receipt foundation 9. Additive owned-source overload and its two fault/cancellation methods. |

Both ran on isolated F70 iPhone 16e arm64, iOS 26.4.1, Xcode 26.6 (17F113), Debug. F70 is shut down. Normal demo 730A was untouched. Tests01's earlier 52/52 log remains historical; it predates the ownership strengthening and is not final acceptance.

The shared previous/replacement inputs roundtrip all domain fields and exact original receipt bytes through authenticated inactive storage. Tests cover current-pointer isolation, single-use transfer/discard, owner/hash/missing/duplicate/native-invalid receipts, exact size parity, partial source read/full-input source close/EOF failures, actual Task cancellation at input/final verification, cancellation during output write/source read/close, GC lifetime during an ordinary save, and foreign replacement preservation. Error hooks after ciphertext write/sync/close are **injected checkpoint errors after actual successful calls**, not evidence of a full volume or actual kernel close failure.

[Machine-readable evidence](inactive-generation.json) maps every shared acceptance scenario to methods or an explicit unimplemented installation gate, and pins sources, project, fixtures, binaries and result logs. Acceptance manifest SHA-256: `b61468ebc392597db6b758ebf07077bcc7b6f07200c3ca4c5eb0b3b6696597d1`. Final runtime SHA-256: `bb00ed0399e2aed7e542904d23ebec56f2ed95c1c6d78e3beccecb40107c3205`; foundation: `a471a19a98826491c079f3c40a029828d14fb9385ce3734d553a94d66ad05889`; candidate tests: `3d6ccc4c355ccdf320cd284d3aa466545e46445cc9d46593ca773750c1c74c41`.

Final command from repository root:

```sh
xcodebuild -project apps/ios/PennyOffline.xcodeproj -scheme PennyOffline \
  -destination 'platform=iOS Simulator,id=F70A4E8F-78ED-4E96-85E6-0EAEB6D34088' \
  -parallel-testing-enabled NO -derivedDataPath apps/ios/.build/inactive-generation/DerivedData \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES test \
  -resultBundlePath apps/ios/.build/inactive-generation/Tests03.xcresult \
  -only-testing:PennyOfflineTests/InactiveGenerationTests \
  -only-testing:PennyOfflineTests/LocalReceiptBlobTests
```

Tests02 source copies/provenance and both result bundles are under `apps/ios/.build/inactive-generation/`. Tests02 binary hashes were captured before the final additive rebuild; separate historical binaries were not retained. Final binaries have their own pins. The final overlay does not imply another 53-test run on final source.

Remaining wiring includes guarded candidate installation, caller key lookup and preview, exact provider/input/session binding, v4 FINAL/EOF integration, and crash handling/collection of abandoned inactive candidates. No capacity increase, constant-memory/performance result, UI validation or physical class-A protection proof is claimed. Current simulator protection is explicitly simulated; device requirements remain strict. Estimated effort: approximately 19k tokens including the ownership correction and approved owned-source follow-up, beyond the 12k soft checkpoint; not measured accounting.
