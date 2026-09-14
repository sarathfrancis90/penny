#!/usr/bin/env python3
"""Read-only verification of local Apple build inputs before compilation/linkage."""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def safe_path(value):
    path = Path(value).absolute()
    for candidate in (path, path.resolve()):
        if not re.fullmatch(r"[A-Za-z0-9_./-]+", str(candidate)):
            raise ValueError("unsupported path characters: " + str(candidate))
    return path.resolve()


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def verify_header_inventory(slice_path, artifacts):
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


def inspect(tool, argument, path):
    if tool not in ("lipo", "otool") or argument not in ("-archs", "-l"):
        raise ValueError("unsupported inspection command")
    path = safe_path(path)
    # Fixed executable/tool, allowlisted path, no manifest-provided command or shell.
    return subprocess.run(["/usr/bin/xcrun", tool, argument, str(path)], shell=False,
                          check=True, capture_output=True, text=True, timeout=30).stdout


def verify_build(build, source):
    build, source = safe_path(build), safe_path(source)
    spec = importlib.util.spec_from_file_location("penny_source_verifier", HERE.parent / "verify_source.py")
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    manifest_path = HERE.parent / "source-manifest.json"
    pin = json.loads(manifest_path.read_text())
    verified = verifier.verify_source(source, manifest_path)
    report = json.loads((build / "build-report.json").read_text())
    if report["status"] != "passed" or report["deploymentTarget"] != pin["build"]["iosDeploymentTarget"]:
        raise ValueError("Apple build status/deployment mismatch")
    for field in ("name", "version", "archiveSha256", "sourceTreeSha256", "fileCount"):
        if report["sourceVerification"][field] != verified[field]:
            raise ValueError("Apple build source pin mismatch")
    expected_slices = {"ios-arm64": ("arm64-apple-ios26.0", "2"),
                       "ios-simulator-arm64": ("arm64-apple-ios26.0-simulator", "7")}
    if sorted(s["name"] for s in report["slices"]) != sorted(expected_slices):
        raise ValueError("Apple build must contain exactly both supported slices")
    for row in report["slices"]:
        target, platform = expected_slices[row["name"]]
        if row["target"] != target or row["architecture"] != "arm64":
            raise ValueError("Apple slice target mismatch")
        root = build / row["name"]
        if root.is_symlink() or (root / "install").is_symlink():
            raise ValueError("symlink in Apple slice")
        artifacts = row["artifacts"]
        verify_header_inventory(root, artifacts)
        actual = set()
        for path in (root / "install").rglob("*"):
            if path.is_symlink() or not (path.is_dir() or path.is_file()):
                raise ValueError("non-regular Apple install entry")
            if path.is_file():
                actual.add(path.relative_to(root).as_posix())
        if actual != set(artifacts):
            raise ValueError("Apple install inventory mismatch")
        for name, expected in artifacts.items():
            if not re.fullmatch(r"install/[A-Za-z0-9_./-]+", name) or ".." in Path(name).parts:
                raise ValueError("invalid build artifact name")
            if digest(root / name) != expected:
                raise ValueError("Apple artifact mismatch: " + name)
        if digest(root / "install/LICENSE") != pin["license"]["sha256"]:
            raise ValueError("Apple ISC notice mismatch")
        library = root / "install/lib/libsodium.a"
        if inspect("lipo", "-archs", library).strip() != "arm64":
            raise ValueError("Apple archive architecture mismatch")
        commands = inspect("otool", "-l", library)
        versions = re.findall(r"cmd LC_BUILD_VERSION\s+cmdsize \d+\s+platform (\d+)\s+minos ([0-9.]+)", commands)
        objects = re.findall(r"^.*\.a\(.+\):$", commands, re.MULTILINE)
        if not versions or len(versions) != len(objects) or any(p != platform or minimum != "26.0" for p, minimum in versions):
            raise ValueError("Apple archive platform/deployment mismatch")
    return {"status": "verified", "buildReportSha256": digest(build / "build-report.json"),
            "sourceVerification": verified, "slices": list(expected_slices)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    print(json.dumps(verify_build(args.build, args.source)))


if __name__ == "__main__":
    main()
