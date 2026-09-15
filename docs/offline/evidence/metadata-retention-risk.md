# iOS obsolete metadata retention risk and correction

Independent source review on 2026-09-14 identified a current-cap disk-exhaustion risk. `DurableVaultStorage.commit` and `editExpense` write a complete encrypted receipt-free body and descriptors into a new UUID `.pennygen` file for each mutation. `collectGarbage` collects receipt blobs but deliberately retains metadata files indefinitely. Active expense/receipt limits therefore do not bound cumulative disk use.

Illustrative arithmetic, not a measured workload: 10,000 sequential additions averaging 300–500 JSON bytes per expense yield roughly 19–31 GiB of retained metadata with the body's nested Base64 encoding, before fixed fields and finance overhead. Another 1,000 edits of a 5 MiB body can add approximately 6.5 GiB. These estimates identify the growth pattern, not actual app usage.

Before current-cap release, implement authenticated obsolete-metadata collection after successful guarded publication. Preserve active, predecessor and pending records, candidate/export/read ownership and metadata still needed to prove receipt ownership. Unknown, substituted or unverifiable files remain quarantined. Tests must establish bounded ordinary-edit storage, old-generation recovery, pinned reads/exports and failure/cancellation preservation using the existing native primitives. This work is separate from the in-progress repair slice and does not enable Profile A.

## Measured correction

The [paired retention checkpoint](metadata-retention-integration.json) implements and tests the required collection for ordinary current-cap mutations. On the same50-edit public fixture, baseline metadata retained322,789bytes across101files; final metadata retained12,320bytes across three files. Exact expense/finance records and receipt ciphertext are unchanged. Unknown, damaged and reader-pinned history is deliberately protected and may still grow. These finite settled file lengths do not prove maximum-capacity, allocated-disk or physical failure behavior. The original risk analysis above remains as historical evidence.
