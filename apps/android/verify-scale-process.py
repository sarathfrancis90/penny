#!/usr/bin/env python3
"""Measure a 10k-record vault in a new process on an isolated installed sandbox."""
import json
import os
import re
import stat
from pathlib import Path
import subprocess
import uuid

def adb_command(sdk_value, serial):
    """Accept only an installed SDK executable and one local emulator selector."""
    if re.fullmatch(r"emulator-[0-9]{4,5}", serial) is None:
        raise ValueError("ANDROID_SERIAL must select one local emulator")
    sdk = Path(sdk_value)
    if not sdk.is_absolute():
        raise ValueError("ANDROID_HOME must be absolute")
    sdk = sdk.resolve(strict=True)
    executable = (sdk / "platform-tools/adb").resolve(strict=True)
    if executable.parent != sdk / "platform-tools" or not executable.is_file():
        raise ValueError("adb must be a regular file within the selected SDK platform-tools")
    for path in (sdk, executable.parent, executable):
        info = path.stat()
        if info.st_uid not in (0, os.getuid()) or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
            raise ValueError("SDK executable and directories must be owned and not writable by other users")
    if not os.access(executable, os.X_OK):
        raise ValueError("SDK adb is not executable")
    properties = (executable.parent / "source.properties").read_text()
    if re.search(r"^Pkg.Revision=[0-9]+(?:\.[0-9]+){1,2}$", properties, re.M) is None:
        raise ValueError("Missing installed platform-tools package metadata")
    return [str(executable), "-s", serial]


def run_adb(adb, args, *, check=True, timeout=30):
    # Revalidate the executable/selector at the process boundary. No shell is
    # invoked on the host; remote arguments below are literals or a UUID.
    command = adb_command(str(Path(adb[0]).parent.parent), adb[2])
    return subprocess.run(command + args, shell=False, check=check,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, timeout=timeout)


def main():
    os.chdir(Path(__file__).resolve().parent)
    adb = adb_command(
        os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk")),
        os.environ.get("ANDROID_SERIAL", "emulator-5560"),
    )
    assert run_adb(adb, ["shell", "getprop", "ro.kernel.qemu"]).stdout.strip() == "1"
    package = "ca.penny.offline.dev.test"
    marker = str(uuid.uuid4())
    root = Path("evidence")
    root.mkdir(exist_ok=True)
    for phase in ("seed", "open"):
        if phase == "open":
            # Instrumentation may end its own process. Launch the sandbox activity so
            # the force-stop below demonstrably terminates a live app process.
            run_adb(adb, ["shell", "am", "start", "-W", "-n", package + "/ca.penny.offline.MainActivity"])
            before = run_adb(adb, ["shell", "pidof", package]).stdout.strip()
            run_adb(adb, ["shell", "am", "force-stop", package], timeout=10)
            assert run_adb(adb, ["shell", "pidof", package], check=False).returncode != 0
        args = ["shell", "am", "instrument", "-w", "-e", "class", "ca.penny.offline.PerformanceDeviceTest#tenThousandRecordsAcrossProcessRestart",
                      "-e", "pennyPerformancePhase", phase, "-e", "pennyPerformanceMarker", marker, package + ".test/androidx.test.runner.AndroidJUnitRunner"]
        result = run_adb(adb, args, timeout=60)
        (root / f"p6-process-scale-{phase}.log").write_text(result.stdout)
        assert "OK (1 test)" in result.stdout.splitlines(), result.stdout
    data = json.loads(run_adb(adb, ["exec-out", "run-as", package, "cat", "files/p6-process-open.json"]).stdout)
    assert str(data["pid"]) != before
    data.update(priorPid=int(before), externalForceStopVerified=True)
    (root / "p6-process-open.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps(data))


if __name__ == "__main__":
    main()
