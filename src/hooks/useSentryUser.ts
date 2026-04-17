'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * Forwards Firebase Auth uid → Sentry user context on auth state change.
 * PII-safe: only id is sent, never email or display name.
 */
export function useSentryUser() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      Sentry.setUser(user ? { id: user.uid } : null);
    });
    return () => unsub();
  }, []);
}
