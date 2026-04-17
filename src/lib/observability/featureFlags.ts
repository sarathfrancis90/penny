import { posthog } from './posthog';
import { isObservabilityEnabled } from './env';

export type KnownFlag =
  | 'staging_kill_switch_observability'
  | 'new_ai_model_rollout'
  | 'session_replay_enabled';

export function isFeatureEnabled(flag: KnownFlag): boolean {
  if (!isObservabilityEnabled()) return false;
  if (typeof window === 'undefined') return false;
  try {
    return posthog.isFeatureEnabled(flag) === true;
  } catch {
    return false;
  }
}

export function getFeatureFlagVariant(
  flag: KnownFlag,
): string | boolean | undefined {
  if (!isObservabilityEnabled()) return undefined;
  if (typeof window === 'undefined') return undefined;
  try {
    return posthog.getFeatureFlag(flag);
  } catch {
    return undefined;
  }
}
