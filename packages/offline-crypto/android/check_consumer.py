#!/usr/bin/env python3
"""Exercise actual CMake linkage and reject altered outputs without changing them."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ABIS = ("arm64-v8a", "armeabi-v7a", "x86", "x86_64")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(source):
    return {str(p.relative_to(source)): digest(p) for abi in ABIS
            for p in sorted((source / abi).rglob("*")) if p.is_file()}


def run(command, log, env, expected_error=None):
    # Callers supply only the validated CMake executable, fixed switches and data paths.
    result = subprocess.run(command, shell=False, env=env, capture_output=True, text=True)
    with log.open("a") as stream:
        stream.write(result.stdout + result.stderr)
    if expected_error is None:
        if result.returncode:
            raise RuntimeError(f"CMake failed; see {log}")
    elif not result.returncode or expected_error not in result.stdout + result.stderr:
        raise RuntimeError(f"Expected rejection absent ({expected_error}); see {log}")
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("built", "output", "cmake", "ndk"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    paths = {name: getattr(args, name).resolve() for name in ("built", "output", "cmake", "ndk")}
    for path in [*paths.values(), HERE]:
        if not re.fullmatch(r"[A-Za-z0-9_./+-]+", str(path)):
            parser.error("Paths must contain only ASCII letters/digits and /._+-")
    built, output, cmake, ndk = (paths[k] for k in ("built", "output", "cmake", "ndk"))
    if output.exists() or args.output.is_symlink() or output == built or built in output.parents or output in built.parents:
        parser.error("Output must be new and outside the supplied native build")
    ninja = cmake.with_name("ninja")
    if not all(p.is_file() and os.access(p, os.X_OK) for p in (cmake, ninja)):
        parser.error("Supply installed SDK CMake with its sibling Ninja")
    baseline = inventory(built)
    if not baseline:
        parser.error("No native build artifacts supplied")
    output.mkdir(parents=True, exist_ok=False)
    consumer = output / "consumer"
    consumer.mkdir()
    (consumer / "probe.c").write_text("#include <sodium.h>\nint probe(void) { return sodium_init() + (int)crypto_secretstream_xchacha20poly1305_abytes() + (int)crypto_kdf_hkdf_sha256_keybytes(); }\n")
    (consumer / "CMakeLists.txt").write_text('''cmake_minimum_required(VERSION 3.22)
project(penny_sodium_consumer C)
add_library(consumer SHARED probe.c)
if(PREEXISTING)
  add_library(penny_sodium STATIC IMPORTED)
endif()
include("${PENNY_HELPER}")
penny_link_sodium(consumer "${PENNY_SODIUM_OUTPUT}")
''')
    env = {key: os.environ[key] for key in ("HOME", "TMPDIR") if key in os.environ}
    env.update(PATH=str(cmake.parent) + ":/usr/bin:/bin:/usr/sbin:/sbin", LC_ALL="C")
    results = []

    def check(name, abi, data, extra=(), rejection=None):
        target = output / name
        command = [str(cmake), "-S", str(consumer), "-B", str(target), "-G", "Ninja",
                   "-DCMAKE_MAKE_PROGRAM=" + str(ninja),
                   "-DCMAKE_TOOLCHAIN_FILE=" + str(ndk / "build/cmake/android.toolchain.cmake"),
                   "-DANDROID_ABI=" + abi, "-DANDROID_PLATFORM=android-26",
                   "-DPENNY_HELPER=" + str(HERE / "PennySodium.cmake"),
                   "-DPENNY_SODIUM_OUTPUT=" + str(data), *extra]
        log = output / (name + ".log")
        code = run(command, log, env, rejection)
        if rejection is None:
            run([str(cmake), "--build", str(target)], log, env)
        results.append({"name": name, "configureExit": code, "linked": rejection is None,
                        "expectedRejection": rejection, "command": command})

    for abi in ABIS:
        check("consumer-" + abi, abi, built)
    check("preexisting", "arm64-v8a", built, ["-DPREEXISTING=ON"], "pre-existing penny_sodium")
    altered = output / "altered"
    altered.mkdir()
    shutil.copyfile(built / "build-result.json", altered / "build-result.json")
    shutil.copytree(built / "arm64-v8a", altered / "arm64-v8a")
    header = altered / "arm64-v8a/include/sodium.h"
    header.write_bytes(header.read_bytes() + b"\n/* synthetic test mutation */\n")
    check("altered-header", "arm64-v8a", altered, rejection="Installed header digest mismatch")
    shutil.copyfile(built / "arm64-v8a/include/sodium.h", header)
    archive = altered / "arm64-v8a/lib/libsodium.a"
    archive.write_bytes(archive.read_bytes() + b"synthetic mutation")
    check("altered-archive", "arm64-v8a", altered, rejection="Static archive digest mismatch")
    if inventory(built) != baseline:
        raise RuntimeError("Original native artifacts changed during validation")
    report = {"status": "passed", "helperSha256": digest(HERE / "PennySodium.cmake"),
              "runnerSha256": digest(Path(__file__).resolve()), "checks": results}
    path = output / "consumer-results.json"
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "passed", "checks": len(results), "report": str(path)}))


if __name__ == "__main__":
    main()
