# Alert rules

Sentry + PostHog + Axiom + BetterStack send webhooks to `/api/alerts/discord-forward`
which fans out to Discord (always) and GitHub Issues (critical only).

## Webhook endpoint

**URL:** `https://penny.app/api/alerts/discord-forward`
**Method:** POST
**Content-Type:** application/json
**Auth:** HMAC-SHA256 signature in `x-alert-signature` header.

Payload:

```json
{
  "severity": "critical | warning | info",
  "title": "string (required)",
  "description": "string (optional)",
  "source": "string (optional — e.g. 'sentry', 'axiom')",
  "url": "string (optional — link back to the alert source)",
  "fields": [{ "name": "string", "value": "string", "inline": true }]
}
```

Compute signature:

```
hmac-sha256(payload-raw-bytes, ALERT_FORWARD_SECRET) → hex
```

### Wiring a custom vendor

Most vendors let you paste a webhook URL and a custom HTTP header. Paste the
shared secret into `x-alert-signature`. For Sentry (which doesn't support
custom HMAC payload signing natively), run alerts through Sentry → webhook
URL of your own proxy, OR rely on Sentry's own IP allowlist + ALERT_FORWARD_SECRET
as a bearer-token fallback (security trade-off — use only from Sentry).

## Sentry rules

Configure in Sentry UI → Alerts → Create Alert Rule.

| Rule | Condition | Severity | Channel |
|---|---|---|---|
| New issue in prod | New issue created (any level) | `warning` | `#alerts-warning` |
| Issue regression | Issue reopens | `critical` | `#alerts-critical` + GH issue |
| Error rate spike | Error rate > 5% over 1h | `critical` | `#alerts-critical` + GH issue |
| Quota ceiling | Free tier quota > 80% | `warning` | `#alerts-warning` + email |
| Transaction slow | P95 duration > 5s on critical routes | `warning` | `#alerts-warning` |

## PostHog rules

Configure in PostHog UI → Alerts.

| Rule | Condition | Severity |
|---|---|---|
| DAU drop | DAU drops > 30% week-over-week | `warning` |
| Conversion drop | Critical funnel step drops > 20% | `warning` |
| Session replay storage | >80% of free quota | `warning` |

## Axiom rules

Configure in Axiom UI → Monitors.

| Rule | Query | Severity |
|---|---|---|
| 5xx rate | 5xx rate on `/api/*` > 1% over 5min | `critical` |
| Slow requests | P95 duration > 3000ms over 5min | `warning` |
| Error log burst | >50 `level=error` logs in 1min | `warning` |

## BetterStack rules

Configure in BetterStack UI → Monitors. On each monitor's "Down" event, send
webhook with severity=critical.

## Quiet hours

01:00–07:00 America/Toronto for `warning` and `info`. `critical` alerts bypass
quiet hours. Configure per vendor:

- **Sentry:** Alert rule → "Send notifications between" schedule.
- **PostHog:** Alert → Advanced → Quiet hours.
- **Axiom:** Monitor → Notification channels → Schedule.
- **BetterStack:** Escalation policy with time-window steps.

## Rollback

Set `OBSERVABILITY_ENABLED=false` in Vercel env. Alerts will continue to flow
from third-party vendors but `/api/alerts/discord-forward` will still function
(observability kill switch doesn't affect the forwarder). If alert noise is
the problem, disable alert rules at the vendor UI instead.
