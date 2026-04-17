import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;

  const token = process.env.BETTERSTACK_API_KEY;
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'BetterStack not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const res = await fetch(
    'https://uptime.betterstack.com/api/v2/monitors',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = withObservability(handler, { route: '/api/admin/uptime' });
