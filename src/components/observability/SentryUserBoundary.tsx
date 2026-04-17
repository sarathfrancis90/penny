'use client';
import { useSentryUser } from '@/hooks/useSentryUser';

/**
 * Mount once at layout root. Forwards Firebase Auth user id to Sentry.
 * Renders nothing.
 */
export function SentryUserBoundary() {
  useSentryUser();
  return null;
}
