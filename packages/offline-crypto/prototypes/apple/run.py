#!/usr/bin/env python3
"""Run the experimental frame codec on one explicitly selected, idle simulator."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]


def safe_path(value):
    path = Path(value).absolute()
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", str(path)):
        raise ValueError("unsupported path characters: " + str(path))
    resolved = path.resolve()
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", str(resolved)):
        raise ValueError("unsupported resolved path characters: " + str(resolved))
    return resolved


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_header_inventory(slice_path, artifacts):
    """Reject include-path shadowing and symlink escapes before invoking Xcode."""
    include = slice_path / "install/include"
    if include.is_symlink() or not include.is_dir():
        raise ValueError("Apple include directory must be a regular directory")
    actual = set()
    for path in include.rglob("*"):
        if path.is_symlink():
            raise ValueError("symlink in Apple include directory")
        if path.is_file():
            actual.add(path.relative_to(slice_path).as_posix())
        elif not path.is_dir():
            raise ValueError("non-regular Apple include entry")
    expected = {name for name in artifacts if name.startswith("install/include/")}
    if not expected or actual != expected:
        raise ValueError("Apple installed header inventory mismatch")


def run(argv, cwd=None):
    # Fixed executables, validated paths/UUID, no shell or executable from a manifest.
    if argv[0] not in ("/usr/bin/xcrun", "/opt/homebrew/bin/xcodegen"):
        raise ValueError("unsupported executable")
    return subprocess.run(argv, cwd=cwd, check=True, shell=False, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900).stdout


def fixtures(manifest, key):
    document = json.loads(manifest.read_text())
    results = []
    for item in document[key]:
        filename = item["file"]
        if not re.fullmatch(r"[a-z0-9-]+\.pennyframe", filename):
            raise ValueError("invalid fixture filename")
        path = manifest.parent / filename
        if path.is_symlink() or path.stat().st_size != item["ciphertextBytes"] or digest(path) != item["ciphertextSha256"]:
            raise ValueError("fixture hash/size mismatch: " + filename)
        results.append(path)
    return [manifest, *results]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apple-build", required=True, help="Build root containing build-report.json and both slices")
    parser.add_argument("--negative-fixtures", required=True, help="Materialized reference negative-files directory")
    parser.add_argument("--output", required=True, help="New directory underneath this prototype's .build")
    parser.add_argument("--simulator", required=True, help="UUID of an explicitly owned shutdown simulator")
    parser.add_argument("--preflight-only", action="store_true", help="Verify local inputs and idle simulator without creating output or booting")
    parser.add_argument("--native-manifest", help="Optional Android native fixture manifest; runs only the focused interchange XCTest")
    args = parser.parse_args()
    build, negatives, output = map(safe_path, [args.apple_build, args.negative_fixtures, args.output])
    if not output.is_relative_to(HERE / ".build") or output.exists():
        raise ValueError("output must be a new directory under prototypes/apple/.build")
    if not re.fullmatch(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}", args.simulator):
        raise ValueError("invalid simulator UUID")
    # These are the user's normal demo and concurrent Flutter CI devices.
    if args.simulator in ("730A6A04-3E7B-4B48-928C-7FE76873010F", "ADAF1F4D-A375-4DB2-85E7-9A1AA76F3D82"):
        raise ValueError("reserved simulator")
    report = json.loads((build / "build-report.json").read_text())
    pin = json.loads((REPO / "packages/offline-crypto/source-manifest.json").read_text())
    if report["status"] != "passed" or report["deploymentTarget"] != "26.0":
        raise ValueError("Apple build was not validated at deployment target 26.0")
    verified = report["sourceVerification"]
    if verified["version"] != pin["version"] or verified["sourceTreeSha256"] != pin["sourceTree"]["sha256"] or verified["archiveSha256"] != pin["archive"]["sha256"]:
        raise ValueError("Apple build source pin mismatch")
    slice_report = next(row for row in report["slices"] if row["name"] == "ios-simulator-arm64")
    slice_path = build / "ios-simulator-arm64"
    verify_header_inventory(slice_path, slice_report["artifacts"])
    for name, expected in slice_report["artifacts"].items():
        if not re.fullmatch(r"install/[A-Za-z0-9_./-]+", name) or ".." in Path(name).parts:
            raise ValueError("invalid build artifact name")
        if digest(slice_path / name) != expected:
            raise ValueError("Apple artifact mismatch: " + name)
    install = slice_path / "install"
    files = fixtures(REPO / "packages/offline-contract/fixtures/v4-frames/fixture-manifest.json", "positives")
    files += fixtures(negatives / "negative-manifest.json", "cases")
    native_manifest = safe_path(args.native_manifest) if args.native_manifest else None
    native_files = fixtures(native_manifest, "positives") if native_manifest else []
    devices = json.loads(run(["/usr/bin/xcrun", "simctl", "list", "devices", "--json"]))["devices"]
    device = next((d for group in devices.values() for d in group if d["udid"] == args.simulator), None)
    if not device or not device["isAvailable"] or device["state"] != "Shutdown":
        raise ValueError("selected simulator must exist, be available and shutdown")
    if args.preflight_only:
        print(json.dumps({"status": "preflight-passed", "simulator": args.simulator, "outputCreated": False}))
        return
    output.mkdir(parents=True)
    for folder in ("Sources", "Tests"):
        shutil.copytree(HERE / folder, output / folder)
    if native_manifest:
        shutil.copy2(HERE / "InterchangeTests/V4NativeInterchangeTests.swift", output / "Tests/V4NativeInterchangeTests.swift")
    (output / "Fixtures").mkdir()
    for path in files:
        shutil.copy2(path, output / "Fixtures" / path.name)
    if native_manifest:
        native_output = output / "Fixtures/Native"; native_output.mkdir()
        for path in native_files[1:]:
            shutil.copy2(path, native_output / path.name)
        shutil.copy2(native_manifest, native_output / "native-manifest.json")
    spec = {"name": "PennyV4FramePrototype", "options": {"deploymentTarget": {"iOS": "26.0"}},
            "settings": {"SWIFT_VERSION": "5.0", "GENERATE_INFOPLIST_FILE": True,
                         "HEADER_SEARCH_PATHS": str(install / "include"), "SWIFT_INCLUDE_PATHS": str(install / "include"),
                         "OTHER_LDFLAGS": str(install / "lib/libsodium.a")},
            "targets": {"PennyV4FramePrototypeTests": {"type": "bundle.unit-test", "platform": "iOS",
                "sources": ["Sources", "Tests", {"path": "Fixtures", "type": "folder", "buildPhase": "resources"}],
                "settings": {"PRODUCT_BUNDLE_IDENTIFIER": "ca.penny.prototype.v4frames.tests"}}},
            "schemes": {"PennyV4FramePrototype": {"build": {"targets": {"PennyV4FramePrototypeTests": "all"}},
                        "test": {"targets": ["PennyV4FramePrototypeTests"]}}}}
    (output / "project.json").write_text(json.dumps(spec, indent=2))
    (output / "xcodegen.log").write_text(run(["/opt/homebrew/bin/xcodegen", "generate", "--spec", str(output / "project.json")], cwd=output))
    commands = []
    def record(argv, log):
        commands.append(argv)
        try:
            result = run(argv, cwd=output)
        except subprocess.CalledProcessError as error:
            (output / log).write_text(error.stdout or "")
            raise
        (output / log).write_text(result)
        return result
    started = False
    try:
        record(["/usr/bin/xcrun", "simctl", "boot", args.simulator], "boot.log"); started = True
        record(["/usr/bin/xcrun", "simctl", "bootstatus", args.simulator, "-b"], "bootstatus.log")
        result = output / "Frames.xcresult"
        test_command = ["/usr/bin/xcrun", "xcodebuild", "test", "-project", str(output / "PennyV4FramePrototype.xcodeproj"),
                "-scheme", "PennyV4FramePrototype", "-destination", "id=" + args.simulator,
                "-parallel-testing-enabled", "NO", "-derivedDataPath", str(output / "DerivedData"),
                "-resultBundlePath", str(result)]
        if native_manifest:
            test_command += ["-only-testing:PennyV4FramePrototypeTests/V4NativeInterchangeTests"]
        record(test_command, "xcodebuild.log")
        record(["/usr/bin/xcrun", "xcresulttool", "get", "test-results", "summary", "--path", str(result)], "test-summary.json")
        record(["/usr/bin/xcrun", "xcresulttool", "export", "attachments", "--path", str(result),
                "--output-path", str(output / "attachments")], "export.log")
    finally:
        if started:
            record(["/usr/bin/xcrun", "simctl", "shutdown", args.simulator], "shutdown.log")
        (output / "provenance.json").write_text(json.dumps({"scope": "experimental frame-only codec", "commands": commands,
            "device": device, "sourcePin": verified, "appleBuildReportSha256": digest(build / "build-report.json"),
            "librarySha256": digest(install / "lib/libsodium.a"),
            "nativeManifestSha256": digest(native_manifest) if native_manifest else None,
            "sourceHashes": {str(p.relative_to(output)): digest(p) for folder in ("Sources", "Tests") for p in (output / folder).glob("*.swift")}}, indent=2) + "\n")
    print(output / "test-summary.json")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, KeyError, StopIteration) as error:
        print(f"frame prototype validation failed: {error}", file=sys.stderr)
        sys.exit(1)
