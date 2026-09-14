# Receipt-free live state

This is the next implementation slice after Files export. It does not change portable formats, private receipt encryption or product capacity. The current `Snapshot` compatibility APIs hydrate all receipt bytes; ordinary open/list/edit paths must stop depending on them before larger capacity is enabled.

## State and ownership

The live view contains validated finance/expense records, authenticated receipt descriptors and the local source identity. Descriptors contain no image bytes. A displayed descriptor or ID is never authority to read an arbitrary path: the storage owner resolves it against its authenticated generation and existing key.

Opening a vault retains full sequential authentication and native image validation initially, releasing each receipt before reading the next. This slice removes aggregate retention; it does not weaken integrity checks or promise constant-time open. Viewing a receipt acquires an owned read of that receipt only. A view released during cancellation or navigation cannot later revive its handle. Existing generation pins protect a selected immutable receipt through edits and garbage collection.

Metadata edits preserve existing receipt references and ciphertext. Publication rechecks actual source/key identity, validates the complete proposed metadata and retained descriptors, and uses the existing guarded commit/recovery protocol. Never rebuild retained references from a UI summary or accept a stale second instance. Explicit receipt additions, replacements and removals require their own deltas before all ordinary mutations can use this path.

`Snapshot` remains an explicit compatibility operation for legacy backup/migration consumers. Empty `attachments` in a receipt-free body must never be interpreted as a request to delete every stored receipt. Audit every caller when replacing a stored Snapshot property with live state, especially cloud backup, finance mutations, receipt display and restore adoption.

## Paired acceptance

Use the existing synthetic receipt and eight-domain native-writer fixtures under `packages/offline-contract/fixtures/`; do not regenerate captured native ciphertext. Both platforms must map the following cases to actual native tests.

| Case | Required observation |
| --- | --- |
| Open and list | Hydration-failure instrumentation is armed; open/list succeeds with exact expense/finance records and descriptors, no aggregate attachment graph |
| View one | Only the selected owned receipt is retained; exact bytes/digest match the shared fixture; close and cancellation release ownership |
| Metadata edit | Amount/merchant/date/category/note changes persist; all unchanged receipt ciphertext hashes and descriptors remain identical |
| Reopen | A new store instance reads the edited fields and every original receipt exactly |
| Stale second instance | An edit against intervening publication is rejected; the newer live state remains intact |
| Missing key or corruption | Key loss, invalid metadata or an authenticated invalid image cannot become an empty ready vault or silently lose a receipt |
| Failure before publication | Cancellation or commit error preserves the prior complete state and can reopen it |
| Existing read during edit/GC | An owned receipt read remains valid while its generation is pinned; releasing it allows only established GC ownership rules |
| Compatibility export/restore | Explicit legacy hydration still includes every receipt; v4 export/install and subsequent UI adoption preserve all domains |
| Resource measurement | Record time and peak memory for an identical representative fixture before/after; make no improvement claim from architecture alone |

The initial usable slice is open/list/view-one/metadata-edit. Receipt add/replace/delete, finance mutations, restore adoption, CSV and every remaining ordinary Snapshot consumer must be accounted for before raising the 8 MiB aggregate cap. Profile A still requires the full memory, latency, disk, recovery and export matrix defined in the capacity plan.
