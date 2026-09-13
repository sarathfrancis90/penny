#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
: "${ANDROID_SERIAL:=emulator-5556}"
export ANDROID_HOME ANDROID_SERIAL
mkdir -p evidence
adb="$ANDROID_HOME/platform-tools/adb"
package=ca.penny.offline.dev.test
marker="Process-test-$(date +%s)"
./gradlew -PpennyTestSandbox=true :app:installDebug :app:installDebugAndroidTest > evidence/process-build.log 2>&1
"$adb" shell am instrument -w -e class ca.penny.offline.ProcessPersistenceTest#createBeforeForceStop -e pennyMarker "$marker" "$package.test/androidx.test.runner.AndroidJUnitRunner" > evidence/process-create.log
rg -q 'OK \(1 test\)' evidence/process-create.log
"$adb" shell am start -W -n "$package/ca.penny.offline.MainActivity" > evidence/process-restart.log
before=$("$adb" shell pidof "$package" | tr -d '\r')
test -n "$before"
"$adb" shell am force-stop "$package"
if "$adb" shell pidof "$package" >> evidence/process-restart.log; then
  echo 'FAIL: app process survived force-stop' >> evidence/process-restart.log
  exit 1
fi
"$adb" shell am start -W -n "$package/ca.penny.offline.MainActivity" >> evidence/process-restart.log
after=$("$adb" shell pidof "$package" | tr -d '\r')
test -n "$after"
test "$before" != "$after"
printf 'Process before force-stop: %s\nNew process after restart: %s\n' "$before" "$after" >> evidence/process-restart.log
"$adb" shell am instrument -w -e class ca.penny.offline.ProcessPersistenceTest#verifyAfterForceStopAndDelete -e pennyMarker "$marker" "$package.test/androidx.test.runner.AndroidJUnitRunner" > evidence/process-verify.log
rg -q 'OK \(1 test\)' evidence/process-verify.log
echo 'PASS: UI-created expense survived external force-stop and fresh-process relaunch; UI verified amount and removed only its own record.' >> evidence/process-restart.log
