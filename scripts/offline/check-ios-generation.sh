#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PENNY_IOS_DEVICE:?Select the isolated booted iOS test simulator}"
: "${PENNY_SODIUM_OUTPUT:?Supply authenticated Apple libraries}"
: "${PENNY_SODIUM_SOURCE:?Supply authenticated libsodium source}"
mkdir -p apps/ios/.build
PENNY_IOS_EVIDENCE="${PENNY_IOS_EVIDENCE:-$(mktemp -d "$PWD/apps/ios/.build/evidence.XXXXXX")}"
mkdir -p "$PENNY_IOS_EVIDENCE"
PENNY_PROCESS_ARGS=(
  -project apps/ios/PennyOffline.xcodeproj
  -scheme PennyOfflineDurableProcess
  -destination "platform=iOS Simulator,id=$PENNY_IOS_DEVICE"
  -parallel-testing-enabled NO
  -derivedDataPath apps/ios/.build/DurableProcessDerivedData
  "PENNY_SODIUM_OUTPUT=$PENNY_SODIUM_OUTPUT"
  "PENNY_SODIUM_SOURCE=$PENNY_SODIUM_SOURCE"
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES
)
xcodebuild build-for-testing "${PENNY_PROCESS_ARGS[@]}" \
  2>&1 | tee "$PENNY_IOS_EVIDENCE/generation-build.log"
for PENNY_PHASE in Write Read; do
  xcodebuild test-without-building "${PENNY_PROCESS_ARGS[@]}" \
    -only-testing:"PennyOfflineDurableProcessTests/DurableProcessTests/testFreshProcess${PENNY_PHASE}Pending" \
    -resultBundlePath "$PENNY_IOS_EVIDENCE/Generation${PENNY_PHASE}.xcresult" \
    2>&1 | tee "$PENNY_IOS_EVIDENCE/generation-$PENNY_PHASE.log"
  xcrun xcresulttool get test-results summary \
    --path "$PENNY_IOS_EVIDENCE/Generation${PENNY_PHASE}.xcresult" \
    > "$PENNY_IOS_EVIDENCE/generation-$PENNY_PHASE.json"
  python3 - "$PENNY_IOS_EVIDENCE/generation-$PENNY_PHASE.json" <<'PY'
import json, sys
from pathlib import Path
result = json.loads(Path(sys.argv[1]).read_text())
assert result['result'] == 'Passed'
assert result['totalTestCount'] == result['passedTests'] == 1
assert result['failedTests'] == result['skippedTests'] == 0
PY
done
# The reader test requires the writer's persisted PID and asserts that its own
# PID differs before authenticating both pending-valid and pending-invalid data.
printf 'PASS: pending generation recovery verified by separate writer and reader test processes.\n'
