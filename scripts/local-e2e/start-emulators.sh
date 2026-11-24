#!/bin/sh
# Auth + Firestore + Storage emulators for the local end-to-end run.
# firebase-tools 15 needs Java 21+; Android Studio's bundled runtime works.
set -eu
cd "$(dirname "$0")"
if [ -z "${JAVA_HOME:-}" ] && [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
# firebase-tools refuses rules files outside the config folder, so use a
# fresh copy of the real rules on every start.
mkdir -p .rules
cp ../../database/firestore.rules ../../database/storage.rules .rules/
exec npx firebase-tools@15.19.1 emulators:start --config firebase.json \
  --project "${E2E_PROJECT_ID:-penny-f4acd}" --only auth,firestore,storage
