# Axiom log drain

Structured JSON logs emitted by `src/lib/observability/logger.ts` are shipped to
Axiom via Vercel's native log drain integration. No code required — Axiom reads
the Vercel runtime log firehose directly.

## One-time setup (user action, Phase 0.11)

1. Vercel Dashboard → `penny` project → Integrations → Browse marketplace → Axiom.
2. Install the integration.
3. Select datasets:
   - `penny-web-prod` for Production environment
   - `penny-web-staging` for Preview environment
4. No redeploy needed; new runtime logs route automatically on next request.

## Log shape

Every log line is a single JSON object. Fields emitted:

| Field | Meaning |
|---|---|
| `level` | pino level: `info`, `warn`, `error` |
| `time` | epoch ms |
| `env` | `production`, `staging`, `preview`, `development` |
| `service` | always `penny-web` |
| `route` | e.g. `/api/healthz` |
| `request_id` | UUIDv4, matches `x-request-id` response header |
| `msg` | message string |
| `duration_ms` | present on `request.end` and `request.error` |
| `err` | present on `request.error` with serialized error |
| (scoped context) | e.g. `userId`, `groupId` when attached via `logger.child()` |

Redacted paths (censored as `[redacted]`): `*.password`, `*.token`, `*.secret`,
`req.headers.authorization`, `req.headers.cookie`, `amount`, `vendor`.

## Saved queries

Create in Axiom UI → Datasets → `penny-web-prod` → Queries → Save.

### Errors in the last hour

```
['penny-web-prod']
| where level == 'error'
| where _time > ago(1h)
| project _time, route, request_id, msg, err.message
```

### Slow routes (p95) in the last 24h

```
['penny-web-prod']
| where msg == 'request.end'
| summarize p95 = percentile(duration_ms, 95) by route
| order by p95 desc
```

### User activity

Parameterized query, replace `<uid>`:

```
['penny-web-prod']
| where user_id == '<uid>'
| where _time > ago(7d)
| project _time, route, msg, duration_ms
| order by _time desc
```

### 5xx rate trend

```
['penny-web-prod']
| where msg == 'request.end'
| extend is_5xx = status >= 500
| summarize total = count(), errors = countif(is_5xx) by bin(_time, 5m)
| extend error_rate = todouble(errors) / total
```

## Retention

Free tier: 30 days automatic.

## Alerts

See `docs/observability/ALERTS.md` for the rules wired from Axiom → Discord.
