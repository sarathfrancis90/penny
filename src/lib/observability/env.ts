/**
 * Observability environment + kill-switch.
 *
 * All observability modules must check `isObservabilityEnabled()` before
 * side-effecting so the code can ship safely without external credentials.
 */

export type ObservabilityEnv = 'development' | 'staging' | 'production' | 'preview';

export function isObservabilityEnabled(): boolean {
  return process.env.OBSERVABILITY_ENABLED === 'true';
}

export function getObservabilityEnv(): ObservabilityEnv {
  const v = process.env.OBSERVABILITY_ENV;
  if (v === 'staging' || v === 'production' || v === 'preview') return v;
  return 'development';
}

export function getSentryDsn(): string | null {
  return process.env.NEXT_PUBLIC_SENTRY_DSN ?? null;
}

export function getSentryAuthToken(): string | null {
  return process.env.SENTRY_AUTH_TOKEN ?? null;
}

export function getSentryOrg(): string | null {
  return process.env.SENTRY_ORG ?? null;
}

export function getSentryProject(): string | null {
  return process.env.SENTRY_PROJECT_WEB ?? null;
}

export function getPostHogKey(): string | null {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY ?? null;
}

export function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
}

export function getRelease(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.NEXT_PUBLIC_RELEASE ??
    'unknown'
  );
}
