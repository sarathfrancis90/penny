# Local native release packaging

`npm run offline:release:package` builds native distribution products in a new protected directory. It snapshots and hashes the current native source, including uncommitted native work, then builds that isolated copy. It does not clean development outputs, modify tracked configuration, install a profile, enable a provider, upload a build, or create a store release. The retained Flutter release workflow is separate.

The command requires a freshly observed store maximum and rejects an existing output directory. The generated report must match the requested version and exact build. A source change during snapshot/build or a failed artifact preflight prevents a successful report. Build logs and generated provider configuration stay in the owner-only output; do not publish that directory indiscriminately. Source digests identify this working-tree snapshot; they do not prove hosted CI or lock every transitive dependency.

The isolated source inventory includes `packages/offline-crypto`, its pins, license and build helpers. Before either native build, packaging authenticates a fresh libsodium source download and builds the required static libraries under the owned output's `crypto/` directory. Node 22 and network access are build prerequisites; the installed app does not download these libraries. Android additionally requires NDK 28.2.13676358 and CMake 3.22.1 under the absolute `ANDROID_HOME` SDK. Release packaging does not generate or include the test corpus. A dependency-preparation failure stops before native archive/bundle creation.

## iOS profile

Create a protected local JSON file with exactly these fields:

| Field | Required value |
| --- | --- |
| `version` | Numeric `3.x.y` marketing version |
| `build` | Integer greater than the freshly read store maximum |
| `teamId` | Independently verified ten-character Apple team |
| `container` | Registered and provisioned `iCloud.` container |
| `profileUUID` | UUID of an already installed App Store distribution profile |
| `signingIdentity` | SHA-1 identifier of the appropriate installed distribution signing certificate |

The profile and private signing key must already be usable by Xcode. The script does not pass `-allowProvisioningUpdates`. It generates a separate Info.plist and CloudKit entitlement file, enables the real-device CloudKit compile condition, archives for iPhoneOS, and exports with destination `export`. It disables automatic version/build rewriting. The exported IPA payload passes the signed-artifact preflight before the build report is written. The retained IPA digest must match the exact frozen object inspected by that preflight.

```sh
npm run offline:release:package -- ios \
  --config /absolute/protected/ios-release.json \
  --output /absolute/protected/new-ios-build \
  --store-max-build FRESH_STORE_MAXIMUM
```

Xcode can re-sign during export, so packaging now checks the app inside the exported `.ipa`. The extractor snapshots the archive into private temporary storage, validates its bounded ZIP layout and inspects the resulting payload while that snapshot remains owned. The report records its exact SHA-256 and `exactUploadObjectPreflightPassed: true` for a checked IPA (or Android AAB in the separate profile). `storeUploadArtifactValidated: false` remains explicit: local payload/signature checks do not establish Apple processing, store delivery or installation. Direct `.app` preflight remains available but cannot satisfy this packaging gate.

## Android profile

Create a protected local JSON file with exactly `version`, `build`, `driveClientId`, `uploadCertificateSha256`, `driveSigningSha256`, `apksigner`, `apkanalyzer`, `java` and `bundletool`. Version/build rules match iOS. The SDK tools and JDK17+ `java` are absolute executable paths. `bundletool` is the absolute path to an independently trusted standalone JAR; the dependency JAR in Gradle caches is insufficient. The bundletool JAR is never downloaded by preflight. Both certificates use 64 lowercase hexadecimal characters and come from independent signing records.

`uploadCertificateSha256` identifies the key signing the locally built APK/AAB. `driveSigningSha256` identifies the certificate on the intended installed app and must match that package's `driveClientId` registration. With Play App Signing these certificates can differ. The local upload-signed APK will not authorize Drive when its embedded guard correctly expects Play's different installed certificate; test that path using a Play-delivered artifact. Do not replace the installed certificate with the upload fingerprint merely to make local authorization work.

Provide signing secrets through the process environment: `PENNY_ANDROID_KEYSTORE`, `PENNY_ANDROID_KEY_ALIAS`, `PENNY_ANDROID_STORE_PASSWORD`, `PENNY_ANDROID_KEY_PASSWORD`. Keep passwords out of JSON, command arguments, checked-in Gradle files and logs. Set `ANDROID_HOME` to the installed SDK for the isolated build. The guarded Gradle release profile selects the production package only with explicit release inputs and cannot be combined with the test sandbox.

```sh
npm run offline:release:package -- android \
  --config /absolute/protected/android-release.json \
  --output /absolute/protected/new-android-build \
  --store-max-build FRESH_STORE_MAXIMUM
```

The script builds `assembleRelease` and `bundleRelease` and retains the AAB first as the upload product, plus its separately checked installation APK. Both preflights must pass the requested version/build and provider/signing policy. AAB preflight validates the frozen single-module bundle, all signed content and its actual base manifest; APK preflight uses the SDK verifier/analyzer. The upload certificate and independently verified installed-app Drive certificate remain distinct inputs. Hash checks bind each report to its corresponding retained file and recheck both files after both inspections.

`verifiedLocalArtifact` records the exact AAB check; `verifiedLocalApk` records the separate APK check. `exactUploadObjectPreflightPassed: true` means local IPA/AAB checks passed, while `storeUploadArtifactValidated: false` and `uploaded: false` remain explicit. Play processing, re-signing and delivered APK installation still require separate evidence.

## Current evidence

Prerequisite, metadata, source-plist preservation and no-upload command tests pass locally. Independent review caught and corrected upload/installed certificate conflation and a requested-versus-observed build mismatch. This tooling has not produced an accepted signed distribution artifact: CloudKit provisioning and the final Android upload-key configuration remain outstanding. Do not infer positive signing or package validity from mocked command tests. See [ARTIFACT_PREFLIGHT.md](ARTIFACT_PREFLIGHT.md), [PROVIDER_SETUP.md](PROVIDER_SETUP.md) and [RELEASE.md](RELEASE.md).

Primary packaging references: [Apple command-line archive/export](https://developer.apple.com/library/archive/technotes/tn2339/_index.html), [Apple archive export files](https://help.apple.com/xcode/mac/current/en.lproj/deva1f2ab5a2.html), [Android command-line app bundles](https://developer.android.com/build/building-cmdline), [bundletool](https://developer.android.com/tools/bundletool).
