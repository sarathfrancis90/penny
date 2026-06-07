# Agent Workflows

## Operating Model

This repo is designed for agentic engineering. Agents should work from evidence, keep contracts synchronized, and validate with commands proportional to the change.

Default workflow:

1. Inspect `git status --short` and avoid unrelated dirty files.
2. Read the relevant agent guide and `FILE_MAP.md` entries for the touched area.
3. Trace the data flow before editing.
4. Make the smallest coherent change across all affected layers.
5. Run targeted validation.
6. Update docs when behavior, architecture, or contracts changed.
7. Report changed files, validation, and residual risks.

## Context Building

Use this order for deep work:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/agents/REPOSITORY_GUIDE.md`
4. Platform guide for the target area.
5. `docs/agents/FIREBASE_AND_DATA_CONTRACTS.md` for persisted data.
6. `docs/agents/FILE_MAP.md` for complete file awareness.
7. Source files, tests, and docs adjacent to the change.

When the user says not to skip files, use `git ls-files` plus `git ls-files --others --exclude-standard` as the source-aware working-tree inventory, and explicitly account for generated/ignored artifacts separately.

## Planning Heuristics

Before editing, identify:

- User-visible behavior being changed.
- Runtime platform: web, mobile, Firebase, CI, or docs.
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
- Matching mobile model under `mobile/lib/features/**/data/models/`.
- Server route serializers under `src/app/api/**`.
- Web hooks under `src/hooks/`.
- Mobile repository/provider under `mobile/lib/features/**`.
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

Steps:

1. Place the route under `src/app/api/<domain>/route.ts` or an appropriate dynamic segment.
2. Wrap with `withObservability({ route })` unless intentionally excluded.
3. Authenticate with `getAuthenticatedUserId(req)` when user context matters.
4. Validate request body and path params.
5. Enforce group or admin authorization server-side.
6. Return typed JSON and clear error status codes.
7. Add mobile endpoint constants if mobile will call it.
8. Add tests where feasible.

## Common Workflow: Change AI Behavior

Files to inspect:

- `src/app/api/ai-chat/route.ts`
- `src/app/api/analyze-expense/route.ts`
- `src/app/api/conversations/[id]/generate-title/route.ts`
- `src/app/page.tsx`
- `mobile/lib/features/chat/data/repositories/ai_repository.dart`
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
6. Update shared web contracts if persisted data changes.

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
2. Update `FILE_MAP.md` if tracked or source-relevant untracked files changed.
3. Update root or docs indexes only when discoverability changes.
4. Keep docs evidence-based and point to concrete files.
5. Do not paste generated secret values.

## Validation Matrix

Use this matrix to choose checks:

- Docs-only: inspect markdown, verify links/paths manually or with `rg`/`test -f`.
- TypeScript type/API change: `npm run typecheck`, `npm run lint`, targeted `npm run test`.
- Next route behavior change: targeted tests plus `npm run build` when feasible.
- Firebase rules/index change: Firebase rules validation or emulator tests if available; inspect CI workflow expectations.
- Mobile Dart change: `cd mobile && flutter analyze`, targeted `flutter test`.
- Mobile native/release change: inspect Fastlane and workflow, run build lane only when environment supports it.
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
