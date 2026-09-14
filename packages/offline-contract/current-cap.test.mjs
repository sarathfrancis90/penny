import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSnapshot } from './contract.mjs';
import { currentCapBase, currentCapSnapshot } from './current-cap.mjs';

test('combined current-cap workload preserves nonempty finance and exact receipt boundaries', () => {
  const plan = JSON.parse(readFileSync(new URL('workload.json', currentCapBase)));
  const snapshot = currentCapSnapshot(plan);
  const original = JSON.parse(readFileSync(new URL(plan.sourceSnapshot, currentCapBase)));
  validateSnapshot(snapshot);
  assert.equal(snapshot.expenses.length, 10000);
  assert.equal(snapshot.attachments.length, 100);
  assert.equal(snapshot.attachments.reduce((n, row) => n + row.byteCount, 0), 8 * 1024 * 1024);
  assert.equal(Math.max(...snapshot.attachments.map(row => row.byteCount)), 2 * 1024 * 1024);
  assert.equal(snapshot.expenses.reduce((n, row) => n + row.amountMinor, 0), plan.expectedExpenseTotalMinor);
  for (const domain of plan.preservedFinanceDomains) {
    assert.ok(snapshot[domain].length > 0, domain);
    assert.deepEqual(snapshot[domain], original[domain]);
  }
  assert.deepEqual(snapshot.expenses.slice(0, original.expenses.length), original.expenses);
  for (const row of snapshot.attachments) {
    assert.equal(row.sha256, plan.receiptSha256ByLength[row.byteCount]);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 15 * 1024 * 1024);
  assert.throws(() => validateSnapshot({ ...snapshot, attachments: [...snapshot.attachments, snapshot.attachments[0]] }));
});
