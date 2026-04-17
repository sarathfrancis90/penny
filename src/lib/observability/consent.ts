/**
 * Consent state lives in a first-party cookie read/written client-side.
 * PostHog opt-in/opt-out is gated on this state.
 */

export type ConsentState = 'unset' | 'granted' | 'denied';
export const CONSENT_COOKIE = 'penny_consent';

export function getConsentState(): ConsentState {
  if (typeof document === 'undefined') return 'unset';
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]+)`),
  );
  if (!match) return 'unset';
  const v = decodeURIComponent(match[1]);
  if (v === 'granted' || v === 'denied') return v;
  return 'unset';
}

export function setConsentState(state: 'granted' | 'denied'): void {
  if (typeof document === 'undefined') return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${CONSENT_COOKIE}=${state}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
}

export function isConsentGiven(): boolean {
  return getConsentState() === 'granted';
}
