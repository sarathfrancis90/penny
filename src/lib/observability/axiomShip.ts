import { isObservabilityEnabled, getObservabilityEnv } from './env';

export interface AxiomLogEntry {
  _time: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
  route?: string;
  request_id?: string;
  duration_ms?: number;
  status?: number;
  user_id?: string;
  method?: string;
  url?: string;
  env?: string;
  service?: string;
  err?: unknown;
  [key: string]: unknown;
}

function getConfig(): { token: string; dataset: string; endpoint: string } | null {
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;
  if (!token || !dataset) return null;
  // Global ingest endpoint — routes to the correct region based on the token.
  // For EU-region workspaces, set AXIOM_ENDPOINT=https://api.eu.axiom.co/v1/datasets.
  const base = process.env.AXIOM_ENDPOINT ?? 'https://api.axiom.co';
  return {
    token,
    dataset,
    endpoint: `${base}/v1/datasets/${dataset}/ingest`,
  };
}

/**
 * Ship a single log entry to Axiom. Fire-and-forget — never blocks caller,
 * never throws. Safe to call on every request without awaiting.
 *
 * Kill switch: no-op if OBSERVABILITY_ENABLED != true or AXIOM_TOKEN/DATASET missing.
 */
export function shipToAxiom(entry: AxiomLogEntry): void {
  if (!isObservabilityEnabled()) return;
  const config = getConfig();
  if (!config) return;

  const enriched = {
    ...entry,
    env: entry.env ?? getObservabilityEnv(),
    service: entry.service ?? 'penny-web',
  };

  // Intentionally not awaited; body is an array because the Axiom ingest
  // endpoint accepts either a single object or an array.
  fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([enriched]),
  }).catch(() => {
    // Silent: observability failures must never surface to the user.
  });
}
