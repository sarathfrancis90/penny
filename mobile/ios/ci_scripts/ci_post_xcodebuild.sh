#!/bin/bash
set -e

echo "=== Xcode Cloud: Post-Xcodebuild Script ==="

# Run Flutter unit tests (only on CI_XCODEBUILD_ACTION = build-for-testing or archive)
if [ "$CI_XCODEBUILD_ACTION" = "archive" ]; then
  FLUTTER_HOME="$HOME/flutter"
  export PATH="$PATH:$FLUTTER_HOME/bin"

  cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

  echo "Running Flutter unit tests..."
  flutter test --no-pub

  echo "Tests passed!"
fi

echo "=== Post-Xcodebuild Complete ==="
