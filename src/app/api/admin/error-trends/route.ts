import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { verifyAdmin } from '@/lib/admin-auth';

async function handler(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (auth instanceof Response) return auth;

  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT_WEB;
  if (!token || !org || !project) {
    return new Response(
      JSON.stringify({ error: 'Sentry not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const res = await fetch(
    `https://sentry.io/api/0/projects/${org}/${project}/issues/?statsPeriod=7d&sort=freq`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = withObservability(handler, { route: '/api/admin/error-trends' });
