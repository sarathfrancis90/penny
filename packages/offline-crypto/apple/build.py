#!/usr/bin/env python3
"""Build verified libsodium as minimal Apple static slices; never link Penny."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
SLICES = {
    "ios-arm64": ("iphoneos", "arm64-apple-ios26.0", "IOS"),
    "ios-simulator-arm64": ("iphonesimulator", "arm64-apple-ios26.0-simulator", "IOSSIMULATOR"),
}


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def output(command, env):
    return subprocess.check_output(command, env=env, text=True, stderr=subprocess.STDOUT).strip()


def require_supported_path(path, label):
    # Upstream configure/make expands some paths without shell quoting.
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", str(path)):
        raise ValueError(f"unsupported {label} path: use only ASCII letters, digits, slash, dot, underscore and hyphen; whitespace and shell metacharacters are not supported")


def clean_environment():
    # Do not let inherited compiler/configure hooks change the selected build.
    env = {key: os.environ[key] for key in ("HOME", "TMPDIR", "DEVELOPER_DIR") if key in os.environ}
    env.update(PATH="/usr/bin:/bin:/usr/sbin:/sbin", LANG="C", LC_ALL="C", CONFIG_SITE="/dev/null", ZERO_AR_DATE="1")
    return env


def verify_source(source):
    # Shared verifier is supplied by the package's source-fetch/preflight owner.
    verifier = HERE.parent / "verify_source.py"
    result = subprocess.run([sys.executable, str(verifier), "--source", str(source),
                             "--manifest", str(HERE.parent / "source-manifest.json")],
                            check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--deployment-target", choices=["26.0"], required=True)
    parser.add_argument("--jobs", type=int, choices=range(1, 5), default=2)
    parser.add_argument("--preflight-only", action="store_true", help="verify source/configuration/tool paths without creating output or building")
    args = parser.parse_args()
    source, destination = args.source.resolve(), args.output.resolve()
    try:
        for path, label in [(source, "source"), (destination, "output"), (HERE, "helper")]:
            require_supported_path(path, label)
        if "DEVELOPER_DIR" in os.environ:
            require_supported_path(os.environ["DEVELOPER_DIR"], "DEVELOPER_DIR")
    except ValueError as error:
        parser.error(str(error))
    if source == destination or source in destination.parents or destination in source.parents:
        parser.error("source and output must not overlap")
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        parser.error("output must be absent or an empty directory")
    manifest = json.loads((HERE.parent / "source-manifest.json").read_text())
    if manifest["build"]["iosDeploymentTarget"] != args.deployment_target:
        parser.error("deployment target does not match the pinned source manifest")
    verification = verify_source(source)  # Must succeed before configure or creating output.
    env = clean_environment()
    toolchain = {"xcode": output(["/usr/bin/xcodebuild", "-version"], env),
                 "developerDirectory": output(["/usr/bin/xcode-select", "-p"], env)}
    plans = []
    try:
        require_supported_path(toolchain["developerDirectory"], "selected Xcode")
        for name, (sdk_name, target, expected_platform) in SLICES.items():
            sdk = output(["/usr/bin/xcrun", "--sdk", sdk_name, "--show-sdk-path"], env)
            paths = {tool: output(["/usr/bin/xcrun", "--sdk", sdk_name, "--find", tool], env)
                     for tool in ("clang", "swiftc", "ar", "ranlib")}
            for path, label in [(sdk, f"{name} SDK"), *[(path, f"{name} {tool}") for tool, path in paths.items()]]:
                require_supported_path(path, label)
            plans.append((name, target, expected_platform, sdk, paths))
    except ValueError as error:
        parser.error(str(error))
    if args.preflight_only:
        print(json.dumps({"status": "preflight-passed", "sourceVerification": verification, "slices": [p[0] for p in plans]}))
        return
    destination.mkdir(parents=True, exist_ok=True)
    report = {"status": "building", "source": str(source), "sourceVerification": verification,
              "deploymentTarget": args.deployment_target, "toolchain": toolchain, "slices": []}
    started = time.monotonic()
    try:
        for name, target, expected_platform, sdk, paths in plans:
            root = destination / name
            build, install = root / "build", root / "install"
            build.mkdir(parents=True)
            clang, swiftc = paths["clang"], paths["swiftc"]
            flags = shlex.join(["-Os", "-target", target, "-isysroot", sdk])
            build_env = dict(env, CC=shlex.quote(clang), CFLAGS=flags, LDFLAGS=flags,
                             AR=paths["ar"], RANLIB=paths["ranlib"])
            commands = [[str(source / "configure"), "--host=aarch64-apple-darwin", "--enable-minimal",
                         "--disable-shared", "--with-pic", "--prefix=" + str(install)],
                        ["/usr/bin/make", "-j" + str(args.jobs), "install"]]
            library = install / "lib/libsodium.a"
            probe = root / "libPennySodiumLinkProbe.dylib"
            commands.append([swiftc, "-target", target, "-sdk", sdk, "-I", str(install / "include"),
                             "-parse-as-library", "-emit-library", "-module-name", "PennySodiumLinkProbe",
                             str(HERE / "LinkProbe.swift"), str(library), "-o", str(probe)])
            with (root / "build.log").open("w") as log:
                for command in commands[:2]:
                    subprocess.run(command, cwd=build, env=build_env, stdout=log, stderr=subprocess.STDOUT, check=True)
                (install / "include/module.modulemap").write_text('module Clibsodium { header "sodium.h" export * }\n')
                shutil.copyfile(source / "LICENSE", install / "LICENSE")
                # Selected Xcode Swift compiler and allowlisted paths; argv is never shell text.
                # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
                subprocess.run(commands[2], shell=False, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
            platform = output(["/usr/bin/xcrun", "vtool", "-show-build", str(probe)], env)
            architecture = output(["/usr/bin/lipo", "-archs", str(probe)], env)
            platform_fields = {line.strip() for line in platform.splitlines()}
            if architecture != "arm64" or f"platform {expected_platform}" not in platform_fields or "minos 26.0" not in platform_fields:
                raise RuntimeError("linked probe platform/deployment validation failed: " + platform)
            (root / "probe-platform.txt").write_text(platform + "\n")
            report["slices"].append({"name": name, "sdk": sdk, "target": target, "commands": commands,
                                      "compilerVersion": output([clang, "--version"], env),
                                      "flags": flags, "architecture": architecture, "platform": platform,
                                      "artifacts": {str(p.relative_to(root)): digest(p) for p in
                                                    sorted(install.rglob("*")) if p.is_file()},
                                      "probeSha256": digest(probe)})
        if verify_source(source) != verification:
            raise RuntimeError("source verification changed during build")
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        raise
    finally:
        report["elapsedSeconds"] = round(time.monotonic() - started, 3)
        (destination / "build-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "passed", "report": str(destination / "build-report.json")}))


if __name__ == "__main__":
    main()
