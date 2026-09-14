#!/usr/bin/env python3
"""Build native distribution artifacts locally. Never uploads or edits store/provider accounts."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def run(command, directory, log):
    with log.open("ab") as stream:
        result = subprocess.run(command, cwd=directory, stdout=stream, stderr=subprocess.STDOUT, check=False)
    if result.returncode:
        raise ValueError(f"{Path(command[0]).name} failed; inspect the protected build log")


def sources():
    names = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
                                     "apps/ios", "apps/android", "packages/offline-contract", "assets/offline", "scripts/offline"], cwd=ROOT)
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in sorted(set(names.decode().split("\0")) - {""}) if (ROOT / name).is_file()}


def verified_metadata(report, platform, config):
    if not isinstance(report, dict) or report.get("passed") is not True or report.get("platform") != platform:
        raise ValueError("Artifact preflight did not report success for the requested platform")
    if report.get("version") != config["version"] or str(report.get("build")) != str(config["build"]):
        raise ValueError("Artifact version/build differs from the requested packaging configuration")
    return report


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_product_binding(report, product, container):
    if not product.is_file():
        raise ValueError("The preflighted product is absent")
    if product.suffix != f".{container}" or report.get("containerType") != container:
        raise ValueError("Packaging requires preflight of the exact retained container type")
    expected = file_sha256(product)
    if report.get("artifactSha256") != expected:
        raise ValueError("The retained product differs from the exact preflighted artifact")
    return expected


def verify_upload_object_binding(report, products, platform):
    """The first product is the exact IPA/AAB intended for upload."""
    if not products or platform not in ("ios", "android"):
        raise ValueError("The requested upload product is absent or unsupported")
    return verify_product_binding(report, products[0], "ipa" if platform == "ios" else "aab")


def configuration(value, platform, store_max):
    common = {"version", "build"}
    required = common | ({"teamId", "container", "profileUUID", "signingIdentity"} if platform == "ios" else
                         {"driveClientId", "uploadCertificateSha256", "driveSigningSha256", "apksigner", "apkanalyzer", "java", "bundletool"})
    if not isinstance(value, dict) or set(value) != required:
        raise ValueError("Configuration must have exactly the documented platform fields")
    if not isinstance(value["version"], str) or not re.fullmatch(r"3\.[0-9]+\.[0-9]+", value["version"]):
        raise ValueError("This major-release profile requires a numeric 3.x.y version")
    if type(value["build"]) is not int or not store_max < value["build"] <= 2_100_000_000:
        raise ValueError("Build must exceed the freshly observed store maximum and fit Android versionCode")
    checks = ({"teamId": r"[A-Z0-9]{10}", "container": r"iCloud\.[A-Za-z0-9.-]{1,248}",
               "profileUUID": r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}",
               "signingIdentity": r"[0-9A-Fa-f]{40}"} if platform == "ios" else
              {"driveClientId": r"[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com",
               "uploadCertificateSha256": r"[0-9a-f]{64}", "driveSigningSha256": r"[0-9a-f]{64}"})
    for name, pattern in checks.items():
        if not isinstance(value[name], str) or not re.fullmatch(pattern, value[name]):
            raise ValueError(f"Invalid {name}; use independent signing/provider records")
    if platform == "android":
        for name in ("apksigner", "apkanalyzer", "java"):
            if not isinstance(value[name], str) or not Path(value[name]).is_absolute() or not os.access(value[name], os.X_OK):
                raise ValueError(f"{name} must name an absolute executable SDK tool")
        if not isinstance(value["bundletool"], str) or not Path(value["bundletool"]).is_absolute() or not Path(value["bundletool"]).is_file():
            raise ValueError("bundletool must name an absolute trusted standalone JAR")
        for name in ("PENNY_ANDROID_KEYSTORE", "PENNY_ANDROID_KEY_ALIAS", "PENNY_ANDROID_STORE_PASSWORD", "PENNY_ANDROID_KEY_PASSWORD"):
            if not os.environ.get(name):
                raise ValueError(f"Missing {name}; signing secrets belong in the process environment")
        if not Path(os.environ["PENNY_ANDROID_KEYSTORE"]).is_file():
            raise ValueError("Configured Android keystore is not a file")
    return value


def ios_build(config, output, log, workspace=None):
    workspace = workspace or ROOT
    bundle = "com.penny.pennyMobile"
    with (workspace / "apps/ios/PennyOffline/Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    info.update({"CFBundleShortVersionString": config["version"], "CFBundleVersion": str(config["build"]),
                 "PennyCloudKitContainerIdentifier": config["container"], "PennyCloudKitSignedBuild": True})
    files = {
        "Info.plist": info,
        "CloudKit.entitlements": {"com.apple.developer.icloud-services": ["CloudKit"],
                                  "com.apple.developer.icloud-container-identifiers": [config["container"]],
                                  "com.apple.developer.icloud-container-environment": "Production"},
        "ExportOptions.plist": {"method": "app-store-connect", "destination": "export", "signingStyle": "manual",
                                "teamID": config["teamId"], "signingCertificate": config["signingIdentity"],
                                "provisioningProfiles": {bundle: config["profileUUID"]},
                                "manageAppVersionAndBuildNumber": False},
    }
    for name, value in files.items():
        with (output / name).open("xb") as stream:
            plistlib.dump(value, stream)
    archive = output / "PennyOffline.xcarchive"
    run(["xcodebuild", "archive", "-project", "apps/ios/PennyOffline.xcodeproj", "-scheme", "PennyOffline",
         "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", str(archive),
         "-derivedDataPath", str(output / "DerivedData"), f"PRODUCT_BUNDLE_IDENTIFIER={bundle}",
         f"MARKETING_VERSION={config['version']}", f"CURRENT_PROJECT_VERSION={config['build']}",
         "CODE_SIGN_STYLE=Manual", "CODE_SIGNING_ALLOWED=YES", f"DEVELOPMENT_TEAM={config['teamId']}",
         f"CODE_SIGN_IDENTITY={config['signingIdentity']}", f"PROVISIONING_PROFILE_SPECIFIER={config['profileUUID']}",
         f"INFOPLIST_FILE={output / 'Info.plist'}", f"CODE_SIGN_ENTITLEMENTS={output / 'CloudKit.entitlements'}",
         "SWIFT_ACTIVE_COMPILATION_CONDITIONS=PENNY_SIGNED_CLOUDKIT"], workspace, log)
    run(["xcodebuild", "-exportArchive", "-archivePath", str(archive), "-exportPath", str(output / "export"),
         "-exportOptionsPlist", str(output / "ExportOptions.plist")], workspace, log)
    ipas = list((output / "export").glob("*.ipa"))
    if len(ipas) != 1:
        raise ValueError("Expected exactly one exported IPA")
    # Archive and exported product may be re-signed differently. The IPA is the
    # upload object; this build report never treats the archived app as its proof.
    return ipas, ["ios", str(ipas[0]),
                  "--team-id", config["teamId"], "--cloud-container", config["container"]]


def android_build(config, output, log, workspace=None):
    workspace = workspace or ROOT
    run(["./gradlew", "--no-daemon", "--no-configuration-cache", "-PpennyRelease=true",
         f"-PpennyVersionName={config['version']}", f"-PpennyVersionCode={config['build']}",
         f"-PpennyDriveAndroidClientId={config['driveClientId']}", f"-PpennyDriveSigningSha256={config['driveSigningSha256']}",
         "assembleRelease", "bundleRelease"], workspace / "apps/android", log)
    built = workspace / "apps/android/app/build/outputs"
    apks, aabs = list((built / "apk/release").glob("*.apk")), list((built / "bundle/release").glob("*.aab"))
    if len(apks) != 1 or len(aabs) != 1:
        raise ValueError("Expected exactly one release APK and AAB")
    outputs = []
    for source in aabs + apks:
        target = output / source.name
        shutil.copyfile(source, target)
        outputs.append(target)
    return outputs, ["android", str(outputs[0]), "--java", config["java"], "--bundletool", config["bundletool"],
                     "--certificate-sha256", config["uploadCertificateSha256"],
                     "--drive-signing-sha256", config["driveSigningSha256"],
                     "--drive-client-id", config["driveClientId"], "--apksigner", config["apksigner"], "--apkanalyzer", config["apkanalyzer"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=["ios", "android"])
    parser.add_argument("--config", type=Path, required=True, help="Protected local JSON with public release configuration, never signing passwords")
    parser.add_argument("--output", type=Path, required=True, help="New owner-only evidence directory; never overwrites")
    parser.add_argument("--store-max-build", type=int, required=True, help="Fresh store inventory, not a historical constant")
    args = parser.parse_args()
    os.umask(0o077)
    output = args.output.resolve()
    try:
        if args.store_max_build < 0:
            raise ValueError("Store maximum must be nonnegative")
        config = configuration(json.loads(args.config.read_text()), args.platform, args.store_max_build)
        if any(output.is_relative_to(ROOT / name) for name in ("apps", "packages", "scripts", "assets")):
            raise ValueError("Output must be outside native/source directories")
        before = sources()
        output.mkdir(mode=0o700, parents=True, exist_ok=False)
        workspace = output / "source"
        for name, digest in before.items():
            source, target = ROOT / name, workspace / name
            if source.is_symlink():
                raise ValueError("Native source snapshot cannot contain symbolic links")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copy2(source, target)
            if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError("Native source changed while taking the build snapshot")
        if before != sources():
            raise ValueError("Native source inventory changed while taking the build snapshot")
        log = output / "build.log"
        products, preflight = (ios_build if args.platform == "ios" else android_build)(config, output, log, workspace)
        if before != sources():
            raise ValueError("Native source changed during packaging; no reproducible artifact acceptance")
        run([sys.executable, str(ROOT / "scripts/offline/release-preflight.py"), *preflight,
             "--version", config["version"], "--store-max-build", str(args.store_max_build)], ROOT, output / "preflight.json")
        observed = verified_metadata(json.loads((output / "preflight.json").read_text()), args.platform, config)
        verified_product_sha = verify_upload_object_binding(observed, products, args.platform)
        local_apk = None
        product_hashes = {products[0].name: verified_product_sha}
        if args.platform == "android":
            if len(products) != 2 or products[1].suffix != ".apk":
                raise ValueError("Android packaging must retain its separately checked installation APK")
            apk_preflight = [*preflight]
            apk_preflight[1] = str(products[1])
            run([sys.executable, str(ROOT / "scripts/offline/release-preflight.py"), *apk_preflight,
                 "--version", config["version"], "--store-max-build", str(args.store_max_build)], ROOT, output / "apk-preflight.json")
            local_apk = verified_metadata(json.loads((output / "apk-preflight.json").read_text()), "android", config)
            product_hashes[products[1].name] = verify_product_binding(local_apk, products[1], "apk")
        # Bind all retained bytes after both inspections as well as immediately
        # after each one; a sibling inspection cannot conceal a replaced upload.
        if any(file_sha256(p) != product_hashes[p.name] for p in products):
            raise ValueError("A retained product changed after preflight")
        report = {"platform": args.platform, "builtAt": datetime.now(timezone.utc).isoformat(),
                  "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip(),
                  "sourceSha256": before, "version": config["version"], "build": config["build"],
                  "verifiedLocalArtifact": observed,
                  "verifiedLocalApk": local_apk,
                  "artifacts": product_hashes,
                  "localAppPreflightPassed": True,
                  "exactUploadObjectPreflightPassed": True,
                  "storeUploadArtifactValidated": False, "uploaded": False,
                  "remaining": "Exact IPA/AAB preflight is local evidence, not Apple/Play processing, delivery or installed-signature acceptance. Provider recovery, migration and physical-device gates remain."}
        (output / "build-report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"packaged": True, "uploaded": False, "report": str(output / "build-report.json")}, indent=2))
        return 0
    except (OSError, ValueError, subprocess.SubprocessError, plistlib.InvalidFileException) as error:
        print(json.dumps({"packaged": False, "uploaded": False, "error": str(error)}, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
