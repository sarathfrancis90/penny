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


## Hosted security findings and remediation

PR44 hosted npm/OSV checks passed, while Trivy identified four advisories in the retained Ruby lockfile: concurrent-ruby CVE-2026-54906/CVE-2026-54904, Faraday CVE-2026-54297 and Rubyzip CVE-2026-85396. The lock now resolves concurrent-ruby 1.3.8, Faraday 2.14.3 and Rubyzip 3.6.0. The latest published Fastlane 2.239.0 still requires Rubyzip below 3, so Gemfile pins official upstream commit [3a4fc367](https://github.com/fastlane/fastlane/commit/3a4fc36716dec206b3f5441f19f0a5193733c828), which supports Rubyzip 3. This is an explicitly unreleased upstream dependency and must return to a published release once one includes that fix. No incompatible transitive override or advisory suppression is used.

Frozen bundle installation, lane discovery without execution, Gym/Supply/CocoaPods loading, synthetic IPA creation/read, a local Faraday adapter and atomic update passed on local Ruby 4.0.2. Dependency Ruby requirements accept CI Ruby 3.4.4; that actual runtime and Trivy rescanning remain hosted gates. Only Gemfile and Gemfile.lock change in the retained mobile tree; all 18 pre-existing source hashes remain unchanged.

SAST remediation adds explicit seven-day Dependabot version-update cooldowns, a hash-pinned defusedxml build dependency that rejects DTD/entity XML input, and a centralized Android process runner. The runner requires an absolute installed SDK, a regular executable inside platform-tools, owner/root ownership with no group/world write access, package revision metadata and a single `emulator-NNNN` selector. It invokes an argument list with `shell=False`; remote arguments are fixed test commands or generated UUIDs. Two boundary test groups reject injected selectors, relative SDK paths, unsafe permissions, missing metadata and escaping symlinks. A fresh 10k Android process restart passed after this change (PID 5316 to 5379, 1.209-second open; single emulator sample).

The Android MAIN/LAUNCHER activity must remain exported so launchers can open it. MainActivity ignores incoming intent fields and has no privileged intent entrypoint. Its exact exported-activity rule has a local reviewed annotation; no rule or file is excluded globally. Re-review that annotation if intent handling is added. See [Android activity documentation](https://developer.android.com/guide/topics/manifest/activity-element#exported) and [Semgrep annotation guidance](https://docs.semgrep.dev/ignoring-files-folders-code).

Focused Semgrep 1.165.0 with the CI rulesets passed with zero findings and no parse errors. The shared gate passed 67 Node tests and 22 Python groups, including the AVD profile regression. Full clean-review Semgrep scanning exited successfully with zero findings over 1,072 files, but reported 12 partial-parsing warnings in GitHub expression snippets, shell scripts and retained JSX. This limits scanner coverage; no exclusions were added to hide these warnings. Full-branch hosted SAST/security results remain pending; local scanner success is not a signed native release or complete security assessment.
