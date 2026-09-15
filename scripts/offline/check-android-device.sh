#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../apps/android"
: "${PENNY_SODIUM_OUTPUT:?Prepare authenticated native libraries before running app tests}"
: "${PENNY_V4_TEST_ASSETS:?Prepare the required v4 app test corpus}"
test -f "$PENNY_V4_TEST_ASSETS/v4-frame-negatives/negative-manifest.json"
test -f "$PENNY_V4_TEST_ASSETS/v4-logical-materialized/fixture-manifest.json"
# Keep the same corpus when the process runners rebuild the instrumentation APK.
export ORG_GRADLE_PROJECT_pennyV4TestAssets="$PENNY_V4_TEST_ASSETS"
if [[ -n "${PENNY_EXPECTED_ANDROID_API:-}" ]]; then
  [[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" == "$PENNY_EXPECTED_ANDROID_API" ]] || { echo "Unexpected Android runtime API" >&2; exit 1; }
fi
if [[ -n "${PENNY_EXPECTED_PAGE_SIZE:-}" ]]; then
  if ! PENNY_PAGE_BYTES="$(adb shell getconf PAGE_SIZE 2>/dev/null | tr -d '\r')"; then
    # Android 8's shell lacks getconf. Read the first mapping's actual kernel page size.
    # Consume the whole stream so pipefail cannot turn an early awk exit into SIGPIPE.
    PENNY_PAGE_BYTES="$(adb shell cat /proc/self/smaps | awk '/^KernelPageSize:/ && !seen++ { print $2 * 1024 }')"
  fi
  [[ "$PENNY_PAGE_BYTES" == "$PENNY_EXPECTED_PAGE_SIZE" ]] || { echo "Unexpected Android runtime memory page size" >&2; exit 1; }
fi
./gradlew --no-daemon -PpennyTestSandbox=true "-PpennyV4TestAssets=$PENNY_V4_TEST_ASSETS" connectedDebugAndroidTest
bash verify-process-persistence.sh
bash ../../scripts/offline/check-android-generation.sh
