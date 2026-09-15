# Combined current-cap workload

`workload.json` is the shared construction contract for one native capacity
sample. It preserves the three expense records and six nonempty finance arrays
from the pinned native-writer golden, then adds 9,997 deterministic expenses and
replaces receipts with 100 deterministic PNGs. `../../current-cap.mjs` is the
Node reference constructor; native tests independently construct the same data
and enforce the manifest and per-image hashes.

The receipt lengths are one 2,097,152-byte image, 98 images of 63,550 bytes and
one 63,556-byte image: exactly 8,388,608 bytes. Each image remains a valid 1×1 PNG
with an ancillary padding chunk. This exercises count and encoded-byte limits,
not maximum decoded pixels or every combination of long field values.

The original expense total is 12,351,298 minor units. The manifest's edit raises
it to 12,351,548 while preserving receipt ownership and all finance records.
Native acceptance compares every represented field and raw receipt byte after
publication and backup restore; fresh archive identity/time and canonical array
ordering are handled explicitly by each format's test.

Run the reference gate with `node --test packages/offline-contract/current-cap.test.mjs`
from the repository root. Native execution is opt-in: the iOS performance scheme
method `testCombinedCurrentCapStreamedRoundtrip`, and Android's
`CurrentCapDeviceTest` with `pennyCurrentCap=true`. Timing observations are scoped
to the recorded runtime/build and cannot establish physical-device p95 or peak
memory. No runtime capacity limits are raised by this workload.
