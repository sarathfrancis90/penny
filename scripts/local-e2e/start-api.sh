#!/bin/sh
# Runs the standalone API on :8787 wired ONLY to the local emulators.
# It is given a freshly generated key that is valid nowhere, and none of the
# machine's real Google credentials, so it cannot reach production data.
# The one real service it calls is Gemini (GEMINI_API_KEY from .env.local).
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PROJECT="${E2E_PROJECT_ID:-penny-f4acd}"
node -e "
const { generateKeyPairSync } = require('crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
require('fs').writeFileSync(process.argv[1], JSON.stringify({ type: 'service_account', project_id: process.argv[2],
  private_key_id: 'local-e2e', private_key: privateKey, client_email: 'local-e2e@' + process.argv[2] + '.iam.gserviceaccount.com',
  client_id: '0', token_uri: 'http://127.0.0.1:1/never' }));
" "$TMP/key.json" "$PROJECT"
GEMINI="$(grep -E '^GEMINI_API_KEY=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"')"
cd "$ROOT"
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT="${PORT:-8787}" \
  FIREBASE_PROJECT_ID="$PROJECT" FIRESTORE_PROJECT_ID="$PROJECT" FIREBASE_AUTH_PROJECT_ID="$PROJECT" \
  FIREBASE_STORAGE_BUCKET="$PROJECT.firebasestorage.app" \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9299 STORAGE_EMULATOR_HOST=http://127.0.0.1:9299 \
  FIREBASE_ADMIN_CREDENTIALS="$(cat "$TMP/key.json")" \
  GEMINI_API_KEY="$GEMINI" ${GEMINI_MODEL:+GEMINI_MODEL="$GEMINI_MODEL"} CRON_SECRET=local-e2e \
  npx tsx apps/api/src/server.ts
