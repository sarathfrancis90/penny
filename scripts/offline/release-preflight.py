#!/usr/bin/env python3
"""Read-only checks on signed native artifacts. Never signs, uploads or approves a release."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


def command(args):
    result = subprocess.run(args, capture_output=True, timeout=120, check=False)
    if result.returncode:
        raise ValueError(f"{Path(args[0]).name} {args[1]} failed (exit {result.returncode})")
    return result.stdout


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_common(info, bundle, version, store_max):
    failures = []
    if info.get("bundle") != bundle:
        failures.append("Artifact bundle does not match the existing production listing")
    if info.get("version") != version:
        failures.append("Artifact marketing version does not match the requested release")
    build = str(info.get("build", ""))
    if not re.fullmatch(r"[1-9][0-9]*", build) or int(build) <= store_max:
        failures.append("Artifact build must be an integer greater than the freshly observed store maximum")
    if info.get("signatureVerified") is not True:
        failures.append("Artifact signature verification failed")
    return failures


def validate_ios(info, team, container, version, store_max, now=None):
    failures = validate_common(info, "com.penny.pennyMobile", version, store_max)
    now = now or datetime.now(timezone.utc)
    entitlements = info.get("entitlements", {})
    profile = info.get("profile", {})
    allowed = profile.get("Entitlements", {})
    if info.get("platforms") != ["iPhoneOS"] or info.get("platformName") != "iphoneos":
        failures.append("An iPhoneOS artifact is required; simulator builds cannot pass")
    if info.get("distributionSigner") is not True:
        failures.append("An Apple distribution signing authority is required")
    certificates = profile.get("DeveloperCertificates", [])
    authorized_signers = [hashlib.sha256(value).hexdigest() for value in certificates if isinstance(value, bytes)] if isinstance(certificates, list) else []
    if info.get("signingCertificateSha256") not in authorized_signers:
        failures.append("The actual signing certificate must be authorized by the embedded profile")
    if entitlements.get("com.apple.developer.team-identifier") != team or profile.get("TeamIdentifier") != [team]:
        failures.append("Signed app and profile must match the expected Apple team")
    prefix = profile.get("ApplicationIdentifierPrefix", [])
    app_id = entitlements.get("application-identifier")
    if len(prefix) != 1 or app_id != f"{prefix[0]}.com.penny.pennyMobile" or app_id != allowed.get("application-identifier"):
        failures.append("Signed and provisioned application identifiers must match the production bundle")
    if entitlements.get("get-task-allow") is not False or allowed.get("get-task-allow") is not False:
        failures.append("Distribution app and profile must both disable debugger attachment")
    expiration = profile.get("ExpirationDate")
    if not isinstance(expiration, datetime) or expiration.replace(tzinfo=timezone.utc) <= now:
        failures.append("Provisioning profile is missing or expired")
    if profile.get("ProvisionedDevices") is not None or profile.get("ProvisionsAllDevices") is True:
        failures.append("An App Store distribution profile is required")
    for values, name in ((entitlements, "signed app"), (allowed, "profile")):
        if "CloudKit" not in values.get("com.apple.developer.icloud-services", []):
            failures.append(f"CloudKit is absent from the {name} entitlements")
        if container not in values.get("com.apple.developer.icloud-container-identifiers", []):
            failures.append(f"Expected iCloud container is absent from the {name} entitlements")
    if entitlements.get("com.apple.developer.icloud-container-environment") != "Production":
        failures.append("Signed CloudKit environment must be Production")
    allowed_environment = allowed.get("com.apple.developer.icloud-container-environment")
    if allowed_environment != "Production" and not (isinstance(allowed_environment, list) and "Production" in allowed_environment):
        failures.append("The provisioning profile must authorize the Production CloudKit environment")
    if info.get("cloudContainer") != container or info.get("cloudSignedMarker") is not True:
        failures.append("Signed app CloudKit configuration is absent or does not match the entitlement")
    if not info.get("iconName") or not info.get("assetCatalogPresent"):
        failures.append("Compiled app icon catalog and primary icon metadata are required")
    privacy = info.get("privacy")
    if not isinstance(privacy, dict) or privacy.get("NSPrivacyTracking") is not False:
        failures.append("A compiled app privacy manifest explicitly disabling tracking is required")
    elif privacy.get("NSPrivacyTrackingDomains", []) or not isinstance(privacy.get("NSPrivacyCollectedDataTypes"), list) or not isinstance(privacy.get("NSPrivacyAccessedAPITypes"), list):
        failures.append("Privacy manifest must declare data/API arrays and no tracking domains")
    if info.get("legacyRuntime"):
        failures.append("The native release artifact contains a Flutter runtime")
    return failures


def ios_evidence(app, team):
    with (app / "Info.plist").open("rb") as stream:
        plist = plistlib.load(stream)
    executable = app / plist["CFBundleExecutable"]
    if executable.parent != app or not executable.is_file():
        raise ValueError("Invalid app executable")
    try:
        command(["/usr/bin/codesign", "--verify", "--deep", "--strict", "-R", f'anchor apple generic and certificate leaf[subject.OU] = "{team}"', str(app)])
        verified = True
    except ValueError:
        verified = False
    details = subprocess.run(["/usr/bin/codesign", "-d", "--verbose=4", str(app)], capture_output=True, timeout=30)
    signer = bool(re.search(rb"^Authority=(?:Apple Distribution|iPhone Distribution):", details.stderr, re.M))
    leaf_digest = None
    with tempfile.TemporaryDirectory(prefix="penny-signature-") as directory:
        try:
            prefix = Path(directory) / "certificate"
            command(["/usr/bin/codesign", "-d", "--extract-certificates", str(prefix), str(app)])
            leaf_digest = sha256(Path(f"{prefix}0"))
        except (OSError, ValueError):
            pass
    try:
        entitlements = plistlib.loads(command(["/usr/bin/codesign", "-d", "--entitlements", "-", str(app)]))
    except (ValueError, plistlib.InvalidFileException):
        entitlements = {}
    profile = {}
    if (app / "embedded.mobileprovision").is_file():
        profile = plistlib.loads(command(["/usr/bin/security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")]))
    privacy = None
    if (app / "PrivacyInfo.xcprivacy").is_file():
        with (app / "PrivacyInfo.xcprivacy").open("rb") as stream:
            privacy = plistlib.load(stream)
    return {
        "bundle": plist.get("CFBundleIdentifier"), "version": plist.get("CFBundleShortVersionString"),
        "build": plist.get("CFBundleVersion"), "platforms": plist.get("CFBundleSupportedPlatforms"),
        "platformName": plist.get("DTPlatformName"), "signatureVerified": verified,
        "distributionSigner": signer, "entitlements": entitlements, "profile": profile,
        "signingCertificateSha256": leaf_digest,
        "cloudContainer": plist.get("PennyCloudKitContainerIdentifier"),
        "cloudSignedMarker": plist.get("PennyCloudKitSignedBuild"),
        "iconName": plist.get("CFBundleIcons", {}).get("CFBundlePrimaryIcon", {}).get("CFBundleIconName"),
        "assetCatalogPresent": (app / "Assets.car").is_file(), "privacy": privacy,
        "legacyRuntime": (app / "Frameworks/Flutter.framework").exists(),
        "executableSha256": sha256(executable),
    }


def ios_export_evidence(ipa, team):
    """Inspect the frozen exported payload, never the pre-export Xcode archive."""
    spec = importlib.util.spec_from_file_location("penny_ipa_artifact", Path(__file__).with_name("ipa-artifact.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    with module.inspect_ipa(ipa) as inspected:
        info = ios_evidence(inspected.app, team)
        info.update({"artifactSha256": inspected.sha256, "containerType": "ipa",
                     "archiveEntries": inspected.entries,
                     "archiveUncompressedBytes": inspected.uncompressed_bytes})
        return info


def validate_android(info, fingerprint, client_id, version, store_max, drive_fingerprint=None):
    failures = validate_common(info, "com.penny.penny_mobile", version, store_max)
    if info.get("signers") != [fingerprint.lower().replace(":", "")]:
        failures.append("APK must have exactly the expected signing certificate (use the appropriate upload or installed-app certificate)")
    if info.get("driveClientId") != client_id or info.get("driveSigningSha256", "").lower().replace(":", "") != (drive_fingerprint or fingerprint).lower().replace(":", ""):
        failures.append("Packaged Drive client ID and signing guard must match the independently verified installed-app registration")
    if info.get("debuggable") or info.get("testOnly"):
        failures.append("Debuggable or test-only APK cannot pass release preflight")
    if info.get("allowBackup") != "false" or info.get("cleartext") != "false":
        failures.append("Android OS backup and cleartext networking must be explicitly disabled")
    if info.get("minSdk") != 26 or info.get("targetSdk", 0) < 37:
        failures.append("Native release must support API 26+ and target at least API 37")
    permissions = set(info.get("permissions", []))
    if "android.permission.INTERNET" not in permissions or "com.google.android.gms.permission.AD_ID" in permissions:
        failures.append("Backup networking must be declared and advertising ID permission must be absent")
    if not info.get("icon") or not info.get("networkSecurityConfig"):
        failures.append("Android must package an app icon and explicit network security configuration")
    return failures


def android_manifest_evidence(xml):
    manifest = ET.fromstring(xml)
    ns = "{http://schemas.android.com/apk/res/android}"
    app, sdk = manifest.find("application"), manifest.find("uses-sdk")
    if app is None or sdk is None:
        raise ValueError("APK manifest is missing application or SDK metadata")
    metadata = {entry.get(ns + "name"): entry.get(ns + "value", "") for entry in app.findall("meta-data")}
    return {
        "bundle": manifest.get("package"), "version": manifest.get(ns + "versionName"),
        "build": manifest.get(ns + "versionCode"),
        # Resource references may resolve to true. Only the platform default or
        # an explicit literal false proves either flag disabled here.
        "debuggable": app.get(ns + "debuggable") not in (None, "false"), "testOnly": app.get(ns + "testOnly") not in (None, "false"),
        "allowBackup": app.get(ns + "allowBackup"), "cleartext": app.get(ns + "usesCleartextTraffic"),
        "minSdk": int(sdk.get(ns + "minSdkVersion", "0")), "targetSdk": int(sdk.get(ns + "targetSdkVersion", "0")),
        "permissions": [p.get(ns + "name") for p in manifest.findall("uses-permission")],
        "icon": app.get(ns + "icon"), "networkSecurityConfig": app.get(ns + "networkSecurityConfig"),
        "driveClientId": metadata.get("ca.penny.offline.DRIVE_ANDROID_CLIENT_ID", ""),
        "driveSigningSha256": metadata.get("ca.penny.offline.DRIVE_SIGNING_SHA256", ""),
    }


def android_evidence(apk, apksigner, apkanalyzer):
    try:
        signature = command([apksigner, "verify", "--verbose", "--print-certs", str(apk)]).decode()
        verified = True
    except ValueError:
        signature, verified = "", False
    info = android_manifest_evidence(command([apkanalyzer, "manifest", "print", str(apk)]))
    info.update({"signatureVerified": verified,
                 "signers": re.findall(r"^Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]+)$", signature, re.M),
                 "artifactSha256": sha256(apk), "containerType": "apk"})
    return info


def android_bundle_evidence(aab, fingerprint, java, bundletool):
    """Apply manifest policy to the exact privately snapshotted upload bundle."""
    spec = importlib.util.spec_from_file_location("penny_aab_artifact", Path(__file__).with_name("aab-artifact.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    with module.inspect_aab(aab, expected_signer_sha256=fingerprint.lower().replace(":", ""),
                            java=java, bundletool=bundletool) as inspected:
        info = android_manifest_evidence(inspected.manifest_xml)
        info.update({"signatureVerified": inspected.signature_verified,
                     "signers": [inspected.signer_sha256], "containerType": "aab",
                     "artifactSha256": inspected.sha256, "archiveEntries": inspected.entries,
                     "archiveUncompressedBytes": inspected.uncompressed_bytes,
                     "signedContentEntries": inspected.signed_content_entries,
                     "bundletoolSha256": inspected.bundletool_sha256,
                     "bundletoolVersion": inspected.bundletool_version})
        return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=["ios", "android"])
    parser.add_argument("artifact", type=Path, help="Exported iOS .ipa, signed iPhoneOS .app, or signed Android .apk/.aab")
    parser.add_argument("--version", default="3.0.0")
    parser.add_argument("--store-max-build", type=int, required=True, help="Freshly observed store build/version-code maximum; no stale default")
    parser.add_argument("--team-id")
    parser.add_argument("--cloud-container")
    parser.add_argument("--certificate-sha256")
    parser.add_argument("--drive-client-id")
    parser.add_argument("--drive-signing-sha256", help="Independently verified installed-app certificate bound to Drive; may differ from the upload certificate")
    parser.add_argument("--apksigner", default="apksigner")
    parser.add_argument("--apkanalyzer", default="apkanalyzer")
    parser.add_argument("--java", help="Absolute trusted JDK java executable; required for AAB")
    parser.add_argument("--bundletool", help="Absolute trusted standalone bundletool JAR; required for AAB")
    args = parser.parse_args()
    if args.store_max_build < 0:
        parser.error("--store-max-build must be nonnegative")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", args.version):
        parser.error("--version must be a numeric major.minor.patch")
    try:
        # Container helpers reject final symlinks/special files before snapshotting.
        artifact = args.artifact.absolute() if args.artifact.suffix in (".ipa", ".aab") else args.artifact.resolve(strict=True)
        if args.platform == "ios":
            if not args.team_id or not re.fullmatch(r"[A-Z0-9]{10}", args.team_id) or not args.cloud_container or not re.fullmatch(r"iCloud\.[A-Za-z0-9.-]{1,248}", args.cloud_container):
                parser.error("iOS requires --team-id and an iCloud. --cloud-container")
            if artifact.suffix == ".ipa":
                info = ios_export_evidence(artifact, args.team_id)
            elif artifact.suffix == ".app" and artifact.is_dir():
                info = ios_evidence(artifact, args.team_id)
            else:
                parser.error("iOS artifact must be an exported .ipa or .app directory")
            failures = validate_ios(info, args.team_id, args.cloud_container, args.version, args.store_max_build)
        else:
            if not args.certificate_sha256 or not re.fullmatch(r"(?:[0-9a-fA-F]{64}|(?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2})", args.certificate_sha256):
                parser.error("Android requires the independently verified --certificate-sha256")
            if not args.drive_client_id or not re.fullmatch(r"[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", args.drive_client_id):
                parser.error("Android requires the independently configured --drive-client-id")
            if not args.drive_signing_sha256 or not re.fullmatch(r"(?:[0-9a-fA-F]{64}|(?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2})", args.drive_signing_sha256):
                parser.error("Android requires the independently verified installed-app --drive-signing-sha256")
            if artifact.suffix == ".aab":
                if not args.java or not args.bundletool:
                    parser.error("AAB requires explicit trusted --java and standalone --bundletool paths")
                info = android_bundle_evidence(artifact, args.certificate_sha256, args.java, args.bundletool)
            elif artifact.suffix == ".apk" and artifact.is_file():
                info = android_evidence(artifact, args.apksigner, args.apkanalyzer)
            else:
                parser.error("Android artifact must be a signed .apk or .aab file")
            failures = validate_android(info, args.certificate_sha256, args.drive_client_id, args.version, args.store_max_build, args.drive_signing_sha256)
        report = {key: info.get(key) for key in ("bundle", "version", "build", "signatureVerified", "executableSha256", "artifactSha256", "containerType", "archiveEntries", "archiveUncompressedBytes", "signedContentEntries", "bundletoolSha256", "bundletoolVersion") if key in info}
        report.update({"platform": args.platform, "artifact": os.fspath(artifact), "checkedAt": datetime.now(timezone.utc).isoformat(), "passed": not failures, "failures": failures,
                       "scope": "Local artifact checks only. IPA/AAB modes inspect the exact frozen upload object. Direct .app/APK checks do not establish IPA/AAB validity. Provider operation, signed upgrade, source provenance, Apple/Play processing, delivered signatures and installed behavior remain separate gates."})
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired, plistlib.InvalidFileException, ET.ParseError) as error:
        report = {"platform": args.platform, "passed": False, "failures": [str(error)]}
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
