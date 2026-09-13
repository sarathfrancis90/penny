#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
: "${ANDROID_SERIAL:=emulator-5560}"
export ANDROID_HOME ANDROID_SERIAL
adb="$ANDROID_HOME/platform-tools/adb"
package=ca.penny.offline.dev.test
mkdir -p evidence/p6-displays
test "$("$adb" shell getprop ro.kernel.qemu | tr -d '\r')" = 1
if "$adb" shell wm size | rg -q Override || "$adb" shell wm density | rg -q Override; then
  echo 'Use an isolated emulator with default display dimensions; existing overrides were preserved.' >&2
  exit 1
fi
original_font=$("$adb" shell settings get system font_scale | tr -d '\r')
original_night=$("$adb" shell settings get secure ui_night_mode | tr -d '\r')
cleanup() {
  "$adb" shell wm size reset >/dev/null
  "$adb" shell wm density reset >/dev/null
  "$adb" shell settings put system font_scale "$original_font" >/dev/null
  case "$original_night" in 2) "$adb" shell cmd uimode night yes >/dev/null;; 1) "$adb" shell cmd uimode night no >/dev/null;; *) "$adb" shell cmd uimode night auto >/dev/null;; esac
}
trap cleanup EXIT INT TERM
run() {
  name="$1"
  "$adb" shell am instrument -w -e class ca.penny.offline.PolishFlowTest -e pennyVisual "$name" "$package.test/androidx.test.runner.AndroidJUnitRunner" > "evidence/p6-displays/$name.log" 2>&1
  rg -q 'OK \(1 test\)' "evidence/p6-displays/$name.log"
  for screen in overview finance vault editor; do
    "$adb" exec-out run-as "$package" cat "files/p6-$name-$screen.png" > "evidence/p6-displays/$name-$screen.png"
  done
  "$adb" exec-out run-as "$package" cat files/p6-launcher.png > evidence/p6-displays/launcher.png
  echo "PASS: $name"
}
"$adb" shell wm size reset >/dev/null
"$adb" shell wm density reset >/dev/null
"$adb" shell settings put system font_scale 1.0
"$adb" shell cmd uimode night no >/dev/null
run standard
"$adb" shell wm size 720x1280 >/dev/null
"$adb" shell wm density 320 >/dev/null
"$adb" shell settings put system font_scale 1.3
run small
"$adb" shell settings put system font_scale 2.0
"$adb" shell cmd uimode night yes >/dev/null
run dark-large-font
"$adb" shell wm size 2560x1600 >/dev/null
"$adb" shell wm density 240 >/dev/null
"$adb" shell settings put system font_scale 1.0
"$adb" shell cmd uimode night no >/dev/null
run tablet-landscape
