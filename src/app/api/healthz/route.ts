import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { adminDb } from '@/lib/firebase-admin';

async function handler(_req: NextRequest) {
  let firestore: 'ok' | 'error' = 'ok';
  try {
    await adminDb.collection('_healthz').doc('ping').get();
  } catch {
    firestore = 'error';
  }
  const status = firestore === 'ok' ? 'ok' : 'degraded';
  return new Response(
    JSON.stringify({ status, firestore, timestamp: new Date().toISOString() }),
    {
      status: firestore === 'ok' ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export const GET = withObservability(handler, { route: '/api/healthz' });
