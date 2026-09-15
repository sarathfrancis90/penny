# Async candidate installation

Existing leased candidate publication and final hydration now run on ArchiveWorker. MainActor holds a write reservation and adopts only a matching completed result. Candidate transfer is one-shot; foreign receivers cannot consume it. Existing device-key, namespace, source, authentication, native image, capacity, rollback and cancellation checks remain. Successful durable completion is not relabelled cancelled by a late caller cancellation.

Focused tests passed **19/19**, no skips. The single combined-cap Release method passed with exact all-domain and receipt-byte equality: 10,000 expenses, 100 PNG receipts totalling 8 MiB, one exactly 2 MiB, all six finance arrays nonempty. Read/install took **3,069 ms**, with an **83.75 ms** maximum MainActor heartbeat gap; the earlier normal single baseline recorded **3,142 ms / 1,277.55 ms**. This is a single simulator observation, not p95 or physical-device qualification. Compatibility export still recorded a 316 ms gap and was not changed.

The test retains a full expected Snapshot oracle, uses padded 1×1 PNGs, and restores into a fresh directory with the same supplied local key. It makes no memory, pixel-stress or new-device recovery claim. F70 is shut down; the normal demo was untouched.

Exact source/binary pins, review correction, test scope, raw measurements and limitations: [async-candidate-install.json](async-candidate-install.json). Raw logs/results are under `artifacts/offline/async-candidate-install-ios/validation-01` and `apps/ios/.build/async-candidate-install`.
