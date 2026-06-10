# Agent Workflows

## Operating Model

This repo is designed for agentic engineering. Agents should work from evidence, keep contracts synchronized, and validate with commands proportional to the change.

Default workflow:

1. Inspect `git status --short` and avoid unrelated dirty files.
2. Read the relevant agent guide and `FILE_MAP.md` entries for the touched area.
3. Trace the data flow before editing.
4. Make the smallest coherent change across all affected layers.
5. Run targeted validation.
6. Update curated docs and regenerate generated agent docs when behavior, architecture, or contracts changed.
7. Report changed files, validation, and residual risks.

## Context Building

Use this order for deep work:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/agents/REPOSITORY_GUIDE.md`
4. Platform guide for the target area.
5. For active mobile work, `docs/agents/MOBILE_ACTIVE_DEVELOPMENT_GUIDE.md` and generated mobile docs.
6. For standalone API work, `docs/agents/STANDALONE_API_GUIDE.md`, `docs/agents/MOBILE_API_CONTRACTS.md`, and generated API docs.
7. `docs/agents/FIREBASE_AND_DATA_CONTRACTS.md` for persisted data.
8. `docs/agents/FILE_MAP.md` or generated file maps for complete file awareness.
9. Source files, tests, and docs adjacent to the change.

When the user says not to skip files, use `git ls-files` plus `git ls-files --others --exclude-standard` as the source-aware working-tree inventory, and explicitly account for generated/ignored artifacts separately.

## Planning Heuristics

Before editing, identify:

- User-visible behavior being changed.
- Runtime platform: web, mobile, standalone API, Firebase, CI, or docs.
- Data contracts touched.
- Auth and authorization path.
- Existing tests and missing tests.
- Release or migration implications.

Do not over-plan simple edits. For cross-platform contract changes, plan explicitly because omissions are likely.

## Safe Editing Rules

- Do not revert unrelated worktree changes.
- Do not edit generated dependency/build output.
- Do not copy secrets or generated Firebase values into docs.
- Prefer existing abstractions, hooks, providers, repositories, and UI components.
- Avoid one-platform-only schema changes.
- Keep docs ASCII unless the target file already uses non-ASCII deliberately.
- Keep code comments rare and useful.

## Common Workflow: Add or Change a Firestore Field

Files to inspect:

- `src/lib/types.ts` or specialized type file.
- Matching mobile model under `mobile/lib/data/models/`.
- Server route serializers under `apps/api/**` or `src/app/api/**`, depending on the active caller.
- Web hooks under `src/hooks/`.
- Mobile repository/provider under `mobile/lib/data/repositories/` and `mobile/lib/presentation/providers/`.
- `database/firestore.rules`.
- `database/firestore.indexes.json` if query shape changes.

Steps:

1. Add backward-compatible reads where existing documents may lack the field.
2. Write the field from every creation path.
3. Update update/patch logic.
4. Update list/detail query mapping.
5. Update tests or add coverage.
6. Document migration needs if old data requires backfill.

## Common Workflow: Add an API Route

For active mobile backend work, prefer the standalone API under `apps/api/**`. Use `src/app/api/**` only for web/legacy Next.js routes.

Steps:

1. Place the standalone route in the appropriate `apps/api/src/routes/<domain>/routes.ts` module.
2. Add or update service behavior under `apps/api/src/services/`.
3. Use `preHandler: app.requireUser` when user context matters.
4. Validate request body, query, and path params.
5. Enforce group or admin authorization server-side.
6. Return typed JSON and clear error status codes.
7. Update `scripts/api/route-surface.ts`.
8. Add mobile endpoint constants if mobile will call it.
9. Add route/service tests where feasible.
10. Run `npm run api:contract` and regenerate agent docs.

## Common Workflow: Change AI Behavior

Files to inspect:

- `src/app/api/ai-chat/route.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/conversations/[conversationId]/generate-title/route.ts`
- `src/app/page.tsx`
- `apps/api/src/routes/ai/routes.ts`
- `apps/api/src/services/ai.ts`
- `apps/api/src/services/gemini-ai.ts`
- `mobile/lib/data/repositories/ai_repository.dart`
- Category and type contracts.

Checklist:

- Keep response shape stable or update all clients.
- Keep category output canonical.
- Avoid logging sensitive prompt inputs.
- Handle invalid JSON/model failures gracefully.
- Update docs/tests for prompt or schema changes.

## Common Workflow: Change Mobile Feature Behavior

Steps:

1. Read the feature repository, provider, screen, widgets, and model.
2. Check whether guest mode has special behavior.
3. Check route access and navigation.
4. Check Firestore rules and API route compatibility.
5. Run `flutter analyze` and targeted tests.
6. Update standalone API and shared web contracts if persisted data changes.
7. Regenerate agent docs for mobile/API changes.

## Common Workflow: Change Group Behavior

Steps:

1. Identify caller role requirements.
2. Validate membership/role server-side for API writes.
3. Verify Firestore direct mobile reads/writes are allowed by rules.
4. Update activity feed and notification behavior if relevant.
5. Resolve or avoid collection name drift between `groupActivity` and `groupActivities`.
6. Test at least owner/admin/member/non-member scenarios when practical.

## Common Workflow: Change Budget Behavior

Steps:

1. Use `monthlyLimit` as the canonical limit field.
2. Check personal and group budget paths.
3. Check post-expense budget recalculation/notification paths.
4. Update mobile budget model/repository/provider if stored shape changes.
5. Check notification side effects.
6. Validate analytics/reporting aggregation if category or period logic changes.

## Common Workflow: Update Documentation

Steps:

1. Update the smallest relevant guide under `docs/agents/`.
2. Stage new source files that should be represented in generated inventories.
3. Run `npm run docs:auto` when mobile/API/Firebase/workflow/source inventory or TypeScript/Dart model contracts changed.
4. Let the local hooks and CI auto-refresh generated docs; do not hand-edit files under `docs/agents/generated/`.
5. Update root or docs indexes only when discoverability changes.
6. Keep docs evidence-based and point to concrete files.
7. Do not paste generated secret values.

## Common Workflow: Change CI/CD

Steps:

1. Treat `.github/workflows/**`, `Dockerfile.api`, `mobile/fastlane/Fastfile`, and mobile native signing config as production code.
2. Keep required checks fail-closed: no `continue-on-error`, no `|| true`, no `|| echo`, no `set +e`, no mutable action refs, and no long-lived `FIREBASE_TOKEN`.
3. Run `npm run ci:policy` after workflow edits.
4. Keep PR checks check-only; required CI must not commit generated docs back to the branch.
5. For mobile release changes, preserve separate shared, Android, and iOS gates plus internal-release evidence artifacts.
6. For API staging changes, preserve no-traffic candidate deploy, mandatory smoke, promotion after smoke, and rollback behavior.
7. Update `docs/agents/TESTING_AND_RELEASE.md`, `mobile/CICD.md`, and generated docs with `npm run docs:auto`.

## Validation Matrix

Use this matrix to choose checks:

- Docs-only: inspect markdown, run `npm run docs:auto` when generated artifacts or OpenAPI may be affected.
- TypeScript type/API change: `npm run typecheck`, `npm run lint`, targeted `npm run test`.
- Next route behavior change: targeted tests plus `npm run build` when feasible.
- Standalone API change: `npm run api:check` and `npm run api:contract`.
- Firebase rules/index change: `npm run test:db` plus inspect CI/deploy workflow expectations.
- Mobile Dart change: `cd mobile && flutter analyze`, targeted `flutter test`.
- Mobile native/release change: inspect Fastlane and workflow, run build lane only when environment supports it.
- Workflow/release change: `npm run ci:policy`, YAML parse/action lint when available, and targeted release/API script tests.
- Cross-platform schema change: both web and mobile checks.

## Review Checklist

Before final response, verify:

- `git status --short` only shows intended changes plus pre-existing unrelated changes.
- Every touched data contract is updated across web/mobile/Firebase.
- New routes have auth, validation, and observability.
- Group operations validate membership/role.
- Category strings are canonical.
- Tests or validation commands were run, or the reason they were not run is stated.
- Documentation updates are included for architecture or workflow changes.

## Handoff Format

Final response should include:

- What changed.
- Files changed, with clear references.
- Validation run and result.
- Known residual risks or follow-up recommendations when relevant.
