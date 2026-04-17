import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { fetchAppStoreMetrics } from '@/lib/store-metrics/appStoreConnect';
import { fetchGooglePlayMetrics } from '@/lib/store-metrics/googlePlay';
import { adminDb } from '@/lib/firebase-admin';

interface PlatformResult {
  platform: 'ios' | 'android';
  ok: boolean;
  newReviews?: number;
  error?: string;
}

async function handler(req: NextRequest) {
  // Vercel Cron auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` on scheduled invocations.
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const yesterday = new Date(Date.now() - 24 * 3600e3)
    .toISOString()
    .slice(0, 10);

  const results: PlatformResult[] = [];

  try {
    const ios = await fetchAppStoreMetrics(yesterday);
    await adminDb
      .collection('store_metrics')
      .doc(`ios_${yesterday}`)
      .set(ios);
    results.push({
      platform: 'ios',
      ok: true,
      newReviews: ios.newReviews.length,
    });
  } catch (e) {
    results.push({ platform: 'ios', ok: false, error: (e as Error).message });
  }

  try {
    const android = await fetchGooglePlayMetrics(yesterday);
    await adminDb
      .collection('store_metrics')
      .doc(`android_${yesterday}`)
      .set(android);
    results.push({
      platform: 'android',
      ok: true,
      newReviews: android.newReviews.length,
    });
  } catch (e) {
    results.push({
      platform: 'android',
      ok: false,
      error: (e as Error).message,
    });
  }

  // Cronitor heartbeat
  if (process.env.CRONITOR_STORE_METRICS_TOKEN) {
    await fetch(
      `https://cronitor.link/p/${process.env.CRONITOR_STORE_METRICS_TOKEN}/store-metrics`,
    ).catch(() => {
      // Non-fatal
    });
  }

  return new Response(JSON.stringify({ date: yesterday, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = withObservability(handler, {
  route: '/api/cron/store-metrics',
});
