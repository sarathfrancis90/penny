# Local end-to-end run

Runs the real API and the real mobile app against local emulators. Nothing
touches production data; the only real service used is Gemini.

```bash
scripts/local-e2e/start-emulators.sh        # terminal 1 (needs Java 21+)
scripts/local-e2e/start-api.sh              # terminal 2, API on :8787

# sample receipt photos + expected values
python3 scripts/local-e2e/make-receipts.py /tmp/penny-receipts

# API: roles, permissions, invitations, dates, retries, AI, uploads, deletion
node scripts/local-e2e/api-e2e.mjs /tmp/penny-receipts

# App on a simulator, driven through its real screens
cd mobile && flutter test integration_test/local/real_backend_e2e_test.dart -d <device> \
  --dart-define=API_BASE_URL=http://127.0.0.1:8787 \
  --dart-define=AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  --dart-define=E2E_RECEIPT_PATH=/tmp/penny-receipts/grocery.jpg
```

`upload-stress.mjs <count>` sends that many 5 MB uploads at once (set `API`).
The emulators do not enforce Firestore indexes; `database/firestore.indexes.json`
is checked against production separately.
