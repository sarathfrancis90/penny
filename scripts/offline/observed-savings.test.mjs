import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareRawMigration } from './migrate-raw-evidence.mjs';
import { convertObservedSavings } from './migrate-observed-savings.mjs';
import { openBackup } from '../../packages/offline-contract/contract.mjs';
import { identity, recoveryKey, instant, encode, digest, makeSource, makeReceipts } from '../../packages/offline-contract/fixtures/raw-migration-v1/generate.mjs';
import { savingsRecords, fixtureOutputs } from '../../packages/offline-contract/fixtures/raw-savings-v1/generate.mjs';
const base = new URL('../../packages/offline-contract/fixtures/raw-savings-v1/', import.meta.url);
function convert(records = savingsRecords(), extra = {}) {
  const sourceBytes = encode(makeSource({ savings_goals_personal: records, ...extra }));
  return prepareRawMigration({ sourceBytes, receiptBytes: encode(makeReceipts(sourceBytes)), ...identity });
}
test('observed savings golden is deterministic, encrypted and exactly reconciled without invented history', () => {
  for (const [file, bytes] of Object.entries(fixtureOutputs())) assert.deepEqual(readFileSync(new URL(file, base)), bytes, file);
  const result = convert(); assert.equal(result.ready, true, JSON.stringify(result.report.issues));
  const manifest = JSON.parse(readFileSync(new URL('fixture-manifest.json', base)));
  for (const [file, entry] of Object.entries(manifest.files)) { const b = readFileSync(new URL(file, base)); assert.equal(b.length, entry.bytes); assert.equal(digest(b), entry.sha256); }
  const snapshot = openBackup(readFileSync(new URL('positive.pennybackup', base)), recoveryKey);
  assert.deepEqual(snapshot, JSON.parse(readFileSync(new URL('positive.snapshot.json', base))));
  assert.deepEqual(snapshot.savingsGoals.map(g => g.openingMinor), [1234, 12500, 0]);
  assert.equal(snapshot.savingsGoals[0].startDate, '2025-12-31');
  assert.equal(snapshot.savingsGoals[1].lastContributionAt, instant);
  assert.equal(snapshot.savingsEntries.length, 0); assert.equal(snapshot.incomeEntries.length, 0);
  assert.equal(result.report.reconciliation.savingsMinor, 13734);
  assert.equal(result.report.scope.historyCompletenessEstablished, false); assert.equal(result.report.scope.fullAccountMigration, false);
  assert.equal(result.report.observedSavings.originalOpeningBalanceEstablished, false);
  assert.deepEqual(result.report.observedSavings.mappings.map(m => m.originalRecord), savingsRecords());
  assert.equal(result.report.observedSavings.mappings[1].originalRecord.progressPercentage, 125);
  assert.equal(result.report.sourceCounts.savings_goals_personal, 3); assert.equal(result.report.sourceCounts.savings_contributions, 0);
});
test('savings field, money, date, owner, cache and capacity defects cannot produce a candidate', () => {
  const mutations = [{ currentAmount: -1 }, { currentAmount: 0.001 }, { currentAmount: '1' }, { targetAmount: 0 }, { monthlyContribution: -1 }, { currency: 'USD' }, { currency: null }, { unknown: 1 }, { groupId: 'g' }, { userId: 'foreign' }, { category: 'bad' }, { status: 'bad' }, { isActive: 1 }, { priority: 'bad' }, { startDate: '2026-02-30' }, { targetDate: '2024-01-01' }, { achievedDate: 'bad' }, { updatedAt: '2026-01-01T00:00:00.000Z' }, { lastContributionAt: '2026-09-13T12:00:00.000001Z' }, { onTrack: 'true' }, { progressPercentage: '125' }, { monthsToGoal: -1 }, { monthsToGoal: 1.5 }];
  for (const change of mutations) { const r = convert([{ ...savingsRecords()[0], ...change }]); assert.equal(r.ready, false, JSON.stringify(change)); assert.equal(r.snapshot, null); }
  for (const field of ['currency', 'startDate', 'createdAt', 'status']) { const goal = savingsRecords()[0]; delete goal[field]; assert.equal(convert([goal]).ready, false, field); }
  const goals = Array.from({ length: 1001 }, (_, i) => ({ ...savingsRecords()[0], id: `g${i}` })); assert.equal(convert(goals).ready, false);
  const goal = savingsRecords()[0]; assert.equal(convertObservedSavings([goal, goal], { ...identity, readTime: instant }).issues.length, 1);
});
test('all contribution and monthly/group history still blocks even for valid observed goals', () => {
  for (const domain of ['savings_contributions', 'monthly_income_records', 'monthly_savings_summary', 'budget_allocation_history', 'monthly_setup_status', 'groupMembers']) {
    const result = convert(savingsRecords(), { [domain]: [{ id: 'history', userId: identity.userId }] });
    assert.equal(result.ready, false, domain); assert.equal(result.snapshot, null);
    assert.ok(result.report.issues.some(i => i.domain === domain));
  }
});
