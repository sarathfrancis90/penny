# iOS receipt-free live state

The app now opens durable storage into validated expense/finance records and receipt descriptors. List, finance/report display, capacity display and unchanged-receipt expense edits use this body. Every durable open and proposed publication still authenticates metadata and sequentially decrypts and fully validates each native image. No aggregate receipt Base64 graph is retained on these paths.

Selected receipt display resolves an ID against authenticated generation metadata, reads one image on `ArchiveWorker`, and retains the existing shared directory lock until its owned view closes. Metadata edits preserve the exact descriptors and receipt ciphertext, recheck the current key and actual directory/source/revision/writer/restore incarnation, and use the existing pending/predecessor/publication/rollback protocol. Cheap invalid/capacity proposals fail before write state; the worker repeats validation against the authenticated disk body. The editor supplies its original expense so a refreshed stale form cannot overwrite newer fields.

`compatibilitySnapshot()` explicitly throws and fully hydrates. Receipt-changing saves, deletion, finance mutations, legacy export and cloud publication use that complete path. V4 export continues using its receipt-free source. Existing candidate/restore final hydration remains, with only the receipt-free body adopted afterward. Old inline vaults necessarily hydrate once and migrate through the existing authenticated publication protocol on first load. No format, key policy, product cap or CloudKit behavior changed.

## Executed evidence

- `apps/ios/.build/live-state/build04.log`: app and all unit/UI test targets compile with Swift 6; isolated `ca.penny.offline.livestate` on owned F70 iPhone 16e / iOS Simulator 26.4.1.
- `Tests01.xcresult`: 27 passed, 1 failed, 0 skipped. The passed set comprises 12 durable integrity/recovery methods, 6 v4 export methods, 2 actual cloud compatibility methods, 6 new live-state methods and the real Photos receipt journey.
- The one failure was the new legacy roundtrip expectation: the existing legacy exporter intentionally creates a fresh backup snapshot ID/time. Only that assertion changed. `Tests02.xcresult`: corrected shared fixture method passed, 0 skips. It separately checks fresh identity/time and exact vault ID plus all eight arrays. The unchanged 27 passing methods were not rerun.
- All **28 unique selected methods** have passed. The real Photos journey attaches, saves, relaunches, displays the original, edits metadata with the original retained, relaunches and displays again, then removes and reopens without the receipt.
- The shared fixture proves all original finance domains, exact receipt bytes, unchanged private ciphertext hashes/descriptors, corrected totals 15,250 overall and 6,250 January, and live open/edit with hydration failure injection armed. Other cases cover stale instance/form, missing key, corrupted/native-invalid image, prepublication error, actual Task cancellation after publication/rollback, retained receipt pin through edit/GC, and healthy refusal at 10,000 expenses.

The exact acceptance-ID map, source pins, binary hashes and limits are in `live-state.json`. Ignored raw evidence is `artifacts/offline/live-state-ios/validation-01/`: source snapshots, final single-test overlay, logs, xcresult summaries, attachment/metric exports, and executable copies. Tests01's failure is preserved. F70 is shut down; the normal demo was untouched. Existing wider proof files were not rewritten.

## Bounded resource sample

Three Debug iterations compare the current explicit full storage read with the new live storage read. The workload plaintext SHA is identical (`757f1ff7…55af8`): shared finance metadata with three 2 MiB valid JPEGs, tiny decoded images and COM padding, totaling 6,291,456 receipt bytes.

| Storage API | Clock values (ms) | XCTest peak physical memory (kB) |
| --- | --- | --- |
| Full compatibility read | 55.528, 57.292, 57.167 | 57,919.792 |
| Live receipt-free read | 22.192, 21.375, 21.709 | 53,184.816 |

Both retained physical-memory deltas were zero after each block. This is an API comparison in one warm simulator process, with allocator/host activity limits, not historical before/after complete app builds, a Release benchmark or a physical-device result. No general latency/memory improvement, large decoded-image capacity or raised-limit claim follows from it.

Remaining explicit compatibility work includes receipt add/replace/delete and finance mutations. Startup still performs synchronous full sequential image verification. Physical protection, full UI/accessibility and release matrices were not rerun for this slice. Estimated work was approximately 18k–20k tokens across the continuation, rather than a tool-metered count.
