# Testing and Release

## Package Scripts

Root `package.json` defines the web checks:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:watch
npm run test:ui
npm run test:db
npm run typecheck
npm run ci:policy
npm run lint:ci
npm run api:check
npm run api:contract
npm run docs:auto
npm run docs:agents:check
npm run docs:agents:lint
npm run docs:agents:test
npm run generate-secret
```

Use `package.json` as the source of truth. Some older docs and workflows reference commands that may not exist.

## Web Validation

Recommended by change type:

- Type-only or server logic: `npm run typecheck` and targeted `npm run test`.
- UI/component work: `npm run lint`, targeted tests, and manual browser check if feasible.
- API route work: `npm run typecheck`, targeted tests, and route-level manual request if needed.
- Broad changes: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

Current test framework is Vitest with jsdom from `vitest.config.ts`.

## Standalone API Validation

Common commands:

```bash
npm run api:typecheck
npm run api:test
npm run api:build
npm run api:check
npm run api:contract
```

Use `npm run api:smoke` after deployment when `API_BASE_URL` is set. Use `npm run api:parity` for old/new API comparison with disposable staging data.

## Mobile Validation

Common commands:

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
```

The local pre-push hook runs:

```bash
cd mobile && flutter test test/ --reporter compact
```

Mobile tests live under `mobile/test/`.

## CI Workflows

GitHub Actions workflows under `.github/workflows/` include:

- `ci-policy-guard.yml` - enforces fail-closed workflow policy.
- `docs-contract-ci.yml` and `agent-docs.yml` - check OpenAPI/generated docs freshness and docs lint without write-back.
- `api-ci.yml` - runs API checks, contract checks, mobile API-only boundary checks, and API container build.
- `api-staging-deploy.yml` - autonomous Cloud Run staging deploy from `main`: image scan, SBOM, provenance attestation, signature, no-traffic candidate, smoke, promote, rollback.
- `backend-tests.yml` - runs TypeScript typecheck, web ESLint compatibility, unit tests, and Next build.
- `api-ci.yml` also runs zero-warning ESLint for active API/packages/scripts code.
- `firebase-rules-ci.yml` - runs Firestore and Storage emulator rule tests.
- `firebase-deploy.yml` - deploys Firestore rules, indexes, and storage rules only after emulator tests pass.
- `security-ci.yml` and `codeql.yml` - dependency, supply-chain, filesystem, and static-analysis checks.
- `mobile-shared-ci.yml`, `mobile-android-ci.yml`, and `mobile-ios-ci.yml` - separate required mobile gates.
- `mobile-tests.yml` - legacy required-check alias for existing branch protection while settings are migrated.
- `mobile-release.yml` - tag/manual internal iOS and Android releases through Fastlane with evidence artifacts.
- `mobile-production-promotion.yml` - manual production promotion after evidence verification.
- `store-metrics-fallback.yml` - scheduled or manual fallback for store metrics collection.

Agents should inspect workflow files before relying on prose docs.

## Firebase Deploy

Firebase config files:

- `firebase.json`
- `.firebaserc`
- `database/firestore.rules`
- `database/firestore.indexes.json`
- `database/storage.rules`

`firebase-deploy.yml` deploys database rules/indexes/storage through Google OIDC/ADC, not a long-lived Firebase token. It runs `npm run test:db` before deployment and fails closed if emulator tests fail.

## Mobile Release

Release references:

- `.github/workflows/mobile-release.yml`
- `mobile/CICD.md`
- `mobile/PRODUCTION_READINESS.md`
- `mobile/fastlane/Fastfile`
- `mobile/fastlane/Appfile`
- `mobile/release_notes/`

Release is tag-driven with tags like `v*.*.*`. Build number is derived in the workflow. Fastlane handles iOS TestFlight/App Store and Android Play/App Bundle style lanes depending lane and secrets. Internal release uploads write `mobile-release-evidence-ios` and `mobile-release-evidence-android` artifacts; production promotion requires the internal release run ID and validates those artifacts before touching either store.

Before release work:

- Check required secrets in `mobile/CICD.md` against workflow usage.
- Confirm `pubspec.yaml` version and release notes.
- Confirm signing and Firebase config are present in the CI environment.
- Confirm Android release signing remains fail-closed and iOS/Android evidence artifacts are retained.
- Do not run local release lanes unless credentials are configured and the task requires it.

## Documentation Validation

For docs-only changes, useful checks are:

```bash
npm run docs:auto
```

Generated mobile/API agent references live under `docs/agents/generated/` and are auto-refreshed locally by `npm run docs:auto` after changes to `mobile/**`, `apps/api/**`, `packages/shared/**`, `scripts/api/**`, `scripts/agents/**`, `src/app/api/**`, `src/lib/types*`, `src/lib/categories.ts`, `database/**`, workflows, or agent docs. Required CI is check-only and fails on stale generated artifacts; it does not push generated docs back to PR branches.

If investigating `FILE_MAP.md`, compare the counts in the file with:

```bash
git ls-files | wc -l
git ls-files --others --exclude-standard | wc -l
```

## Known Validation Drift

- Moderate upstream npm advisories remain in Next/Firebase transitive dependencies. High/critical production dependency advisories are blocked by CI.
- Older docs reference older Next/React/Gemini versions. Prefer package files and source code.
- `mobile/README.md` is still Flutter boilerplate and is not a useful architecture source.

## Validation Handoff

Final agent responses should explicitly state:

- Commands run.
- Whether they passed.
- Commands skipped and why.
- Any environment limitation, such as missing Flutter SDK, unavailable Firebase emulator, or release credentials not configured.
