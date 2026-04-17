import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminDb } from '@/lib/firebase-admin';
import type { StoreMetrics } from '@/lib/types/store-metrics';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;

  const snap = await adminDb
    .collection('store_metrics')
    .orderBy('date', 'desc')
    .limit(30)
    .get();

  const metrics = snap.docs.map((d) => d.data() as StoreMetrics);
  return new Response(JSON.stringify({ metrics }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = withObservability(handler, {
  route: '/api/admin/store-metrics',
});
