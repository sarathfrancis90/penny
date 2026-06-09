# Agent Documentation Index

This directory is the working manual for agents operating on Penny. It is designed for agentic engineering: each guide states the contracts that matter, the files that enforce those contracts, and the validation commands agents should run before handing work back.

## Scope

- The tracked repository contains 716 files at the time the original broad file map was generated; use generated docs under `docs/agents/generated/` for current mobile/API inventories.
- `FILE_MAP.md` accounts for every tracked file returned by `git ls-files` plus every nonignored untracked file visible to Git at generation time.
- Generated, ignored, and local-only artifacts are not reproduced line-by-line because they include dependency/build output and may include secrets. They are documented as artifacts and should be regenerated or inspected locally only when the task explicitly requires it.
- Existing dirty or untracked user files must not be modified unless the user asks. At generation time, `tsconfig.json` was modified and `.claude/scheduled_tasks.lock` was untracked.

## Active Development Focus

Active development is currently centered on:

- Flutter mobile app for iOS and Android under `mobile/`.
- Standalone Fastify API under `apps/api/`.
- Shared contracts under `packages/shared/`, `src/lib/types*`, `src/lib/categories.ts`, and `database/`.

Treat `src/app/api/**` as the Next.js web/API and legacy compatibility surface unless current mobile source or deployment configuration explicitly routes mobile traffic there.

## Reading Paths

For most changes:

1. Read `AGENTS.md` at the repository root.
2. Read `REPOSITORY_GUIDE.md`.
3. For mobile work, read `MOBILE_ACTIVE_DEVELOPMENT_GUIDE.md`, `MOBILE_APP_GUIDE.md`, and the generated mobile file map.
4. For standalone API work, read `STANDALONE_API_GUIDE.md`, `MOBILE_API_CONTRACTS.md`, and the generated API route surface.
5. Read `FIREBASE_AND_DATA_CONTRACTS.md` before changing persisted data, auth, groups, budgets, notifications, expenses, conversations, or AI payloads.
6. Read `AGENT_WORKFLOWS.md` for task execution patterns and validation.
7. Use `FILE_MAP.md` or generated file maps to confirm ownership and adjacent files.

For bug fixing:

1. Start with `KNOWN_GAPS.md` to avoid rediscovering already-known drift.
2. Trace the affected data flow in `REPOSITORY_GUIDE.md`.
3. Use `FILE_MAP.md` to find implementation, tests, and docs touching the same area.

For releases:

1. Read `TESTING_AND_RELEASE.md`.
2. For mobile, also read `mobile/CICD.md` and `mobile/PRODUCTION_READINESS.md`.
3. Confirm current CI workflows under `.github/workflows/`.

## Documentation Files

- `REPOSITORY_GUIDE.md` - product context, architecture, domains, and critical flows.
- `WEB_APP_GUIDE.md` - Next.js app, API routes, auth, UI, observability, and testing notes.
- `MOBILE_APP_GUIDE.md` - Flutter architecture, routing, repositories, providers, Firebase/API split, and release notes.
- `MOBILE_ACTIVE_DEVELOPMENT_GUIDE.md` - current mobile source layout, active workflows, repository/provider/model rules, and mobile validation.
- `STANDALONE_API_GUIDE.md` - current Fastify API architecture, auth, route/service layout, Cloud Run deployment, and API validation.
- `MOBILE_API_CONTRACTS.md` - mobile-to-API contract boundary, endpoint ownership, auth rules, and drift prevention.
- `FIREBASE_AND_DATA_CONTRACTS.md` - collections, rules, indexes, storage, category strings, cross-platform model contracts.
- `AGENT_WORKFLOWS.md` - practical agent execution playbooks and review checklists.
- `TESTING_AND_RELEASE.md` - local commands, CI, deploy, mobile release, and known validation drift.
- `KNOWN_GAPS.md` - documented risks, stale docs, naming drift, and likely defects discovered during analysis.
- `FILE_MAP.md` - complete generated inventory of tracked and staged source-visible files.
- `generated/MOBILE_FILE_MAP.md` - generated mobile inventory from current source.
- `generated/API_ROUTE_SURFACE.md` - generated standalone API route table from `scripts/api/route-surface.ts`.
- `generated/MOBILE_API_ENDPOINT_MATRIX.md` - generated mapping from mobile endpoint constants to API implementation and mobile callers.
- `generated/VALIDATION_COMMANDS.md` - generated validation command reference.
- `generated/DOCS_FRESHNESS_MANIFEST.json` - generated source/watch manifest for freshness checks.

## Maintenance Rules

- Update this documentation in the same pull request as architecture or contract changes.
- Run `npm run docs:auto` after changes to mobile, standalone API, route contracts, shared TypeScript/Dart model contracts, Firebase contracts, workflows, or agent docs. It regenerates OpenAPI plus generated agent docs, stages generated artifacts, and verifies freshness/lint/tests.
- `FILE_MAP.md` is generated from tracked files plus staged new files. Stage new source files before running `npm run docs:auto`.
- Keep statements evidence-based. If a guide describes behavior, cite or name the concrete file that implements it.
- Keep sensitive values out of documentation even when they appear in generated Firebase files.
