'use client';

import posthog from 'posthog-js';
import {
  getPostHogKey,
  getPostHogHost,
  isObservabilityEnabled,
  getObservabilityEnv,
} from './env';
import { isConsentGiven } from './consent';

let initialized = false;

/**
 * Initialize PostHog. Safe to call multiple times; only runs once.
 * No-op when OBSERVABILITY_ENABLED != true or NEXT_PUBLIC_POSTHOG_KEY is absent.
 *
 * STRICT session-replay masking config:
 *   - maskAllInputs: every input captured as `***`
 *   - blockSelector: [data-ph-no-capture] removes elements entirely from replay
 *   - blockAllMedia (via integrations elsewhere) blocks images
 */
export function initPostHog(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  if (!isObservabilityEnabled()) return;
  const key = getPostHogKey();
  if (!key) return;

  posthog.init(key, {
    api_host: getPostHogHost(),
    person_profiles: 'identified_only',
    autocapture: { dom_event_allowlist: ['click', 'change', 'submit'] },
    capture_pageview: true,
    capture_pageleave: true,
    opt_out_capturing_by_default: true,
    persistence: 'localStorage+cookie',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
      blockSelector: '[data-ph-no-capture]',
    },
    loaded: (ph) => {
      if (isConsentGiven()) ph.opt_in_capturing();
      ph.register({ env: getObservabilityEnv() });
    },
  });
  initialized = true;
}

export function identifyUser(uid: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(uid, props);
}

export function resetUser(): void {
  if (!initialized) return;
  posthog.reset();
}

export function onConsentChange(granted: boolean): void {
  if (!initialized) return;
  if (granted) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

export { posthog };
