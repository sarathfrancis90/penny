import { describe, it, expect, beforeEach } from 'vitest';
import {
  getConsentState,
  setConsentState,
  isConsentGiven,
  CONSENT_COOKIE,
} from '../consent';

describe('observability/consent', () => {
  beforeEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it('returns "unset" when no cookie', () => {
    expect(getConsentState()).toBe('unset');
  });

  it('setConsentState writes cookie and getConsentState follows', () => {
    setConsentState('granted');
    expect(getConsentState()).toBe('granted');
    expect(isConsentGiven()).toBe(true);
  });

  it('denied blocks consent', () => {
    setConsentState('denied');
    expect(getConsentState()).toBe('denied');
    expect(isConsentGiven()).toBe(false);
  });

  it('invalid cookie value falls back to unset', () => {
    document.cookie = `${CONSENT_COOKIE}=garbage; Path=/`;
    expect(getConsentState()).toBe('unset');
  });
});
