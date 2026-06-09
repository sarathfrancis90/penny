# Penny Agent Guide

This repository uses agentic engineering. Start here before changing code.

## Required Reading Order

1. `CLAUDE.md` - compact operating context and current stack summary.
2. `docs/agents/README.md` - complete agent documentation index.
3. `docs/agents/REPOSITORY_GUIDE.md` - product, architecture, and high-risk contracts.
4. `docs/agents/FILE_MAP.md` - complete tracked and nonignored working-tree file inventory. Use this when a task says not to skip files.
5. Platform-specific guides as needed:
   - `docs/agents/WEB_APP_GUIDE.md`
   - `docs/agents/MOBILE_APP_GUIDE.md`
   - `docs/agents/MOBILE_ACTIVE_DEVELOPMENT_GUIDE.md`
   - `docs/agents/STANDALONE_API_GUIDE.md`
   - `docs/agents/MOBILE_API_CONTRACTS.md`
   - `docs/agents/FIREBASE_AND_DATA_CONTRACTS.md`
   - `docs/agents/AGENT_WORKFLOWS.md`
   - `docs/agents/TESTING_AND_RELEASE.md`
   - `docs/agents/KNOWN_GAPS.md`
6. Generated source-of-truth references as needed:
   - `docs/agents/generated/MOBILE_FILE_MAP.md`
   - `docs/agents/generated/API_ROUTE_SURFACE.md`
   - `docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md`
   - `docs/agents/generated/VALIDATION_COMMANDS.md`

## Non-Negotiable Agent Rules

- Treat TypeScript web types in `src/lib/types.ts`, standalone API/shared serializers, and Flutter models under `mobile/lib/**/models/` as a cross-platform contract. Update every affected side when data shape changes.
- Keep Canadian tax category strings synchronized across `src/lib/categories.ts`, `packages/shared/src/categories.ts`, and `mobile/lib/core/constants/categories.dart`.
- Respect Firebase security rules before introducing new reads or writes. Rules live in `database/firestore.rules` and `database/storage.rules`.
- Preserve the hybrid mobile backend pattern: mobile reads many Firestore streams directly but uses the standalone Fastify API in `apps/api` for AI, server-authoritative writes, and complex transactions. Treat `src/app/api` as web/legacy compatibility unless the current mobile source explicitly points to it.
- Never commit secrets. Firebase generated config files exist in the repo; do not reproduce their values in docs or logs.
- Do not revert unrelated working tree changes. Check `git status --short` before and after edits.
- Validate with the smallest command set that proves the change. For cross-platform changes, run both web and mobile checks when feasible.
- When changing `mobile/**`, `apps/api/**`, API route contracts, Firebase rules, or agent docs, run `npm run docs:auto`. This regenerates OpenAPI plus generated agent docs, stages generated artifacts, and verifies freshness/lint/tests.
- When changing standalone API routes or route contracts, also run `npm run api:contract`; for API behavior, run `npm run api:check`.

## Fast Orientation

Penny is an AI-powered expense tracking product for Canadian self-incorporated software professionals. The repo contains a Next.js web app, a Flutter iOS/Android mobile app, a standalone Fastify API for active mobile backend work, Firebase security/index configuration, observability integrations, and release automation.

The authoritative expanded documentation for agents is under `docs/agents/`.
