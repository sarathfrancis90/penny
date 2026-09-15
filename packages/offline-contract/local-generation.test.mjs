import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSnapshot } from './contract.mjs';

const directory = new URL('./fixtures/local-generation-v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('lifecycle.json', directory)));

test('local-generation native inputs remain valid complete snapshots with exact hashes', () => {
  const snapshots = Object.entries(manifest.files).map(([name, expected]) => {
    const bytes = readFileSync(new URL(name, directory));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
    const snapshot = JSON.parse(bytes);
    validateSnapshot(snapshot);
    assert.equal(snapshot.expenses.length, expected.expenseCount);
    assert.equal(snapshot.expenses.reduce((sum, row) => sum + row.amountMinor, 0), expected.expenseTotalMinor);
    assert.equal(snapshot.attachments.length, expected.attachmentCount);
    return snapshot;
  });
  const [previous, replacement] = snapshots;
  assert.notEqual(previous.vaultId, replacement.vaultId);
  assert.notEqual(previous.snapshotId, replacement.snapshotId);
  assert.notEqual(previous.attachments[0].id, replacement.attachments[0].id);
  assert.equal(previous.attachments[0].dataBase64, replacement.attachments[0].dataBase64);
  for (const domain of ['budgets', 'incomeSources', 'incomeEntries', 'savingsGoals', 'savingsEntries', 'recurringExpenses']) {
    assert.ok(previous[domain].length > 0);
    assert.deepEqual(previous[domain], replacement[domain]);
  }
  // Native implementations consume these inputs and execute the actual failures.
  // This check deliberately makes no simulated filesystem/transaction claim.
});
