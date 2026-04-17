#!/usr/bin/env tsx
/**
 * One-off script to register BetterStack monitors.
 * Run: `BETTERSTACK_API_KEY=... npx tsx scripts/bootstrap-uptime.ts`
 *
 * Safe to re-run: BetterStack API is idempotent by URL; duplicates return 422.
 */

const TOKEN = process.env.BETTERSTACK_API_KEY;
const BASE = 'https://uptime.betterstack.com/api/v2/monitors';
const PROD_URL = process.env.PROD_URL ?? 'https://penny.app';
const STAGING_URL = process.env.STAGING_URL ?? 'https://staging.penny.app';

if (!TOKEN) {
  console.error('BETTERSTACK_API_KEY env var required');
  process.exit(1);
}

interface MonitorConfig {
  monitor_type: 'status' | 'expected_status_code' | 'keyword';
  url: string;
  pronounceable_name: string;
  check_frequency: number; // seconds
  request_method?: 'GET' | 'HEAD' | 'POST';
  expected_status_codes?: number[];
}

const monitors: MonitorConfig[] = [
  {
    monitor_type: 'status',
    url: `${PROD_URL}/api/healthz`,
    pronounceable_name: 'prod-api-healthz',
    check_frequency: 180, // 3 minutes
  },
  {
    monitor_type: 'expected_status_code',
    url: PROD_URL,
    pronounceable_name: 'prod-web-home',
    check_frequency: 180,
    expected_status_codes: [200, 304],
  },
  {
    monitor_type: 'status',
    url: `${STAGING_URL}/api/healthz`,
    pronounceable_name: 'staging-api-healthz',
    check_frequency: 300, // 5 minutes — more lenient on staging
  },
];

async function upsertMonitor(config: MonitorConfig) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  let ok = 0;
  let existed = 0;
  let failed = 0;
  for (const m of monitors) {
    const { status, body } = await upsertMonitor(m);
    if (status === 201) {
      console.log(`✓ created: ${m.pronounceable_name}`);
      ok++;
    } else if (status === 422) {
      console.log(`· exists:  ${m.pronounceable_name}`);
      existed++;
    } else {
      console.error(
        `✗ failed:  ${m.pronounceable_name} (${status}) ${JSON.stringify(body)}`,
      );
      failed++;
    }
  }
  console.log(`\nSummary: created ${ok} · existing ${existed} · failed ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
