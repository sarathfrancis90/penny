# Provider configuration and remaining account gates

Updated 2026-09-13. This records actual configuration work separately from native fake-provider tests. No real user backup object has been uploaded, downloaded or restored by these development checks.

## Google Drive

The existing Penny Firebase configuration contains three Android OAuth registrations for the production package. The current local development APK's signing SHA-1 matches one of them. Neither isolated native development package is registered there. This establishes a possible production-package QA configuration; it does not establish the final Play signing identity or consent for any Google account. Generated Firebase configuration values must not be copied into documentation or logs.

A read-only Service Usage inventory initially confirmed that the existing project's Drive API was disabled. On **2026-09-13 at 21:09 UTC**, the integrating agent enabled `drive.googleapis.com` for that existing project under the authorized backup implementation. A fresh service inventory confirmed it enabled. No OAuth consent, billing purchase, new cloud project, data upload or account migration occurred. Sanitized evidence: ignored `artifacts/offline/google-provider-config-inventory.json` and `drive-api-enablement.json`.

The native development build keeps its configuration guards empty. Before creating an enabled QA build, bind the exact package and independently verified signing certificate to the matching Android OAuth registration. The app uses `drive.appdata` only and verifies the selected account through Drive's opaque permission identity. No client secret or server token exchange belongs in either native app.

The signed artifact must carry matching `DRIVE_ANDROID_CLIENT_ID` / `DRIVE_SIGNING_SHA256` configuration and corresponding public manifest metadata. Supply these through protected local/CI build configuration; the checked-in defaults remain unconfigured. The intended existing production package can be tested in a new isolated emulator without replacing an existing Flutter installation. A production-package build is not a signed-upgrade test merely because it installs cleanly.

Remaining account gates: actual consent with the intended Google account, scope/identity confirmation, encrypted create/download/manifest readback, network interruption and revoked authorization, and recovery on a clean installation with the saved key. Test the appropriate Play-delivered signing certificate separately from a local development or upload certificate. Enabling the API does not close any of these gates.

## iCloud / CloudKit

The read-only App Store Connect capability inventory showed no iCloud capability on the existing production bundle. No iCloud capability, container, schema or profile has been changed by this work. The native transport and its signed-device compilation branch are implemented and compile-tested; simulator tests use a synthetic provider. A read-only `xcrun cktool get-teams` attempt also reported **“No management token found”**; the installed CLI currently has no usable CloudKit management credential. This is separate from the existing App Store Connect key. Sanitized evidence is in ignored `artifacts/offline/cloudkit-management-inventory.json`.

A direct browser check of CloudKit Console also reached Apple's account sign-in form, with no authenticated session available. The sign-in tab is left for the account owner. No identifier, password, passkey or new management credential was entered. Apple's documented management token is tied to a developer team/user, while private-database user tokens require interactive login; an existing App Store Connect API key does not establish either session. [CloudKit automation authentication](https://developer.apple.com/icloud/cloudkit/automating/).

An enabled build requires a registered CloudKit container associated with the production App ID, matching entitlements/profile, the `PENNY_SIGNED_CLOUDKIT` compile condition, and matching `PennyCloudKitContainerIdentifier` / Boolean `PennyCloudKitSignedBuild` configuration. The default simulator/ad hoc build cannot construct `CKContainer`. Configuration fields do not establish entitlement authorization: run the [artifact preflight](ARTIFACT_PREFLIGHT.md) on the actual distribution app.

Register the container through the authorized Apple developer team, define the `PennyEncryptedObject` record type and fields/indexes documented in the [iOS README](../../apps/ios/README.md), and validate the development schema before deploying it to production. Apple's Xcode workflow can register and associate containers; the App Store Connect API also exposes capability management. Neither the existence of local signing identities nor a passed unsigned build establishes that those provider changes are provisioned.

Remaining account gates: an enabled, correctly signed app with the intended iCloud account, private-database upload/fetch verification, schema and quota/account-change behavior, and recovery on a clean installation. CloudKit owns CKAsset transfer materialization, so real-provider resource behavior must also be measured. Background scheduling and exact device wake timing require their own evidence.

Primary setup references: [Drive app data](https://developers.google.com/workspace/drive/api/guides/appdata), [Drive identity fields](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get), [Xcode iCloud configuration](https://developer.apple.com/documentation/xcode/configuring-icloud-services), [CloudKit enablement](https://developer.apple.com/documentation/cloudkit/enabling-cloudkit-in-your-app), [App Store Connect capability management](https://developer.apple.com/documentation/appstoreconnectapi/bundle-id-capabilities).
