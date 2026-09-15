# Physical-device session

Focused USB and offline checks completed on **September 15, 2026**. Connected devices are Samsung SM-S928U1, Android16/API36/4KiB, and iPhone13 Pro Max, iOS26.6 (23G71). Raw identifiers remain in private ignored artifacts. The remaining checklist below is not a completed release matrix.

## Recorded results

- Android: [five local integration methods](../../apps/android/evidence/physical-android-2026-09-15.json), a separate [manual UI journey](../../apps/android/evidence/physical-android-ui-2026-09-15.json), and [two owner-offline methods](../../apps/android/evidence/physical-android-offline-2026-09-15.json) passed. The same CRUD method occurs in both UI runs; do not sum them as unique coverage. The initial dozing-display failure is preserved. Offline OCR checks `ConnectivityManager.activeNetwork == null`, and pre/post default network is none. The user enabled Airplane Mode and disabled Wi-Fi; test code preserved those settings. QA remains separate from the shipping app.
- Android Nano UI reports unavailable. The app maps unsupported results and exceptions to that text; no model download/inference or raw failure diagnosis was performed. Actual test-key encryption/recovery does not establish TEE/StrongBox security level.
- iOS: [initial9/9 physical methods](../../apps/ios/evidence/physical-ios-2026-09-15.json) passed with connectivity available. The subsequent [owner-offline selection passed4/4](../../apps/ios/evidence/physical-ios-offline-2026-09-15.json), zero skips: passive network path `unsatisfied`, Vision OCR, actual model-unavailable fallback, visible availability/manual editor, and CRUD across relaunch. Foundation Models reports `deviceNotEligible`; no inference was requested. Normal QA launch also succeeded afterward. Overlapping methods across these runs are not unique additional coverage.
- iOS signing: the original `PPQCheck=true` development profile rejected both test bundles offline, including after a successful two-test online warmup. Apple's Development Offline profile resolved this without a runtime change. It expires **2026-09-22 18:31:52UTC**. The existing certificate/device and unchanged entitlements were validated on cloned, re-signed frozen products; both before/after bundles are retained with293 file pins each. `PPQCheck` is absent in the new profile. CrowdStrike was not modified. This proves development QA installation and offline launch, not store distribution.

[Hosted58726be](evidence/hosted-native-58726be.json) passed every native job, retained Flutter iOS and the required repository gate. Later physical test overlays are separately pinned. Camera quality, accessibility, supported-model inference, resources, hardware security, migration and provider completion remain open.

## Repeating iOS offline development QA

Use Apple's documented [Development Offline profile](https://developer.apple.com/help/account/provisioning-profiles/provisioning-profile-updates) for the existing QA certificate and registered device. Check its expiry, application identifier, device inclusion and certificate match before installation. Preserve signed entitlements and verify both app and test-runner signatures. Keep the previous frozen products as a control and pin the newly signed products separately: re-signing changes binary hashes. For the focused test host, set `PENNY_EXPECT_OFFLINE=1` in a copied `.xctestrun` configuration; retain its relative product layout. The owner controls the radios and unlocks the phone. Never infer an offline pass from a successful online warmup. Renew expired development profiles before a later USB session; this seven-day limit is unrelated to App Store installations.

## Before installation

- Identify both devices and their OS versions, pairing/debugging state and available storage. Keep physical identifiers in private local artifacts.
- Build and verify the exact signed QA artifacts for those devices. Use isolated QA identities and synthetic records; preserve the shipping app and its data. Record source, binary and signing-certificate hashes.
- Check actual model availability in the app. Device connection alone does not establish Foundation Models or Gemini Nano support. Unsupported/unavailable models must retain complete manual entry and OCR flows.
- Confirm provider configuration separately using [PROVIDER_SETUP.md](PROVIDER_SETUP.md). A connected phone does not supply missing OAuth registrations, CloudKit containers, entitlements or provisioning profiles.

## Test order

1. **Offline core:** with the owner's network-setting changes, launch, add/edit/delete expenses, search, review finance records and reopen after force-stop. Verify exact records and receipts with connectivity unavailable.
2. **Capture and intelligence:** photograph a synthetic receipt, exercise permission refusal/cancellation, inspect orientation and optimized image quality, run bundled OCR, and test available on-device model proposals plus unavailable/cancelled fallback. Record actual availability and results; observe SDK/system-service traffic separately.
3. **Recovery and key protection:** export a verified encrypted file and restore it into an isolated QA state with a fresh local key. Check wrong-key refusal and preserved originals. Exercise lock/background/reopen behavior. Record the exact reset method; same-device reinstall is not new-device evidence. Keep recovery keys out of reports and logs.
4. **Cloud, when configured:** obtain the intended account's consent, upload/download and verify remote encrypted contents, then restore a clean QA state using the saved recovery key. Exercise interrupted transfer and revoked access. Local export success cannot substitute for remote completion.
5. **Usability and resources:** VoiceOver/TalkBack, large text, light/dark rendering, real receipt viewing and representative/max-cap workloads. Record latency, memory, interruptions and thermal/battery conditions against the exact artifact. Single observations cannot establish p95.

## Result record

Record pass/fail/not-run for each gate, device model/OS, exact artifact identity, workload, commands or manual steps, and private evidence locations. Retain failures and separate physical results from earlier simulator/emulator results. Follow [RELEASE.md](RELEASE.md) before any store submission; this session alone does not authorize a release-ready claim.
