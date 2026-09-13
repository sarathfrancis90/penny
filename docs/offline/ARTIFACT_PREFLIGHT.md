# Native artifact preflight

`npm run offline:release:preflight -- ...` inspects a signed artifact without signing, uploading, modifying a provider account or changing a store record. It fails closed on missing tools or metadata. Tests exercise both plausible valid policy inputs and incorrect builds, signatures, teams, profiles, cloud configuration, privacy metadata and Android permissions.

The command deliberately requires a freshly observed `--store-max-build`. The 10014 value observed on 2026-09-13 is historical evidence, not a permanent default. Supply the independently known Apple team/container or Android certificate; copying a certificate fingerprint out of the artifact being checked does not establish release identity.

## iOS

Use the exported **iPhoneOS `.app`** destined for distribution:

```sh
npm run offline:release:preflight -- ios /absolute/path/PennyOffline.app \
  --version 3.0.0 --store-max-build STORE_MAX_BUILD \
  --team-id APPLE_TEAM_ID --cloud-container iCloud.CONFIGURED_CONTAINER
```

The check verifies Apple's code-signature trust anchor and sealed bundle, signing-certificate team and profile membership, distribution signing authority, production bundle identity, matching app/profile team and application identifier, expiration, disabled debugging, App Store profile shape and actual signed CloudKit entitlements. The app ID prefix is read separately from the team because legacy Apple prefixes can differ. The signed iCloud environment must be Production, the profile must authorize that environment, and the container must match `PennyCloudKitContainerIdentifier`; `PennyCloudKitSignedBuild` must be a Boolean true. These configuration fields alone cannot satisfy the signed-entitlement gate.

The check also requires the packaged privacy manifest and compiled icon metadata/catalog. It checks their presence and basic policy shape, not whether every required-reason declaration or visual asset is correct. Profile decoding is not treated as independent proof that Apple will accept it. Device installation, CloudKit production schema/account operation, signed upgrade, supported-device AI and App Store processing remain necessary.

## Android

Use the signed installation **`.apk`** and the expected certificate for that artifact. A locally upload-key-signed APK and a Play-delivered APK may have different certificates under Play App Signing; compare each to its appropriate independently verified identity.

```sh
npm run offline:release:preflight -- android /absolute/path/penny-offline.apk \
  --version 3.0.0 --store-max-build STORE_MAX_BUILD \
  --certificate-sha256 EXPECTED_CERTIFICATE_SHA256 \
  --drive-signing-sha256 EXPECTED_INSTALLED_APP_CERTIFICATE_SHA256 \
  --drive-client-id REGISTERED_ANDROID_CLIENT_ID.apps.googleusercontent.com \
  --apksigner /absolute/path/build-tools/36.0.0/apksigner \
  --apkanalyzer /absolute/path/cmdline-tools/latest/bin/apkanalyzer
```

The check verifies the APK signature and exact certificate, production package, version/build, disabled debug/test flags, minimum API 26 and target API 37 or later, disabled Android backup/cleartext, absent advertising-ID permission and packaged icon/network policy metadata. Android 17/API 37 is the current platform target for P6; the earlier API 36 development baseline must be upgraded and tested before a release passes. Public `ca.penny.offline.DRIVE_ANDROID_CLIENT_ID` and `ca.penny.offline.DRIVE_SIGNING_SHA256` manifest metadata must match the expected client and signer. These are emitted from the same Gradle properties as the runtime guards. A resource reference does not prove that the referenced network policy blocks SDK telemetry. The separate SDK traffic/privacy review and real Drive registration/consent/restore gates still apply.

The Drive signing guard is compared to `--drive-signing-sha256`, separately from the APK's `--certificate-sha256`. Under Play App Signing the installed registration can use a different certificate from the local upload key; both must be supplied from the appropriate independent records. A structurally correct upload-signed APK need not authorize Drive locally when its guard expects Play's delivered certificate.

The check does not unpack `.ipa` or validate/upload `.aab` files. [Native packaging](NATIVE_PACKAGING.md) builds in an isolated working-tree snapshot and records product digests, with those upload-artifact checks explicitly still open. The development applications are expected to fail this preflight; a green simulator test is not a release artifact.

## Local evidence

On 2026-09-13, all twelve policy/parser test groups passed. Independent review added regressions for the actual iOS leaf certificate/profile membership, profile CloudKit environment and compiled Android resource references for debug/test flags. Unresolved Android Boolean references fail closed. The existing iOS simulator `.app` was rejected for its development identity/build, simulator platform, signing/profile/CloudKit configuration and missing packaged icon/privacy assets. The Android development APK was also inspected with the installed SDK tools and rejected. Sanitized reports are in ignored `artifacts/offline/ios-development-preflight.json` and `android-development-preflight.json`. This is negative-gate evidence; no signed production artifact has passed.

Primary references: [Apple distribution entitlements](https://developer.apple.com/library/archive/qa/qa1798/_index.html), [Apple signature verification](https://developer.apple.com/library/archive/technotes/tn2318/), [Android APK signature verification](https://developer.android.com/tools/apksigner), [Android 17 SDK setup](https://developer.android.com/about/versions/17/setup-sdk).
