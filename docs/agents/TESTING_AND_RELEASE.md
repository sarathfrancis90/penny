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
npm run typecheck
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

- `backend-tests.yml` - runs TypeScript typecheck, ESLint, and Next build on Node 20.
- `mobile-tests.yml` - runs Flutter analyze and tests.
- `firebase-deploy.yml` - deploys Firestore rules, indexes, and storage rules on relevant main-branch changes.
- `mobile-release.yml` - tag-driven iOS and Android release builds through Fastlane.
- `store-metrics-fallback.yml` - scheduled or manual fallback for store metrics collection.

Agents should inspect workflow files before relying on prose docs.

## Firebase Deploy

Firebase config files:

- `firebase.json`
- `.firebaserc`
- `database/firestore.rules`
- `database/firestore.indexes.json`
- `database/storage.rules`

`firebase-deploy.yml` deploys database rules/indexes/storage. It currently references a database test script name that is not present in `package.json`, but the workflow treats that step as non-blocking. See `KNOWN_GAPS.md`.

## Mobile Release

Release references:

- `.github/workflows/mobile-release.yml`
- `mobile/CICD.md`
- `mobile/PRODUCTION_READINESS.md`
- `mobile/fastlane/Fastfile`
- `mobile/fastlane/Appfile`
- `mobile/release_notes/`

Release is tag-driven with tags like `v*.*.*`. Build number is derived in the workflow. Fastlane handles iOS TestFlight/App Store and Android Play/App Bundle style lanes depending lane and secrets.

Before release work:

- Check required secrets in `mobile/CICD.md` against workflow usage.
- Confirm `pubspec.yaml` version and release notes.
- Confirm signing and Firebase config are present in the CI environment.
- Do not run local release lanes unless credentials are configured and the task requires it.

## Documentation Validation

For docs-only changes, useful checks are:

```bash
rg -n "docs/agents" README.md docs/README.md AGENTS.md
find docs/agents -type f -maxdepth 1 -print | sort
```

If regenerating `FILE_MAP.md`, compare the counts in the file with:

```bash
git ls-files | wc -l
git ls-files --others --exclude-standard | wc -l
```

## Known Validation Drift

- `.cursor/rules/build-and-lint.mdc` says lint must run with zero warnings, but `npm run lint` is plain `eslint` and the ESLint config demotes several rules to warnings.
- `firebase-deploy.yml` references `npm run test:db`, but root `package.json` does not define `test:db`.
- Older docs reference older Next/React/Gemini versions. Prefer package files and source code.
- `mobile/README.md` is still Flutter boilerplate and is not a useful architecture source.

## Validation Handoff

Final agent responses should explicitly state:

- Commands run.
- Whether they passed.
- Commands skipped and why.
- Any environment limitation, such as missing Flutter SDK, unavailable Firebase emulator, or release credentials not configured.
