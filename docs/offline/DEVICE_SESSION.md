# Physical-device session

Planned for **September 15, 2026**, when the user can connect an iPhone and Android phone to this Mac. Models and OS versions are pending. This is preparation, not completed device evidence.

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
