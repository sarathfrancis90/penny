import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;

  const token = process.env.POSTHOG_PERSONAL_API_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!token || !projectId) {
    return new Response(
      JSON.stringify({ error: 'PostHog not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const events = encodeURIComponent(
    JSON.stringify([
      { id: '$pageview', name: 'Pageviews', type: 'events' },
      { id: 'expense_added', name: 'Expenses added', type: 'events' },
    ]),
  );

  const res = await fetch(
    `${host}/api/projects/${projectId}/insights/trend/?events=${events}&date_from=-7d&interval=day`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = withObservability(handler, {
  route: '/api/admin/user-analytics',
});
