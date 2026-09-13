#!/usr/bin/env python3
"""Measure a 10k-record vault in a new process on an isolated installed sandbox."""
import json
import os
from pathlib import Path
import subprocess
import uuid

os.chdir(Path(__file__).resolve().parent)
sdk = Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk")))
adb = [str(sdk / "platform-tools/adb"), "-s", os.environ.get("ANDROID_SERIAL", "emulator-5560")]
assert subprocess.check_output(adb + ["shell", "getprop", "ro.kernel.qemu"], text=True).strip() == "1"
package = "ca.penny.offline.dev.test"
marker = str(uuid.uuid4())
root = Path("evidence")
root.mkdir(exist_ok=True)
for phase in ("seed", "open"):
    if phase == "open":
        # Instrumentation may end its own process. Launch the sandbox activity so
        # the force-stop below demonstrably terminates a live app process.
        subprocess.run(adb + ["shell", "am", "start", "-W", "-n", package + "/ca.penny.offline.MainActivity"], check=True, stdout=subprocess.PIPE, timeout=30)
        before = subprocess.check_output(adb + ["shell", "pidof", package], text=True).strip()
        subprocess.run(adb + ["shell", "am", "force-stop", package], check=True, timeout=10)
        assert subprocess.run(adb + ["shell", "pidof", package], stdout=subprocess.PIPE).returncode != 0
    args = adb + ["shell", "am", "instrument", "-w", "-e", "class", "ca.penny.offline.PerformanceDeviceTest#tenThousandRecordsAcrossProcessRestart",
                  "-e", "pennyPerformancePhase", phase, "-e", "pennyPerformanceMarker", marker, package + ".test/androidx.test.runner.AndroidJUnitRunner"]
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60)
    (root / f"p6-process-scale-{phase}.log").write_text(result.stdout)
    assert "OK (1 test)" in result.stdout, result.stdout
data = json.loads(subprocess.check_output(adb + ["exec-out", "run-as", package, "cat", "files/p6-process-open.json"]))
assert str(data["pid"]) != before
data.update(priorPid=int(before), externalForceStopVerified=True)
(root / "p6-process-open.json").write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps(data))
