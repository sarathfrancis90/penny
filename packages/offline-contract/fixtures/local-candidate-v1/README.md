# Inactive candidate acceptance inputs

`acceptance.json` references the exact existing `local-generation-v1` previous and
replacement snapshots, with file hashes, domain counts and receipt descriptors.
No snapshot or image bytes are duplicated here. Native tests separate each fixture
into complete bounded metadata plus one raw receipt at a time; the fixture's
Base64 is an input convenience, not a required candidate storage representation.

The current slice prepares an isolated, one-shot, encrypted inactive candidate at
existing caps. Tests may use an internal authenticated reopen to compare all
represented metadata and original receipt bytes. Preparation/finish must leave
active data and keys unchanged, including when the key is unavailable. This slice
does not introduce a public install capability or replace the existing Snapshot
commit path.

`preparation` scenarios require actual runtime proof now. `installation_if_wired`
scenarios remain explicitly `not_implemented` until a separately reviewed guarded
live-store seam exists. In particular, surviving GC while pinned is a current
preparation requirement; installing after an intervening edit must eventually
stale-reject, but no install result is inferred from the current handle.

The invalid-image case references the existing public PNG corpus. Its valid chunk
CRCs and matching length/hash do not establish native image validity. Native tests
must reject its invalid scanline filter.

Each platform's evidence identifies the manifest hash, exact source/build/runtime,
executed test methods and scenario outcomes. Skipped or unwired cases retain a
reason and remain unproved. Fixture existence and the Node reference-integrity
test establish no filesystem, cancellation, GC or install acceptance.

Incremental metadata admission, v4 FINAL/EOF authentication, provider guards and
new live-store atomic-install/recovery integration remain separate future gates.
