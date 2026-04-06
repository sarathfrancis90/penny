#!/bin/bash
set -e

echo "=== Xcode Cloud: Pre-Xcodebuild Script ==="

# Ensure Flutter build artifacts are in place
FLUTTER_HOME="$HOME/flutter"
export PATH="$PATH:$FLUTTER_HOME/bin"

cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Verify the Flutter build exists
if [ ! -d "build/ios/iphoneos/Runner.app" ]; then
  echo "Flutter build not found, rebuilding..."
  flutter build ios --release --no-codesign
fi

echo "=== Pre-Xcodebuild Complete ==="
