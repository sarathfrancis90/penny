import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const base = new URL('../../packages/offline-contract/fixtures/v4-candidate-v1/', import.meta.url);
test('v4 candidate acceptance pins existing corpora and resolves selected cases', () => {
  const manifest = JSON.parse(readFileSync(new URL('acceptance.json', base)));
  assert.equal(manifest.status, 'required_unproven');
  const ids = manifest.requiredScenarios.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length > 0);
  const refs = {};
  for (const ref of manifest.references) {
    const bytes = readFileSync(new URL(ref.path, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256);
    refs[ref.role] = JSON.parse(bytes);
  }
  for (const name of manifest.encryptedPositives) {
    const item = refs.frames.positives.find(p => p.name === name);
    assert.ok(item);
    const bytes = readFileSync(new URL(`../v4-frames/${item.file}`, base));
    assert.equal(bytes.length, item.ciphertextBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.ciphertextSha256);
  }
  for (const name of [...manifest.logicalPositives, manifest.currentCapNegative]) {
    assert.ok(refs.logical.positives.some(p => p.name === name));
  }
  for (const name of manifest.logicalNegatives) assert.ok(refs.logical.negatives.some(p => p.name === name));
  assert.equal(refs.nativeImage.cases.find(c => c.id === manifest.nativeImageCase)?.valid, false);
  assert.equal(refs.candidate.assertionRevision, 2);
});

test('v4 repair acceptance pins both captured native writers and exact expected records', () => {
  const repairBase = new URL('../../packages/offline-contract/fixtures/v4-repair-v1/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('acceptance.json', repairBase)));
  assert.equal(manifest.status, 'required_unproven');
  assert.equal(new Set(manifest.requiredScenarios.map(s => s.id)).size, manifest.requiredScenarios.length);
  assert.deepEqual(manifest.fixtures.map(f => f.producer).sort(), ['android', 'ios']);
  for (const fixture of manifest.fixtures) {
    const archive = readFileSync(new URL(fixture.archive, repairBase));
    const raw = readFileSync(new URL(fixture.snapshot, repairBase));
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(archive), fixture.archiveSha256);
    assert.equal(archive.length, fixture.archiveBytes);
    assert.equal(archive.subarray(0, 8).toString(), 'PNYBKP4\n');
    assert.equal(hash(raw), fixture.snapshotSha256);
    const snapshot = JSON.parse(raw);
    for (const [domain, count] of Object.entries(fixture.expectedCounts)) assert.equal(snapshot[domain].length, count);
    assert.equal(snapshot.expenses.reduce((sum, e) => sum + e.amountMinor, 0), fixture.expectedExpenseTotalMinor);
    assert.equal(snapshot.attachments.reduce((sum, r) => sum + r.byteCount, 0), fixture.expectedReceiptBytes);
    for (const receipt of snapshot.attachments) {
      const bytes = Buffer.from(receipt.dataBase64, 'base64');
      assert.equal(bytes.length, receipt.byteCount);
      assert.equal(hash(bytes), receipt.sha256);
      assert.ok(snapshot.expenses.some(e => e.id === receipt.expenseId));
    }
    const provenance = JSON.parse(readFileSync(new URL(`../v4-native-writer-v1/${fixture.producer}-provenance.json`, repairBase)));
    assert.equal(fixture.recoveryKey, provenance.recoveryKey);
    assert.equal(fixture.archiveSha256, provenance.ciphertextSha256);
    assert.equal(fixture.snapshotSha256, provenance.snapshotSha256);
  }
});
