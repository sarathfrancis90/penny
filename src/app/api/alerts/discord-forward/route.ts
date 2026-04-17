import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { withObservability } from '@/lib/observability/withObservability';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  description?: string;
  source?: string;
  url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}

const SEVERITY_COLOR: Record<AlertSeverity, number> = {
  critical: 0xdc2626,
  warning: 0xf59e0b,
  info: 0x3b82f6,
};

function webhookFor(severity: AlertSeverity): string | undefined {
  return {
    critical: process.env.DISCORD_WEBHOOK_ALERTS_CRITICAL,
    warning: process.env.DISCORD_WEBHOOK_ALERTS_WARNING,
    info: process.env.DISCORD_WEBHOOK_ALERTS_INFO,
  }[severity];
}

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

  if (!payload.severity || !payload.title) {
    return new Response(
      JSON.stringify({ error: 'severity + title required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const webhook = webhookFor(payload.severity);
  if (!webhook) {
    // Configuration gap — silently succeed (don't block caller) but mark 503 for visibility.
    return new Response(
      JSON.stringify({ error: 'Webhook not configured for severity' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const discordPayload = {
    embeds: [
      {
        title: payload.title,
        description: payload.description,
        color: SEVERITY_COLOR[payload.severity],
        fields: [
          { name: 'Severity', value: payload.severity, inline: true },
          {
            name: 'Source',
            value: payload.source ?? 'unknown',
            inline: true,
          },
          ...(payload.fields ?? []),
        ],
        url: payload.url,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordPayload),
  });

  // For critical severity, also create a GitHub Issue for long-term tracking.
  if (payload.severity === 'critical') {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ??
      (req.headers.get('host')
        ? `https://${req.headers.get('host')}`
        : 'http://localhost:3000');
    await fetch(`${base}/api/alerts/create-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alert-signature': signature ?? '',
      },
      body: raw,
    }).catch(() => {
      // Non-fatal: issue creation failure shouldn't block Discord delivery.
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST = withObservability(handler, {
  route: '/api/alerts/discord-forward',
});
