#!/bin/bash
set -e

echo "=== Xcode Cloud: Post-Clone Script ==="
echo "Installing Flutter SDK and project dependencies..."

# Install Flutter SDK
FLUTTER_HOME="$HOME/flutter"
if [ ! -d "$FLUTTER_HOME" ]; then
  echo "Cloning Flutter stable..."
  git clone https://github.com/flutter/flutter.git --depth 1 -b stable "$FLUTTER_HOME"
fi
export PATH="$PATH:$FLUTTER_HOME/bin"

echo "Flutter version:"
flutter --version

# Navigate to the Flutter project root (one level up from ios/)
cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# Install Flutter dependencies
echo "Running flutter pub get..."
flutter pub get

# Generate code (Riverpod, JSON serializable) if needed
echo "Running build_runner..."
dart run build_runner build --delete-conflicting-outputs 2>/dev/null || echo "No code generation needed"

# Build Flutter iOS (no codesign — Xcode Cloud handles signing)
echo "Building Flutter iOS release..."
flutter build ios --release --no-codesign

# Install CocoaPods
echo "Running pod install..."
cd ios
pod install
cd ..

echo "=== Post-Clone Complete ==="
