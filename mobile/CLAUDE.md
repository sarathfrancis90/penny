# Penny Mobile Agent Context

This file is intentionally short. The authoritative mobile agent documentation lives in the root agent docs:

1. `../AGENTS.md`
2. `../CLAUDE.md`
3. `../docs/agents/MOBILE_ACTIVE_DEVELOPMENT_GUIDE.md`
4. `../docs/agents/MOBILE_APP_GUIDE.md`
5. `../docs/agents/MOBILE_API_CONTRACTS.md`
6. `../docs/agents/FIREBASE_AND_DATA_CONTRACTS.md`
7. `../docs/agents/generated/MOBILE_FILE_MAP.md`
8. `../docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md`

## Current Mobile Facts

- Flutter app supports iOS and Android.
- Active source layout is `lib/core`, `lib/data`, `lib/domain`, and `lib/presentation`.
- HTTP calls use Dio through `lib/core/network/api_client.dart`.
- Active mobile backend work targets the standalone Fastify API under `../apps/api`; `src/app/api` is web/legacy unless mobile configuration explicitly points there.
- Mobile sends Firebase ID tokens as `Authorization: Bearer <token>`; API routes must use the verified UID as authority.
- Category strings must match `../src/lib/categories.ts`, `../packages/shared/src/categories.ts`, and `lib/core/constants/categories.dart`.

## Mobile Validation

Use the smallest relevant command set:

```bash
flutter analyze
flutter test
flutter test integration_test
```

For mobile/API contract changes, also run from the repo root:

```bash
npm run api:check
npm run api:contract
npm run docs:agents:generate
npm run docs:agents:check
npm run docs:agents:lint
```

Do not paste values from generated Firebase config files into docs, logs, or final messages.
