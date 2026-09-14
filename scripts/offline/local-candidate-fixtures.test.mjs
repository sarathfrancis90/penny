import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSnapshot } from '../../packages/offline-contract/contract.mjs';

const base = new URL('../../packages/offline-contract/fixtures/local-candidate-v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('acceptance.json', base)));
test('inactive candidate acceptance references exact existing goldens and unique scenario IDs', () => {
  assert.equal(manifest.status, 'required_unproven');
  const ids = manifest.requiredScenarios.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const scenario of manifest.requiredScenarios) {
    assert.ok(['preparation', 'installation_if_wired'].includes(scenario.stage));
    assert.ok(scenario.trigger.length > 0 && scenario.requiredOutcome.length > 0);
  }
  for (const [role, ref] of Object.entries(manifest.files)) {
    assert.equal(ref.path, `../local-generation-v1/${role}.json`);
    const bytes = readFileSync(new URL(ref.path, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256);
    const snapshot = validateSnapshot(JSON.parse(bytes));
    assert.equal(snapshot.vaultId, ref.vaultId); assert.equal(snapshot.snapshotId, ref.snapshotId);
    for (const [domain, count] of Object.entries(ref.counts)) assert.equal(snapshot[domain].length, count);
    assert.equal(snapshot.expenses.reduce((n, e) => n + e.amountMinor, 0), ref.expenseTotalMinor);
    assert.deepEqual(snapshot.attachments.map(({ dataBase64, ...descriptor }) => {
      const raw = Buffer.from(dataBase64, 'base64');
      assert.equal(raw.length, descriptor.byteCount);
      assert.equal(createHash('sha256').update(raw).digest('hex'), descriptor.sha256);
      return descriptor;
    }), ref.receipts);
  }
  const corpus = JSON.parse(readFileSync(new URL(manifest.invalidImageReference.path, base)));
  assert.equal(corpus.cases.find(c => c.id === manifest.invalidImageReference.caseId)?.valid, false);
});
