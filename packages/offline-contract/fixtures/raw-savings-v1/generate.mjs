// Public fixtures only. Reuses raw evidence generation; never use this key/nonce for private data.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { identity, instant, recoveryKey, encode, digest, makeSource, makeReceipts } from '../raw-migration-v1/generate.mjs';
import { prepareRawMigration } from '../../../../scripts/offline/migrate-raw-evidence.mjs';
import { sealForTest } from '../../contract.mjs';
export function savingsRecords() {
  const base = { userId: identity.userId, name: 'Public observed savings', category: 'custom', targetAmount: 100, currentAmount: 0, monthlyContribution: 10, currency: 'CAD', status: 'active', isActive: true, priority: 'medium', startDate: '2026-01-01T03:00:00.000Z', targetDate: '2027-01-01', description: 'Recorded balance only; history unknown', emoji: '💰', createdAt: instant, updatedAt: instant };
  return [{ ...base, id: 'goal-normal', currentAmount: 12.34, progressPercentage: 0, onTrack: false, monthsToGoal: 999 },
    { ...base, id: 'goal-over-target', currentAmount: 125, status: 'achieved', achievedDate: '2026-09-13', lastContributionAt: instant, progressPercentage: 125, onTrack: true, monthsToGoal: 0 },
    { ...base, id: 'goal-zero', progressPercentage: 0, onTrack: true, monthsToGoal: null }];
}
export function fixtureOutputs() {
  const sourceBytes = encode(makeSource({ savings_goals_personal: savingsRecords() }));
  const receiptBytes = encode(makeReceipts(sourceBytes));
  const result = prepareRawMigration({ sourceBytes, receiptBytes, ...identity });
  if (!result.ready) throw new Error(JSON.stringify(result.report.issues));
  result.snapshot.snapshotId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const snapshotBytes = encode(result.snapshot), reportBytes = encode(result.report);
  const backupBytes = encode(sealForTest(result.snapshot, recoveryKey, Buffer.alloc(12, 0x61)));
  const files = { 'source.json': sourceBytes, 'report.json': reportBytes, 'positive.snapshot.json': snapshotBytes, 'positive.pennybackup': backupBytes };
  const manifest = { format: 'penny-raw-savings-fixtures-v1', publicFixtureOnly: true, recoveryKey,
    receiptEvidence: { recipe: 'raw-migration-v1/generate.mjs makeReceipts(sourceBytes)', sha256: digest(receiptBytes) },
    scope: { observedBalanceAtReadTime: instant, originalOpeningBalanceEstablished: false, historyCompletenessEstablished: false, fullAccountMigration: false, nativeAcceptanceEstablished: false },
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: digest(bytes) }])),
    expected: { snapshotId: result.snapshot.snapshotId, vaultId: result.snapshot.vaultId, createdAt: result.snapshot.createdAt,
      counts: Object.fromEntries(['expenses', 'attachments', 'budgets', 'incomeSources', 'incomeEntries', 'savingsGoals', 'savingsEntries', 'recurringExpenses'].map(k => [k, result.snapshot[k].length])),
      savingsMinor: 13734, receivedIncomeMinor: 0,
      goals: result.snapshot.savingsGoals.map(g => ({ id: g.id, openingMinor: g.openingMinor, targetMinor: g.targetMinor, startDate: g.startDate })),
      snapshotFile: 'positive.snapshot.json', backupFile: 'positive.pennybackup', nativeExpected: 'accept' } };
  return { ...files, 'fixture-manifest.json': encode(manifest) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  for (const [name, bytes] of Object.entries(fixtureOutputs())) {
    const path = new URL(name, import.meta.url);
    if (process.argv[2] === '--verify') { if (!readFileSync(path).equals(bytes)) throw new Error(`Stale fixture: ${name}`); }
    else writeFileSync(path, bytes);
  }
}
