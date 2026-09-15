import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSnapshot } from '../../packages/offline-contract/contract.mjs';

const base = new URL('../../packages/offline-contract/fixtures/v4-native-writer-v1/', import.meta.url);
const read = name => readFileSync(new URL(name, base));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('captured native writer fixtures retain their exact ciphertext and expected financial records', () => {
  for (const platform of ['android', 'ios']) {
    const provenance = JSON.parse(read(`${platform}-provenance.json`));
    assert.equal(provenance.file, `${platform}-finance.pennybackup`);
    assert.equal(provenance.snapshotFile, `${platform}-finance.snapshot.json`);
    assert.equal(provenance.recoveryKey, `pny1-${'07'.repeat(32)}`);
    const ciphertext = read(provenance.file), expected = read(provenance.snapshotFile);
    assert.equal(ciphertext.subarray(0, 8).toString(), 'PNYBKP4\n');
    assert.equal(ciphertext.length, provenance.ciphertextBytes);
    assert.equal(hash(ciphertext), provenance.ciphertextSha256);
    assert.equal(hash(expected), provenance.snapshotSha256);
    const snapshot = JSON.parse(expected);
    validateSnapshot(snapshot);
    for (const name of ['expenses', 'attachments', 'budgets', 'incomeSources', 'incomeEntries', 'savingsGoals', 'savingsEntries', 'recurringExpenses']) {
      assert.ok(snapshot[name].length > 0, `${platform} ${name}`);
    }
    for (const receipt of snapshot.attachments) {
      const bytes = Buffer.from(receipt.dataBase64, 'base64');
      assert.equal(bytes.length, receipt.byteCount); assert.equal(hash(bytes), receipt.sha256);
    }
  }
});
