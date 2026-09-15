# Android Files v4 export

The existing **Create encrypted backup → key confirmation → system Files picker** now prepares an opaque verified v4 file before opening CreateDocument. Its snapshot UUID and UTC timestamp are minted once at authenticated source capture; the suggested filename uses those exact fields. The live vault identity/revision/data are unchanged.

`BackupExporter` consumes that handle through `V4ExportDestination`. It opens the selected URI in nontruncating `rw`, requires an empty regular descriptor, writes only encrypted bytes, flushes/fsyncs/closes, then performs bounded full native frame/logical/image readback with exact ciphertext SHA/count and summary comparison. Recovery-key confirmation is checked before and after destination verification. Private stage close must finish before the VM success message. Existing schema3 Snapshot export/readback helper remains for compatibility tests.

Cancellation invalidates pending preparation/copy. Picker cancellation and ViewModel disposal release owned staging; no provider URI is deleted, including a partial or changed file. Captured dialog generations guard both late key-confirmation and late filename callbacks so Cancel cannot subsequently open a picker, including after reopening the dialog. Restore lifecycle is otherwise unchanged.

Exact source/APK/dependency/command/log/UI-artifact hashes and failed-run history are in `v4-files-export.json`. Production source is identical across the three frozen builds:

- `validation-01`: API37 13 tests, 2 UI setup failures. The test tried to locate an uncomposed lazy-list child. Navigation changed to the existing list's scroll-to-node API.
- `validation-02`: API37 **13/13**. API26 **12/13**: the actual save picker opened, but the test's screenshot call returned null before Save. All11 non-UI tests and the cancellation UI test passed.
- `ui-overlay-01`: corrected final UI **2/2 on each API26/API37**. Null screenshots are recorded as unavailable while secure-window flags remain enabled. This is a separate overlay, not a claimed final13-test API26 rerun.

JVM25, app/test builds and lint pass. Writer6 covers fresh identity, full finance/receipt escaping, source/key/capacity/failure cases; Files4 covers blank ready vault, filename/header equality, confirmed key, nonempty-file preservation, cancelled staging and malformed/close/cancel/invalid-read destination failures. The unchanged legacy export/readback group passes. The two actual Compose/UiAutomation journeys exercise recovery confirmation, Downloads CreateDocument/Save and native verified completion, plus cancellation while confirmation is blocked. Actual encrypted Downloads files and picker filename/result evidence were captured per API. API37 includes a picker screenshot; API26 screenshot is unavailable.

Limits: this proves the tested local Downloads provider, not cloud upload, remote readback or arbitrary provider concurrency guarantees. Controlled stream-close exceptions are not physical disk-full/fsync/OS-close fault proof. Failed provider files may remain unverified and partial. Pending exports do not resume after process death. Existing caps, crypto and receipt-free export preparation remain; no memory/performance claim. Tests use `ca.penny.offline.dev.test`; normal demo data was not changed.

## Final request binding and disposal correction

`v4-files-export-binding.json` supersedes the earlier unbound picker callback source: each launch returns an opaque request, the request-keyed ActivityResult registration captures it, and stale URI/null results cannot consume, cancel or alter a newer request. Claiming is one-shot. Claimed ownership remains reachable until the queued worker starts; composition disposal cancels only an exact unclaimed request and preserves a queued claim.

Final focused **8/8 pass on API26 and API37**, with JVM25/build/lint: all6 Files controller groups plus2 actual picker/cancellation UI groups. The added regression executes A→cancelA→prepareB→lateA URI+null→successful B, and verifies unclaimed file cleanup versus a claimed export queued behind a held SQLite/CSV operation. Actual activity recreation while an external picker is open was not run; its exact disposal callback contract and ordinary UI composition disposal are covered. Prior failed UI-readiness runs remain pinned, and unchanged writer/legacy groups were not broadly rerun.
