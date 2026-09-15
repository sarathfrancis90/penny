#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../apps/android"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
: "${ANDROID_SERIAL:?Select the isolated Android test runtime}"
PENNY_ADB="$ANDROID_HOME/platform-tools/adb"
PENNY_PACKAGE=ca.penny.offline.dev.test
mkdir -p evidence
"$PENNY_ADB" shell run-as "$PENNY_PACKAGE" rm -f files/generation-process-seed.json files/generation-process-reopen.json
for PENNY_PHASE in seedPending reopenPending; do
  "$PENNY_ADB" shell am instrument -w -r \
    -e pennyGenerationProcess true \
    -e class "ca.penny.offline.VaultGenerationProcessTest#$PENNY_PHASE" \
    "$PENNY_PACKAGE.test/androidx.test.runner.AndroidJUnitRunner" \
    > "evidence/generation-$PENNY_PHASE.log"
  tr -d '\r' < "evidence/generation-$PENNY_PHASE.log" | grep -Fqx 'OK (1 test)'
  "$PENNY_ADB" shell am force-stop "$PENNY_PACKAGE"
  if "$PENNY_ADB" shell pidof "$PENNY_PACKAGE" > /dev/null; then
    echo 'The isolated app process survived force-stop' >&2
    exit 1
  fi
done
"$PENNY_ADB" shell run-as "$PENNY_PACKAGE" cat files/generation-process-reopen.json > evidence/generation-process.json
python3 - <<'PY'
import json
from pathlib import Path
proof = json.loads(Path('evidence/generation-process.json').read_text())
assert type(proof['seedPid']) is int and type(proof['pid']) is int
assert proof['seedPid'] > 0 and proof['pid'] > 0 and proof['seedPid'] != proof['pid']
assert proof['phase'] == 'authenticated-new-generation'
print('PASS: pending generation authenticated after force-stop in a different app process.')
PY
