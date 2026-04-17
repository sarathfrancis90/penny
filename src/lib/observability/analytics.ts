import { posthog } from './posthog';
import { isObservabilityEnabled } from './env';

export type TrackableEvent =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'budget_created'
  | 'budget_limit_changed'
  | 'group_created'
  | 'group_member_invited'
  | 'ai_chat_message_sent'
  | 'ai_chat_expense_confirmed'
  | 'savings_goal_created'
  | 'income_source_added';

/**
 * PII-stripping guard. Never let sensitive field names reach PostHog.
 * When instrumenting a new event, add only non-PII properties like category,
 * counts, or enum values — not amounts, vendor names, emails, or descriptions.
 */
const BANNED_PROPS = new Set([
  'amount',
  'vendor',
  'email',
  'password',
  'token',
  'description',
  'notes',
  'receipt',
  'receipturl',
  'receiptpath',
]);

function stripPII(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (BANNED_PROPS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function track(
  event: TrackableEvent,
  properties: Record<string, unknown> = {},
): void {
  if (!isObservabilityEnabled()) return;
  if (typeof window === 'undefined') return;
  const sanitized = stripPII(properties);
  try {
    posthog.capture(event, sanitized);
  } catch {
    // Never let analytics errors bubble to the user.
  }
}

// Exposed for tests.
export const __testing__ = { stripPII };
