# Receipt-free live state — Android

The ordinary VM open/refresh/list and existing-expense metadata save now use a distinct `LiveVaultState`: immutable expense/finance lists, `ReceiptInfo` values without bytes, and a private authenticated source binding. `VaultGenerations.readVerified` still authenticates every row, verifies membership, and fully decodes each receipt sequentially. These paths do not invoke `SnapshotHydration`.

Metadata edits re-read retained descriptors from authenticated storage and validate complete proposed metadata, references and exact existing schema-3 export capacity. The existing active-generation SQLite transaction updates rows/header/revision together, with fresh existing-key, namespace and active-state checks. Receipt files and descriptors remain unchanged. The editor saves a fingerprint of its original complete Expense with its form fields; a receipt refresh cannot silently authorize old form values over a newer record, and a deleted existing expense cannot become a new record.

The receipt viewer acquires a storage-owned read, keeps only its selected decoded image, and releases its borrowed plaintext after decode. Counted in-process generation/group pins preserve the original files through metadata edits, receipt deletion and whole-vault replacement. Closing the final reader permits a later ordinary GC pass. Failed actual close conservatively retains protection. Opening a reader still performs sequential validation, including group validation; this is not a latency optimization claim or multiprocess GC protocol.

## Caller audit

| Caller | Path |
| --- | --- |
| VM initial open, refresh after operations, expense list, `VaultStore.all/finance` | Receipt-free verified live state |
| Existing expense metadata edit without a new draft receipt | Guarded retained-descriptor transaction, no aggregate hydration |
| Saved receipt dialog | Owned selected receipt read, borrowed bytes wiped, scoped bitmap/lease cleanup |
| Expense creation/deletion, receipt add/remove/replace | Existing explicit Snapshot mutation, then live refresh |
| Finance mutations and recurring/income posts | Existing explicit Snapshot mutation preserving all receipts, then live refresh |
| Finance screen reports | Local receipt-free report-only Snapshot; never used for storage or replacement |
| One-time migration from legacy encrypted rows | Existing complete Snapshot compatibility migration |
| CSV | Explicit compatibility `store.snapshot()`; not optimized in this slice |
| Drive/manual/automatic cloud checkpoint and legacy restore | Explicit complete Snapshot; no empty receipt-free body passed to replacement |
| Native v4 export and guarded install | Existing verified source/candidate protocol; full live UI adoption after install |

## Executed proof

Exact sources, APKs, commands, logs, fixture hash and ten shared acceptance mappings are in `live-state.json`. Final API37/16KiB overlay passed 13/13; API26 passed 20/20. Build, lint and 25 JVM tests passed. The previous API37 18/18 run is preserved separately and predates only the editor fingerprint correction. An earlier 12-pass/6-failure run records incorrect new-test setup that correctly hit the uninitialized receiving-vault guard; the test setup was corrected without changing that policy.

The final cases cover shared eight-domain fixture metadata/ciphertext preservation, exact receipt reads and wiping, stale second store, missing key/corruption, authenticated native-invalid image rejection, cancelled writes and real SQL abort, no optimistic UI commit, two read leases through edit/delete/restore/GC, actual receipt capture/save/activity recreation/view/delete UI, Files restore, and native writer/readback/install/reopen compatibility.

No controlled before/after peak-memory or latency comparison was run. The shared resource-measurement row remains `not_run`; no measured improvement, increased capacity, fresh-process recovery, or broader release claim follows from this slice. View-loading Activity recreation was not separately fault-injected. Current caps and portable/private formats remain unchanged. The normal demo was not modified; only the isolated test package ran.
