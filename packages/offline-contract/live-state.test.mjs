import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSnapshot } from './contract.mjs';

test('live-state edit golden keeps the original owned receipt and every other domain', () => {
  const base = new URL('./fixtures/live-state-v1/', import.meta.url);
  const fixture = JSON.parse(readFileSync(new URL('metadata-edit.json', base)));
  const source = readFileSync(new URL(fixture.sourceSnapshot, base));
  const backup = readFileSync(new URL(fixture.sourceBackup, base));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(source), fixture.sourceSnapshotSha256);
  assert.equal(hash(backup), fixture.sourceBackupSha256);
  const original = JSON.parse(source);
  validateSnapshot(original);
  assert.deepEqual(original.expenses.find(row => row.id === fixture.expenseBefore.id), fixture.expenseBefore);
  assert.equal(fixture.expenseAfter.id, fixture.expenseBefore.id);
  const edited = { ...original, expenses: original.expenses.map(row => row.id === fixture.expenseAfter.id ? fixture.expenseAfter : row) };
  validateSnapshot(edited);
  assert.equal(edited.expenses.reduce((sum, row) => sum + row.amountMinor, 0), fixture.expectedExpenseTotalMinor);
  assert.equal(edited.expenses.filter(row => row.expenseDate.startsWith('2026-01')).reduce((sum, row) => sum + row.amountMinor, 0), fixture.expectedJanuaryExpenseTotalMinor);
  const receipt = edited.attachments.find(row => row.id === fixture.receipt.id);
  assert.equal(receipt.expenseId, fixture.expenseAfter.id);
  const { dataBase64, ...descriptor } = receipt;
  assert.deepEqual(descriptor, fixture.receipt);
  assert.equal(hash(Buffer.from(dataBase64, 'base64')), fixture.receipt.sha256);
  for (const domain of fixture.preservedDomains) assert.deepEqual(edited[domain], original[domain]);
});
