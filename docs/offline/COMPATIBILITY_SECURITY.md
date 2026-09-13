# Retained compatibility dependency cleanup

The legacy web/API runtime remains available for migration, privacy/account routes and the existing release. Native Penny Offline does not depend on this JavaScript runtime. This maintenance changes dependency resolution and build configuration, not the existing API/Flutter source edits.

## Changes on 2026-09-13

A read-only npm audit initially reported 46 findings: 2 critical, 13 high, 28 moderate and 3 low. Compatible forward dependency updates, targeted patch updates and two tested overrides reduce the final installed/lockfile audit to **zero findings**. Audit results are a time-specific dependency check, not a complete security assessment.

- Next.js 16.2.9 to 16.3.5, with matching `eslint-config-next` and updated minimum version ranges. The app was already on Next.js 16, so the major-version codemods were not applicable. The retained Serwist build uses Webpack explicitly; `npm run build` now records that choice.
- Firebase Admin 14.0.0 to 14.4.0 removes the affected uuid dependency chain while preserving the current major version.
- Vitest and its UI package advance together to 4.1.11, within version 4.
- Browserslist is overridden to 4.28.9 because the retained Serwist dependency otherwise selects an affected version. esbuild is overridden to 0.28.2 because tsup still requires the affected 0.27 line. The latter crosses esbuild's pre-1.0 minor range, so API/worker builds and the full repository tests were repeated against the override. Do not remove either override without checking the resolved tree and audit.
- The expired `osv-scanner.toml` exception ledger is removed. The security workflow now scans the lockfile without an exception configuration. No vulnerability was renewed, ignored or suppressed.

References used for the upgrade: [Next.js 16 upgrade guidance](https://nextjs.org/docs/app/guides/upgrading/version-16), [uuid upstream advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), and [esbuild 0.28.2 release notes](https://github.com/evanw/esbuild/releases/tag/v0.28.2). Exact dependency versions and integrity hashes are in `package-lock.json`.

## Verification

The original working-tree checks passed locally on Node 22.15.0. That checkout includes the user's pre-existing API/Flutter work:

- `npm audit --json`: zero findings at all severities.
- `npm run api:check`: typecheck, 152 tests and CommonJS API build.
- `npm run typecheck`: retained web TypeScript check.
- `npm test`: 228 tests across 31 files.
- `npm run build -- --webpack`: successful Next.js production build including the retained service worker and privacy/support routes. The `--webpack` selection is now in the normal build script. Sentry build-upload credentials were explicitly empty and Next telemetry disabled for this local check.
- `npm run ci:policy`: 20 workflow files passed after removing the obsolete exception configuration.
- The durable hash comparison confirmed all 18 pre-existing modified/untracked legacy source files unchanged.

Local logs and audit JSON are in ignored `artifacts/offline/`, with `*-security-final.log`, `compatibility-tests-final.log`, `web-security-build-final.log`, `ci-policy-security.log` and `audit-final.json`. Package lifecycle scripts were not run during the update (`--ignore-scripts`); the native platform binaries actually used by the build/test commands executed successfully. Hosted CI, its clean `npm ci`, OSV/Trivy and production deployment have not been run by this check.

The retained Sentry setup emits existing initialization/deprecation warnings. This cleanup does not claim a repaired telemetry integration or browser end-to-end coverage. Generated local service-worker output is not a source change for the native release.

## Clean review branch verification

The separate `codex/penny-offline-native` review worktree starts from `bcdd69d` and deliberately excludes those pre-existing API/Flutter changes. A clean `npm ci` completed, followed by:

- `npm run api:check`: typecheck, **150 tests** and CommonJS build.
- `npm test`: **226 tests across 31 files**.
- `npm run docs:auto`: freshness, lint, OpenAPI and **104 tests** against that branch's retained API source.
- `npm run typecheck`: passed.
- `npm audit --json`: zero findings at all severities.
- `npm run build`: successful production compile and static generation with synthetic Firebase public configuration and the repository's explicit `FIREBASE_ADMIN_ALLOW_BUILD_FALLBACK=true` build mode. No real account credentials were copied; Sentry upload settings were empty. This verifies build compatibility, not authenticated runtime behavior or live service availability.

The differing test counts reflect the intentionally different legacy source baseline. Logs are `artifacts/offline/review-{api-check,all-tests,docs-auto-initial,web-typecheck,web-build}.log` and `review-audit.json` in the original checkout. The generated service worker and map were removed from the review diff after the build; retained source is unchanged. Hosted CI, OSV/Trivy and deployment remain separate checks.
