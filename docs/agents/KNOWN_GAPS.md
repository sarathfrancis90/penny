# Known Gaps and Drift

This file records issues discovered during the full repository analysis. Treat these as starting points for future hardening, not as proof that behavior is currently broken in production without further testing.

## High Priority

### Standalone Expense Side-Effect Parity Gap

The standalone expense path now creates group activity notifications and FCM push notifications for group expense create/update/delete. It still does not port every Next API side effect.

Risk:

- Mobile group expense creation through standalone API can still miss budget alerts and approval-required behavior.
- Agents may assume `POST /api/expenses` is behaviorally equivalent to the Next route.

What to inspect:

- `apps/api/src/routes/expenses/routes.ts`
- `apps/api/src/services/firestore-expenses.ts`
- `apps/api/src/services/notifications.ts`
- `src/app/api/expenses/route.ts`
- `mobile/lib/presentation/widgets/expense_confirmation_sheet.dart`

### Standalone Expense List Placeholder

`GET /api/expenses` is registered in the standalone API but currently returns an empty placeholder list.

Risk:

- Agents may move mobile reads from direct Firestore to a nonfunctional list API.

What to inspect:

- `apps/api/src/routes/expenses/routes.ts`
- `docs/agents/generated/API_ROUTE_SURFACE.md`

### Legacy Group Activity Collection Drift

Some legacy web group API routes write to `groupActivity` singular, while Firestore rules, mobile code, and standalone API services reference `groupActivities` plural.

Risk:

- Group activity records may be written to a collection that clients do not read.
- Rules may not protect or allow the intended collection consistently.
- Activity feeds can diverge between web and mobile.

What to inspect:

- `src/app/api/groups/**/route.ts`
- `apps/api/src/routes/groups/routes.ts`
- `apps/api/src/services/firestore-groups.ts`
- `database/firestore.rules`
- `mobile/lib/data/repositories/group_repository.dart`
- Any group activity UI or service code.

### Budget Limit Field Drift

Budget models and rules use `monthlyLimit`, but at least one post-expense notification path references `budget.limit`.

Risk:

- Budget notification calculations can use `0` or incorrect thresholds.
- Users may not receive expected budget alerts.

What to inspect:

- `src/app/api/expenses/route.ts`
- `src/lib/types.ts`
- `src/lib/budgetCalculations.ts`
- `src/lib/services/budgetNotificationService.ts`
- `apps/api/src/routes/budgets/routes.ts`
- `apps/api/src/services/budgets.ts`
- `mobile/lib/data/models/budget_model.dart`

### Non-Canonical Category Fallback

The canonical category list is in `src/lib/categories.ts` and `mobile/lib/core/constants/categories.dart`. At least one AI fallback path uses `Other Business Expenses`, which is not part of the canonical list.

Risk:

- Invalid categories can be stored.
- Budget/category aggregation can miss expenses.
- Mobile and web category filters can diverge.

What to inspect:

- `src/app/api/analyze-expense/route.ts`
- `src/lib/categories.ts`
- `mobile/lib/core/constants/categories.dart`

## Medium Priority

### Admin Auth Split

Admin endpoints use two authentication models:

- Legacy HMAC cookie auth in `src/lib/admin-auth.ts`.
- Firebase custom-claim auth through `verifyAdmin()` in `src/lib/auth-middleware.ts`.

Risk:

- Agents may assume all admin endpoints share the same security model.
- Future endpoints may accidentally use the wrong model.

Recommendation:

- Document intended admin auth model per endpoint.
- Consider converging on one model or wrapping both behind a clearly named abstraction.

### Firestore Broad List Rules

Some Firestore rules permit list operations for any authenticated user while relying on clients to query with user/group filters.

Risk:

- A new client query could accidentally fetch too broad a dataset.
- Security depends on disciplined query construction.

Recommendation:

- Avoid broad client queries.
- Prefer stricter rules where feasible.
- Add tests or emulator checks for sensitive collection access.

### Documentation Version Drift

Older public/historical docs mention older stack versions, older AI model names, or implementation plans that may no longer match source.

Examples:

- Root `README.md` mentions older Next/React/Gemini versions than package/source files.
- `docs/README.md` has an older last-updated date.
- `mobile/README.md` is default Flutter boilerplate.
- Historical planning docs under `docs/superpowers/plans/` describe intended files and phases that may not match current implementation.

Recommendation:

- Prefer source files, package files, and current agent docs for implementation work.
- Update public-facing docs separately from this agent documentation pass.

### Mobile Production API Base URL Drift

`mobile/lib/core/constants/env_config.dart` points staging at the Cloud Run standalone API, but the default production URL still points at the Vercel app.

Risk:

- Agents may assume production mobile traffic is fully cut over to the standalone API when it may still use the Next/Vercel API surface.
- API parity or rollout validation can target the wrong backend.

Recommendation:

- Confirm rollout intent before changing production mobile API routing.
- If production should use Cloud Run, update `EnvConfig`, mobile release docs, generated agent docs, and smoke/parity validation.

### Firebase Deploy Workflow References Missing Script

`.github/workflows/firebase-deploy.yml` references `npm run test:db`, but `package.json` does not define that script. The workflow currently treats the command as non-blocking.

Risk:

- Database rule tests may not be running even when the workflow appears to include them.

Recommendation:

- Add a real database test script or remove/replace the stale workflow step.

### Lint Strictness Drift

`.cursor/rules/build-and-lint.mdc` says lint must be zero-warning, but `npm run lint` does not pass `--max-warnings=0`, and ESLint config intentionally demotes several rules to warnings.

Risk:

- Agents may report lint compliance inconsistently.

Recommendation:

- Decide whether zero-warning lint is required, then align package script, workflow, and editor rules.

## Lower Priority

### Empty or Placeholder Areas

Some directories or files are placeholders, boilerplate, or historical docs rather than active runtime code. Examples include default Flutter README content and some historical launch/planning docs.

Risk:

- Agents may spend time interpreting stale prose as current implementation.

Recommendation:

- Archive or label historical docs clearly.

### Generated Firebase Config in Repository

The repo includes generated Firebase config files for web/mobile platforms.

Risk:

- Agents could accidentally quote config values in logs/docs.
- Public/client API keys may be mistaken for secrets or mishandled.

Recommendation:

- Reference paths only in documentation.
- Do not reproduce values unless explicitly required.

## Triage Order

1. Fix category fallback because it is low-risk and prevents invalid data.
2. Fix budget limit field drift because it can directly affect user alerts.
3. Resolve group activity collection naming before adding new group activity features.
4. Align database test workflow with actual package scripts.
5. Decide lint warning policy and update scripts/docs.
6. Refresh public README/mobile README after implementation risks are handled.
