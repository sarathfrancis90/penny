'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  initPostHog,
  identifyUser,
  resetUser,
} from '@/lib/observability/posthog';

/**
 * Mount once at layout root. Initializes PostHog and keeps distinct_id in sync
 * with Firebase Auth uid across sign-in / sign-out.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) identifyUser(user.uid);
      else resetUser();
    });
    return () => unsub();
  }, []);
  return <>{children}</>;
}
