// A synthetic reference benchmark. It does not measure native storage or devices.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { categories, limits, sealBackup, openBackup, validateSnapshot } from '../../packages/offline-contract/contract.mjs';
import { monthlyReport, expenseCSV } from '../../packages/offline-contract/finance.mjs';

const fixture = JSON.parse(readFileSync(new URL('../../packages/offline-contract/fixtures/snapshot-v3.json', import.meta.url)));
const key = `pny1-${'03'.repeat(32)}`; // Public synthetic benchmark key; never used by an app.
const id = n => `a0000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
function corpus(count) {
  return {
    ...fixture, attachments: [], budgets: [], incomeSources: [], incomeEntries: [],
    savingsGoals: [], savingsEntries: [], recurringExpenses: [],
    expenses: Array.from({ length: count }, (_, i) => ({
      ...fixture.expenses[0], id: id(i), merchant: `Synthetic merchant ${i % 193}`,
      amountMinor: 1 + i % 100000, expenseDate: `2026-${String(1 + i % 12).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}`,
      category: categories[i % categories.length], description: 'Synthetic benchmark record',
      note: 'A synthetic note to include ordinary UTF-8 content. Café Toronto. '.repeat(2),
    })),
  };
}
function measure(action, rounds = 5) {
  const samples = [];
  let value;
  for (let i = 0; i < rounds; i++) {
    const start = performance.now(); value = action(); samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { value, timing: { rounds, medianMs: Number(samples[Math.floor(rounds / 2)].toFixed(2)), maxMs: Number(samples.at(-1).toFixed(2)) } };
}

const results = [];
for (const count of [1000, 10000]) {
  const snapshot = corpus(count);
  const validation = measure(() => validateSnapshot(snapshot));
  const sealed = measure(() => Buffer.from(JSON.stringify(sealBackup(snapshot, key))));
  const opened = measure(() => openBackup(sealed.value, key));
  assert.deepEqual(opened.value, snapshot);
  const report = measure(() => monthlyReport(snapshot, '2026-09'));
  const csv = measure(() => expenseCSV(snapshot));
  results.push({ count, receipts: 0, plaintextBytes: Buffer.byteLength(JSON.stringify(snapshot)),
    envelopeBytes: sealed.value.length, csvBytes: Buffer.byteLength(csv.value),
    timings: { validate: validation.timing, seal: sealed.timing, open: opened.timing, report: report.timing, csv: csv.timing } });
}
let largerCorpusRejection;
try { validateSnapshot(corpus(50000)); largerCorpusRejection = 'unexpectedly accepted'; }
catch (error) { largerCorpusRejection = error.message; }
assert.equal(largerCorpusRejection, 'expense_limit');

console.log(JSON.stringify({
  recordedAt: new Date().toISOString(), scope: 'Node reference on host; no native persistence, receipts, battery or physical device measurement',
  environment: { node: process.version, platform: platform(), osRelease: release(), cpu: cpus()[0]?.model },
  peakRssKiB: process.resourceUsage().maxRSS, results,
  limits: { ...limits }, fiftyThousandExpenses: { state: 'unsupported', rejection: largerCorpusRejection },
}, null, 2));
