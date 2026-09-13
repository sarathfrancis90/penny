#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v xcodebuild >/dev/null
PENNY_IOS_DEVICE="${PENNY_IOS_DEVICE:-$(xcrun simctl list devices available --json | python3 -c '
import json,sys
devices=json.load(sys.stdin)["devices"]
for runtime in sorted(devices, reverse=True):
    if "SimRuntime.iOS-26-" in runtime:
        for device in devices[runtime]:
            if device["name"].startswith("iPhone"):
                print(device["udid"]);sys.exit(0)
sys.exit("An iOS 26 iPhone simulator runtime is required")
')}"
mkdir -p apps/ios/.build
PENNY_IOS_EVIDENCE="$(mktemp -d "$PWD/apps/ios/.build/evidence.XXXXXX")"
printf 'iOS evidence: %s\n' "$PENNY_IOS_EVIDENCE"
PENNY_IOS_STATE="$(xcrun simctl list devices --json | python3 -c 'import json,sys; target=sys.argv[1]; print(next(d["state"] for ds in json.load(sys.stdin)["devices"].values() for d in ds if d["udid"]==target))' "$PENNY_IOS_DEVICE")"
if [[ "$PENNY_IOS_STATE" != "Booted" ]]; then
  xcrun simctl boot "$PENNY_IOS_DEVICE"
fi
xcrun simctl bootstatus "$PENNY_IOS_DEVICE" -b
xcrun simctl addmedia "$PENNY_IOS_DEVICE" packages/offline-contract/fixtures/receipt.png
xcodebuild test \
  -project apps/ios/PennyOffline.xcodeproj \
  -scheme PennyOffline \
  -destination "platform=iOS Simulator,id=$PENNY_IOS_DEVICE" \
  -parallel-testing-enabled NO \
  -derivedDataPath apps/ios/.build/DerivedData \
  -resultBundlePath "$PENNY_IOS_EVIDENCE/Tests.xcresult" \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES \
  2>&1 | tee "$PENNY_IOS_EVIDENCE/xcodebuild.log"
