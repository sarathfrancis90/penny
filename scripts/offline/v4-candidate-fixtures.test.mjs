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
