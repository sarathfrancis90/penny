# Firebase and Data Contracts

## Source Files

- `database/firestore.rules` - Firestore authorization contract.
- `database/storage.rules` - Firebase Storage authorization contract.
- `database/firestore.indexes.json` - required query indexes.
- `src/lib/types.ts` - central TypeScript domain contracts.
- `src/lib/types/income.ts`, `src/lib/types/savings.ts`, `src/lib/types/notifications.ts` - specialized TypeScript contracts.
- `src/lib/categories.ts` - canonical CRA category list.
- `packages/shared/src/categories.ts` - shared category contract used by the standalone API.
- `mobile/lib/data/models/*.dart` - mobile persisted model contracts.
- `mobile/lib/core/constants/categories.dart` - mobile category list.
- `apps/api/src/services/**` - standalone API serializers and Firestore service contracts.
- `scripts/api/route-surface.ts` - standalone API route contract.

## Contract Change Rule

Any persisted data change must be updated as one unit:

1. TypeScript type or interface.
2. Dart model serialization/deserialization.
3. Firestore rules.
4. Firestore indexes if query shape changes.
5. Standalone API serializers and validators.
6. Web/legacy API serializers if the web route still uses the field.
7. Client hooks/providers/repositories.
8. Tests, generated agent docs, and curated documentation.

Do not make a schema change in only one platform.

## Collections

The repository references these important Firestore collections:

- `expenses` - personal and group expenses.
- `users` - user profiles and user settings.
- `groups` - group metadata.
- `groupMembers` - group membership records.
- `groupInvitations` - invitations and invite lifecycle.
- `groupActivities` - group activity feed, canonical plural name in rules/mobile.
- `conversations` - AI conversation metadata.
- `conversations/{conversationId}/messages` - AI chat messages subcollection.
- `budgets_personal` - personal budgets.
- `budgets_group` - group budgets.
- `budgetAlerts` - budget alert records.
- `notifications` - in-app notification records.
- `users/{userId}.fcmTokens` - device tokens for push notifications stored on the user document.
- `income_sources_personal` - personal income records.
- `income_sources_group` - group income records.
- `savings_goals_personal` - personal savings goals.
- `savings_goals_group` - group savings goals.
- `passkeys` - WebAuthn credentials.
- `challenges` - WebAuthn challenge state.
- Admin/observability collections used by admin routes and metrics jobs.

Always verify exact collection names in source before adding queries. There is known singular/plural drift around group activity.

## Security Rules Principles

Firestore rules contain helper functions for auth, ownership, group membership, and admin checks. Use these principles:

- User-owned documents must include and enforce `userId` where applicable.
- Group-owned data must validate active membership.
- Server-only writes should remain server-only. Do not relax rules to allow client writes for convenience.
- If a rule allows authenticated list access, client queries must still be scoped to the current user or group.
- Rules are not input validation for server routes; standalone API and Next API routes still need validation and authorization.

## Mandatory Query Scopes

Several Firestore `list` rules currently allow any authenticated user and rely on disciplined query construction. Agents must not add broad client reads for these collections.

Required mobile/client query scopes:

| Collection | Required scope |
|---|---|
| `expenses` | Personal queries must filter `userId == currentUser.uid`; group queries must filter one authorized `groupId` and preserve group membership checks. |
| `groupMembers` | Own-membership queries must filter `userId == currentUser.uid`; group member lists must filter a single group ID already proven accessible. |
| `conversations` | Filter `userId == currentUser.uid`. |
| `conversations/{conversationId}/messages` | Query only under a conversation already proven to belong to `currentUser.uid`. |
| `budgets_personal` | Filter `userId == currentUser.uid`. |
| `budgets_group` | Filter one authorized `groupId`; reads require membership and writes require owner/admin semantics. |
| `notifications` | Filter `userId == currentUser.uid`. |
| `income_sources_personal` | Filter `userId == currentUser.uid`. |
| `income_sources_group` | Filter one authorized `groupId`. |
| `savings_goals_personal` | Filter `userId == currentUser.uid`. |
| `savings_goals_group` | Filter one authorized `groupId`. |

If a feature needs a broader query, change the rules and add emulator/route tests instead of relying on client-side filtering after a broad read.

## Storage Rules

Storage is primarily used for receipts and conversation uploads. Storage rules constrain files by authenticated user path, content type, and size.

Before adding a new storage path:

- Add a path-specific rule.
- Restrict reads/writes to the owning user or authorized group members.
- Validate content type and size.
- Update upload code on web and mobile if applicable.

## Expense Contract

Expense records include fields for user ownership, amount, category, date, description/vendor, optional receipt data, tax metadata, group metadata, and status fields.

Key invariants:

- `amount` must be numeric and positive for real expenses.
- `category` must be one of the canonical category strings.
- Group expenses must include group identifiers and must not be writable by non-members.
- Approval/rejection status must be handled consistently across web and mobile.
- Receipt URLs and storage paths must respect storage ownership rules.
- Firestore rules currently require a `category` field but do not validate it against the canonical list. Direct Firestore writers must validate before write; API writers should use `packages/shared/src/categories.ts`.

## Category Contract

Canonical web file: `src/lib/categories.ts`.
Canonical mobile file: `mobile/lib/core/constants/categories.dart`.

Rules:

- Category strings must match exactly, including punctuation and capitalization.
- AI prompts must instruct the model to use only canonical strings.
- Fallback categories must also be canonical.
- Budget aggregation and analytics should not invent alternate labels.
- Direct mobile Firestore writes must validate or choose from `mobile/lib/core/constants/categories.dart`; rules do not enforce category membership.
- Regenerate generated agent docs after category contract changes.

Known issue to check before category work: at least one AI fallback path uses a non-canonical category string. See `KNOWN_GAPS.md`.

## Group Contract

Group data spans groups, members, invitations, activities, expenses, budgets, and notifications.

Rules:

- Group metadata alone is not proof of access. Check membership.
- Group membership document IDs are security-critical: `groupMembers/{groupId}_{userId}`.
- Group member records must include `role`, `status`, and the stored `permissions` map. Rules read permission flags such as `permissions.canAddExpenses` and `permissions.canApproveExpenses`; role-only memberships are insufficient.
- Standalone API and Next API routes that mutate group state should validate caller role.
- Invitation accept/decline flows must guard against duplicate or stale state.
- Activity feed collection name should be canonicalized before new work.

## Budget Contract

Budget records use `monthlyLimit` as the limit field. Budget usage and alerts should calculate against `monthlyLimit` and the relevant period.

Rules:

- Do not introduce `limit` as an alternate field unless a migration plan exists.
- Budget checks after expense creation should use the same field as budget screens and models.
- Group budget reads require membership; group budget create/update/delete require owner/admin authorization.
- Alert thresholds should avoid duplicate noisy notifications.

## Conversation Contract

Conversation data is split between conversation metadata and messages.

Rules:

- Message ownership must be validated by user ID.
- Attachments must use authorized storage paths.
- AI-generated titles must not expose another user's content.
- Mobile, standalone API, and web should agree on role names, timestamps, and attachment fields.

## Notification Contract

Notifications are used for group expenses, budget alerts, and other user-facing events.

Rules:

- Client-created notifications should remain restricted unless the use case is clearly safe.
- Push notifications require FCM tokens and server-side send logic.
- Notification payloads must not contain excessive financial detail.
- Mobile notification model, standalone API notification payloads, and web notification types must remain compatible.

## Passkey Contract

Passkeys use WebAuthn challenge and credential collections.

Important files:

- `src/lib/passkey-config.ts`
- `src/app/api/auth/passkey/**/route.ts`

Rules:

- Challenges must expire and be user-bound.
- RP ID and origin must match deployment environment.
- Session cookies must be signed and scoped appropriately.
- Firebase custom token creation must remain server-side.

## Index Contract

When adding or changing Firestore queries:

- Search the repository for the collection and ordered fields.
- Check `database/firestore.indexes.json` for matching composite indexes.
- Add indexes alongside code changes when a query requires them.
- Validate mobile direct queries as well as standalone API and web server/client queries.

## Sensitive Config Handling

The repo includes generated Firebase config files for web/mobile platforms. Agents must not quote or replicate API keys, project IDs, app IDs, or plist/json values in docs, comments, or final messages unless the user explicitly asks and the value is already intended public. Prefer referencing file paths only.

## Data Contract Review Checklist

- Does this change affect stored Firestore fields?
- Does mobile deserialize the new or changed field safely?
- Does standalone API serialize and validate it safely?
- Does web serialize and validate it safely when web still uses the field?
- Do rules allow the intended operation and block unintended access?
- Does the query require a new index?
- Are category strings still canonical?
- Are group membership checks enforced server-side where needed?
- Are notifications and push payloads free of unnecessary sensitive data?
- Have generated agent docs been regenerated and checked?
