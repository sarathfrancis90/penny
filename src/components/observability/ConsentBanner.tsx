'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getConsentState,
  setConsentState,
} from '@/lib/observability/consent';
import { onConsentChange } from '@/lib/observability/posthog';

/**
 * First-visit consent banner. Gates PostHog capture opt-in.
 * Only renders when consent state is "unset".
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsentState() === 'unset');
  }, []);

  if (!visible) return null;

  const handle = (state: 'granted' | 'denied') => () => {
    setConsentState(state);
    onConsentChange(state === 'granted');
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4 shadow-lg z-50"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm flex-1 text-neutral-900 dark:text-neutral-100">
          We use privacy-respecting analytics (PostHog, EU) to improve Penny.
          Financial data is never sent.{' '}
          <Link
            href="/privacy/data-processors"
            className="underline text-blue-600 dark:text-blue-400"
          >
            Learn more
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <button
            onClick={handle('denied')}
            type="button"
            className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Essential only
          </button>
          <button
            onClick={handle('granted')}
            type="button"
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
