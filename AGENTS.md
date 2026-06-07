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
   - `docs/agents/FIREBASE_AND_DATA_CONTRACTS.md`
   - `docs/agents/AGENT_WORKFLOWS.md`
   - `docs/agents/TESTING_AND_RELEASE.md`
   - `docs/agents/KNOWN_GAPS.md`

## Non-Negotiable Agent Rules

- Treat TypeScript web types in `src/lib/types.ts` and Flutter models under `mobile/lib/**/models/` as a cross-platform contract. Update both sides when data shape changes.
- Keep Canadian tax category strings synchronized between `src/lib/categories.ts` and `mobile/lib/core/constants/categories.dart`.
- Respect Firebase security rules before introducing new reads or writes. Rules live in `database/firestore.rules` and `database/storage.rules`.
- Preserve the hybrid mobile backend pattern: mobile reads many Firestore streams directly but uses Next API routes for AI and complex server-side transactions.
- Never commit secrets. Firebase generated config files exist in the repo; do not reproduce their values in docs or logs.
- Do not revert unrelated working tree changes. Check `git status --short` before and after edits.
- Validate with the smallest command set that proves the change. For cross-platform changes, run both web and mobile checks when feasible.

## Fast Orientation

Penny is an AI-powered expense tracking product for Canadian self-incorporated software professionals. The repo contains a Next.js web app/API, a Flutter mobile app, Firebase security/index configuration, observability integrations, and release automation.

The authoritative expanded documentation for agents is under `docs/agents/`.
