#!/usr/bin/env python3
"""Build verified libsodium into a new, explicit Android output directory."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ABIS = {
    "arm64-v8a": ("aarch64-linux-android", "aarch64-linux-android", "AArch64"),
    "armeabi-v7a": ("armv7a-linux-androideabi", "arm-linux-androideabi", "ARM"),
    "x86": ("i686-linux-android", "i686-linux-android", "Intel 80386"),
    "x86_64": ("x86_64-linux-android", "x86_64-linux-android", "Advanced Micro Devices X86-64"),
}
NDK_VERSION = "28.2.13676358"
API = 26
LINK_FLAGS = ["-Wl,-z,defs", "-Wl,-z,max-page-size=16384", "-Wl,-z,common-page-size=16384"]


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(source, manifest):
    result = subprocess.run([sys.executable, str(HERE.parent / "verify_source.py"),
                             "--source", str(source), "--manifest", str(manifest)],
                            check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


def check_elf(readelf, library, machine):
    details = subprocess.check_output([str(readelf), "-h", "-l", "-d", "-W", str(library)], text=True)
    if not re.search(r"Machine:\s+" + re.escape(machine) + r"\s*$", details, re.M):
        raise ValueError("Unexpected ELF architecture")
    loads = [line.split() for line in details.splitlines() if line.strip().startswith("LOAD ")]
    if not loads or any(int(row[-1], 16) < 16384 for row in loads):
        raise ValueError("ELF LOAD alignment is smaller than 16 KiB")
    if re.search(r"\(TEXTREL\)|FLAGS[^\n]*TEXTREL", details):
        raise ValueError("ELF contains text relocations")
    return details


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ndk", required=True, type=Path)
    parser.add_argument("--manifest", type=Path, default=HERE.parent / "source-manifest.json")
    parser.add_argument("--api", type=int, default=API)
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    if not all(p.is_absolute() for p in (args.source, args.output, args.ndk, args.manifest)):
        raise ValueError("All paths must be absolute")
    source, output, ndk, manifest = (p.resolve() for p in (args.source, args.output, args.ndk, args.manifest))
    # Autoconf/libtool evaluate compiler/flag strings through a shell. Keep the
    # supported path grammar explicit instead of interpolating arbitrary text.
    if any(not re.fullmatch(r"[A-Za-z0-9_./+\-]+", str(p)) for p in (source, output, ndk)):
        raise ValueError("Source, output and NDK paths must not contain spaces or shell metacharacters")
    if args.output.is_symlink() or output.exists() or source in output.parents or output in source.parents:
        raise ValueError("Output must be a new directory outside the source tree")
    if args.api != API or not 1 <= args.jobs <= 32:
        raise ValueError("Only API 26 and 1..32 build jobs are supported")
    config = json.loads(manifest.read_text())
    if (config.get("schemaVersion") != 1 or config.get("name") != "libsodium" or
            config.get("version") != "1.0.22" or config.get("build", {}).get("androidApi") != API or
            config.get("build", {}).get("androidNdk") != NDK_VERSION):
        raise ValueError("Unsupported source/build manifest")
    properties = (ndk / "source.properties").read_text()
    if not re.search(r"^Pkg.Revision\s*=\s*" + re.escape(NDK_VERSION) + r"\s*$", properties, re.M):
        raise ValueError("NDK must be exactly " + NDK_VERSION)
    host = {"Darwin": "darwin-x86_64", "Linux": "linux-x86_64"}.get(platform.system())
    if host is None:
        raise ValueError("Build host must be macOS or Linux with the matching NDK")
    toolchain = ndk / "toolchains/llvm/prebuilt" / host
    tools = {name: toolchain / "bin" / ("llvm-" + name) for name in ("ar", "ranlib", "strip", "nm", "readelf")}
    compilers = {abi: toolchain / "bin" / (target + str(API) + "-clang") for abi, (target, _, _) in ABIS.items()}
    for tool in [*tools.values(), *compilers.values()]:
        if not tool.is_file() or not os.access(tool, os.X_OK):
            raise ValueError("Required NDK tool unavailable: " + str(tool))
    verified = verify(source, manifest)  # Full current tree validation before running configure.
    output.mkdir(parents=True, exist_ok=False)
    # Do not inherit compiler, SDK, configure-cache, or user CFLAGS/LDFLAGS overrides.
    env = {key: os.environ[key] for key in ("HOME", "TMPDIR") if key in os.environ}
    env.update(PATH=str(toolchain / "bin") + ":/usr/bin:/bin:/usr/sbin:/sbin", LC_ALL="C", TZ="UTC",
               CONFIG_SITE="/dev/null", SOURCE_DATE_EPOCH="0", ZERO_AR_DATE="1")
    records = []
    for abi, (_, target, machine) in ABIS.items():
        build = output / "work" / abi
        prefix = output / abi
        build.mkdir(parents=True)
        local = env | {"CC": str(compilers[abi]), "AR": str(tools["ar"]), "RANLIB": str(tools["ranlib"]),
                       "STRIP": str(tools["strip"]), "NM": str(tools["nm"]),
                       "CFLAGS": "-Os -fPIC -ffile-prefix-map=" + str(source) + "=/penny/libsodium-source -ffile-prefix-map=" + str(output) + "=/penny/libsodium-build",
                       "LDFLAGS": " ".join(LINK_FLAGS)}
        configure = [str(source / "configure"), "--host=" + target, "--with-sysroot=" + str(toolchain / "sysroot"),
                     "--enable-minimal", "--disable-shared", "--enable-static", "--with-pic", "--prefix=" + str(prefix)]
        with (output / (abi + ".log")).open("w") as log:
            for command in (configure, ["make", "-j" + str(args.jobs), "install"]):
                # Verified configure or fixed make; paths/jobs validated above and no host shell.
                # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
                subprocess.run(command, shell=False, cwd=build, env=local, stdout=log, stderr=subprocess.STDOUT, check=True)
        library = prefix / "lib/libsodium.a"
        # Link all archive members to catch non-PIC objects/unresolved dependencies.
        # This is an ELF validation artifact only, never a production JNI wrapper.
        probe = build / "link-check.c"
        probe.write_text('#include <sodium.h>\nint penny_sodium_link_check(void) { return sodium_init(); }\n')
        elf = build / "libpenny_sodium_link_check.so"
        link = [str(compilers[abi]), "-shared", "-fPIC", "-I" + str(prefix / "include"), str(probe),
                "-Wl,--whole-archive", str(library), "-Wl,--no-whole-archive", *LINK_FLAGS, "-o", str(elf)]
        subprocess.run(link, env=local, check=True, capture_output=True)
        (output / (abi + "-elf.txt")).write_text(check_elf(tools["readelf"], elf, machine))
        records.append({"abi": abi, "configure": configure, "cflags": local["CFLAGS"], "linkCheck": link,
                        "headersSha256": {str(p.relative_to(prefix / "include")): sha256(p)
                                          for p in sorted((prefix / "include").rglob("*")) if p.is_file()},
                        "archiveSha256": sha256(library), "linkCheckSha256": sha256(elf), "elfLoadMinimumAlignment": 16384})
    if verify(source, manifest) != verified:
        raise ValueError("Source verification changed during build")
    report = {"schemaVersion": 1, "source": verified, "manifestSha256": sha256(manifest),
              "buildScriptSha256": sha256(Path(__file__).resolve()), "ndk": NDK_VERSION, "api": API,
              "host": platform.platform(), "compiler": subprocess.check_output([str(compilers["arm64-v8a"]), "--version"], text=True),
              "builds": records, "runtimeTested": False}
    (output / "build-result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"result": str(output / "build-result.json"), "abis": list(ABIS)}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print("Android crypto build failed: " + str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
