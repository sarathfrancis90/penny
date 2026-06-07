# Agent Documentation Index

This directory is the working manual for agents operating on Penny. It is designed for agentic engineering: each guide states the contracts that matter, the files that enforce those contracts, and the validation commands agents should run before handing work back.

## Scope

- The tracked repository contains 716 files at the time this documentation was generated.
- `FILE_MAP.md` accounts for every tracked file returned by `git ls-files` plus every nonignored untracked file visible to Git at generation time.
- Generated, ignored, and local-only artifacts are not reproduced line-by-line because they include dependency/build output and may include secrets. They are documented as artifacts and should be regenerated or inspected locally only when the task explicitly requires it.
- Existing dirty or untracked user files must not be modified unless the user asks. At generation time, `tsconfig.json` was modified and `.claude/scheduled_tasks.lock` was untracked.

## Reading Paths

For most changes:

1. Read `AGENTS.md` at the repository root.
2. Read `REPOSITORY_GUIDE.md`.
3. Read the platform guide for the files you will touch.
4. Read `FIREBASE_AND_DATA_CONTRACTS.md` before changing persisted data, auth, groups, budgets, notifications, expenses, conversations, or AI payloads.
5. Read `AGENT_WORKFLOWS.md` for task execution patterns and validation.
6. Use `FILE_MAP.md` to confirm ownership and adjacent files.

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
- `FIREBASE_AND_DATA_CONTRACTS.md` - collections, rules, indexes, storage, category strings, cross-platform model contracts.
- `AGENT_WORKFLOWS.md` - practical agent execution playbooks and review checklists.
- `TESTING_AND_RELEASE.md` - local commands, CI, deploy, mobile release, and known validation drift.
- `KNOWN_GAPS.md` - documented risks, stale docs, naming drift, and likely defects discovered during analysis.
- `FILE_MAP.md` - complete generated inventory of tracked and nonignored working-tree files.

## Maintenance Rules

- Update this documentation in the same pull request as architecture or contract changes.
- Regenerate `FILE_MAP.md` after adding, removing, or moving tracked or source-relevant untracked files.
- Keep statements evidence-based. If a guide describes behavior, cite or name the concrete file that implements it.
- Keep sensitive values out of documentation even when they appear in generated Firebase files.
