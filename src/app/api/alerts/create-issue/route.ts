import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { withObservability } from '@/lib/observability/withObservability';
import type { AlertPayload } from '../discord-forward/route';

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.ALERT_FORWARD_SECRET;
  if (!secret || !header) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(raw)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const headerBuf = Buffer.from(header);
  if (expectedBuf.length !== headerBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, headerBuf);
}

async function handler(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-alert-signature');
  if (!verifySignature(raw, signature)) {
    return new Response(JSON.stringify({ error: 'Bad signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: AlertPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (payload.severity !== 'critical') {
    return new Response(
      JSON.stringify({ skipped: 'non-critical severity' }),
      { status: 204, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const ghToken = process.env.GITHUB_ISSUE_TOKEN;
  const repo = process.env.GITHUB_ISSUE_REPO ?? 'sarathfrancis/penny';
  if (!ghToken) {
    return new Response(
      JSON.stringify({ error: 'GITHUB_ISSUE_TOKEN not set' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = [
    `**Severity:** ${payload.severity}`,
    `**Source:** ${payload.source ?? 'unknown'}`,
    '',
    payload.description ?? '(no description)',
    '',
    payload.url ? `Original: ${payload.url}` : '',
    '',
    '_This issue was auto-created from a critical alert. Triage per `docs/observability/ALERTS.md`._',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `[alert:critical] ${payload.title}`,
      body,
      labels: ['observability', 'alert', 'severity:critical'],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(
      JSON.stringify({ error: 'GitHub API error', status: res.status, detail: errText }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const issue = (await res.json()) as { html_url?: string };
  return new Response(
    JSON.stringify({ ok: true, issueUrl: issue.html_url }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

export const POST = withObservability(handler, {
  route: '/api/alerts/create-issue',
});
