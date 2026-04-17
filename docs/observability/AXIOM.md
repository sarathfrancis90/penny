# Axiom log shipping

Structured JSON logs are shipped to Axiom **directly from the Next.js runtime**
via HTTP POST (`src/lib/observability/axiomShip.ts`), not via Vercel Log Drains.

Rationale: Vercel Log Drains require **Pro plan ($20/mo/user)**. Direct
shipping from the runtime works on the free Hobby plan and gives us richer
context (request-scoped user id, duration, route) than parsing raw stdout.

## How it works

- `withObservability` wrapper fires `shipToAxiom({...})` fire-and-forget
  at each request's terminal log point (`request.end` or `request.error`).
- No worker threads, no pino transport — just an unawaited `fetch` that
  catches all failures silently.
- Cost: one HTTP POST per request, ~30-100ms latency, non-blocking.

## One-time setup (done)

1. Create account at https://app.axiom.co (workspace `pennyai-j75g`).
2. Create dataset `penny-web-prod` in the Axiom UI. All environments
   (production, preview, development) ship to this single dataset; entries
   are tagged with `env` for filtering.
3. Create **Ingest** token at Settings → API tokens → Add API token → scope:
   `Ingest` on `penny-web-prod`. Paste as `AXIOM_TOKEN` in Vercel.
4. `AXIOM_DATASET=penny-web-prod` set for all Vercel environments by
   `scripts/bootstrap-accounts.ts`.

_(The `penny-web-staging` dataset was created earlier — safe to delete, or
leave it empty at zero cost.)_

No Vercel Marketplace integration needed. No paid plan needed.

## Log shape

Each shipped record:

| Field | Meaning |
|---|---|
| `_time` | ISO timestamp set at ship time |
| `level` | `info`, `warn`, or `error` |
| `msg` | `request.end` or `request.error` |
| `service` | `penny-web` |
| `env` | `production` / `staging` / `preview` / `development` |
| `route` | e.g. `/api/healthz` |
| `request_id` | UUIDv4; matches `x-request-id` response header |
| `method` | GET/POST/... |
| `url` | full request URL |
| `status` | HTTP status returned |
| `duration_ms` | end-to-end wall time |
| `user_id` | Firebase uid if authenticated |
| `err` | `{ name, message, stack }` on `request.error` |

## Saved queries

Create in Axiom UI → dataset → **Queries**.

### Errors in the last hour

```
['penny-web-prod']
| where level == 'error'
| where _time > ago(1h)
| project _time, route, request_id, msg, err.message
| order by _time desc
```

### Slow routes (p95) in the last 24h

```
['penny-web-prod']
| where msg == 'request.end'
| summarize p95 = percentile(duration_ms, 95) by route
| order by p95 desc
```

### 5xx rate by 5-minute bucket

```
['penny-web-prod']
| where msg in ('request.end', 'request.error')
| extend is_5xx = status >= 500
| summarize total = count(), errors = countif(is_5xx) by bin(_time, 5m)
| extend error_rate = todouble(errors) / total
```

### User activity (parameterized)

```
['penny-web-prod']
| where user_id == '<uid>'
| where _time > ago(7d)
| project _time, route, msg, status, duration_ms
| order by _time desc
```

## Retention

Free tier: 30 days. Auto-pruned by Axiom.

## Alerts

Configure in Axiom UI → Monitors. See `docs/observability/ALERTS.md`.

## Fallback: Vercel runtime logs

Even without Axiom, pino writes JSON to stdout which Vercel captures for
1 hour on the Hobby plan. Useful for urgent debugging if Axiom is down.
