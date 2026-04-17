import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isObservabilityEnabled,
  getObservabilityEnv,
  getSentryDsn,
  getPostHogKey,
  getPostHogHost,
  getRelease,
} from '../env';

describe('observability/env', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env = { ...original };
  });
  afterEach(() => {
    process.env = original;
  });

  describe('isObservabilityEnabled', () => {
    it('returns false when flag unset', () => {
      delete process.env.OBSERVABILITY_ENABLED;
      expect(isObservabilityEnabled()).toBe(false);
    });

    it('returns true only for literal "true"', () => {
      process.env.OBSERVABILITY_ENABLED = 'true';
      expect(isObservabilityEnabled()).toBe(true);
    });

    it('is strict about casing', () => {
      process.env.OBSERVABILITY_ENABLED = 'True';
      expect(isObservabilityEnabled()).toBe(false);
    });

    it('does not accept "1"', () => {
      process.env.OBSERVABILITY_ENABLED = '1';
      expect(isObservabilityEnabled()).toBe(false);
    });
  });

  describe('getObservabilityEnv', () => {
    it('defaults to development', () => {
      delete process.env.OBSERVABILITY_ENV;
      expect(getObservabilityEnv()).toBe('development');
    });

    it('returns configured valid values', () => {
      process.env.OBSERVABILITY_ENV = 'staging';
      expect(getObservabilityEnv()).toBe('staging');
      process.env.OBSERVABILITY_ENV = 'production';
      expect(getObservabilityEnv()).toBe('production');
      process.env.OBSERVABILITY_ENV = 'preview';
      expect(getObservabilityEnv()).toBe('preview');
    });

    it('falls back to development for invalid values', () => {
      process.env.OBSERVABILITY_ENV = 'garbage';
      expect(getObservabilityEnv()).toBe('development');
    });
  });

  describe('credentials accessors', () => {
    it('getSentryDsn returns null when absent', () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      expect(getSentryDsn()).toBeNull();
    });

    it('getSentryDsn returns string when present', () => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/2';
      expect(getSentryDsn()).toBe('https://abc@o1.ingest.sentry.io/2');
    });

    it('getPostHogKey returns null when absent', () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      expect(getPostHogKey()).toBeNull();
    });

    it('getPostHogHost defaults to EU', () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
      expect(getPostHogHost()).toBe('https://eu.i.posthog.com');
    });

    it('getPostHogHost returns override', () => {
      process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://app.posthog.com';
      expect(getPostHogHost()).toBe('https://app.posthog.com');
    });
  });

  describe('getRelease', () => {
    it('prefers VERCEL_GIT_COMMIT_SHA', () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123';
      process.env.GITHUB_SHA = 'def456';
      expect(getRelease()).toBe('abc123');
    });

    it('falls back to GITHUB_SHA', () => {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      process.env.GITHUB_SHA = 'def456';
      expect(getRelease()).toBe('def456');
    });

    it('falls back to unknown', () => {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      delete process.env.GITHUB_SHA;
      delete process.env.NEXT_PUBLIC_RELEASE;
      expect(getRelease()).toBe('unknown');
    });
  });
});
