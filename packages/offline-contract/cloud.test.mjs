import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBackup, sealBackup } from './contract.mjs';
import { accountTag, cloudLimits, collectManifestCandidates, manifestHistory, openListedManifest, openManifest, remoteNames, sealManifest, sealManifestForTest, sha256, validateManifest, vaultTag, verifyReferencedSnapshot } from './cloud-manifest.mjs';
import { advancePublication, beginPublication, publicationEffect, publicationPhases, publicationStatus } from './cloud-publication.mjs';
const file = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const read = name => JSON.parse(file(name));
const manifest = read('cloud-manifest-v1.json'), vector = read('cloud-golden-vector-v1.json');
const key = vector.recoveryKey, bytes = file('cloud-snapshot-v1.pennybackup'), encoded = value => Buffer.from(JSON.stringify(value));
const envelope = read('cloud-manifest-v1.pennymanifest'), manifestBytes = encoded(envelope);
const binding = { provider: manifest.provider, accountTag: manifest.accountTag, vaultTag: manifest.vaultTag };
const context = { ...binding, sessionEpoch: 1, localRevision: 42, cancelled: false };
const operationId = '456789ab-4567-4567-8567-456789abcdef';
const start = () => beginPublication({ operationId, manifest, manifestBytes, snapshotBytes: bytes, recoveryText: key, context });
const event = state => ({ operationId, kind: 'completed', phase: state.phase, bytes: state.phase === 'snapshotDownload' ? bytes : manifestBytes, manifestBytes, createdAt: manifest.createdAt, verifiedAt: state.phase === 'snapshotDownload' ? manifest.verifiedAt : '2026-09-13T12:05:02.000Z' });
const move = (state, ctx = context) => advancePublication(state, event(state), ctx, key);

test('independent cloud crypto and tag vectors authenticate portable snapshot on clean install', () => {
  assert.equal(accountTag(vector.accountInput.provider, vector.accountInput.opaqueIdentity), vector.expectedAccountTag);
  assert.equal(vaultTag(vector.vaultId), vector.expectedVaultTag);
  assert.deepEqual(sealManifestForTest(manifest, key, Buffer.from(vector.nonceHex, 'hex')), envelope);
  assert.equal(JSON.stringify(manifest), vector.plaintextUtf8);
  const cleanBinding = { provider: binding.provider, accountTag: binding.accountTag };
  assert.deepEqual(openManifest(manifestBytes, key, cleanBinding), manifest);
  assert.deepEqual(openListedManifest({ name: remoteNames(manifest).manifest }, manifestBytes, key, cleanBinding), manifest);
  assert.throws(() => openListedManifest({ name: 'manifest-other.pennymanifest' }, manifestBytes, key, cleanBinding));
  assert.deepEqual(verifyReferencedSnapshot(bytes, key, manifest), read('snapshot-v3.json'));
  assert.notEqual(sealManifest(manifest, key).nonce, sealManifest(manifest, key).nonce);
  assert.throws(() => openBackup(manifestBytes, key));
  assert.throws(() => openManifest(bytes, key, binding));
});
test('captured native cloud manifests authenticate complete portable snapshots without build dependencies', () => {
  const provenance = read('native-exports/cloud-provenance.json');
  assert.deepEqual(provenance.exports.map(entry => entry.platform).toSorted(), ['android', 'ios']);
  for (const entry of provenance.exports) {
    assert.equal(entry.remoteProviderVerified, false);
    const manifestBytes = file(`native-exports/${entry.manifest.file}`);
    const snapshotBytes = file(`native-exports/${entry.snapshot.file}`);
    for (const [descriptor, bytes] of [[entry.manifest, manifestBytes], [entry.snapshot, snapshotBytes]]) {
      assert.equal(bytes.length, descriptor.byteCount);
      assert.equal(sha256(bytes), descriptor.sha256);
    }
    const key = read(`native-exports/${entry.testKeyReference}`).recoveryKey;
    const manifest = openManifest(manifestBytes, key, {
      provider: entry.provider, accountTag: accountTag(entry.provider, entry.opaqueIdentity),
    });
    const actual = verifyReferencedSnapshot(snapshotBytes, key, manifest);
    const expected = read(`native-exports/${entry.expectedSnapshot}`);
    assert.equal(actual.vaultId, expected.vaultId);
    assert.equal(actual.schemaVersion, expected.schemaVersion);
    const byID = rows => rows.toSorted((a, b) => a.id.localeCompare(b.id));
    for (const field of Object.keys(expected).filter(field => Array.isArray(expected[field]))) {
      assert.deepEqual(byID(actual[field]), byID(expected[field]), `${entry.platform}: ${field}`);
    }
  }
});
test('closed manifest and descriptor corpus rejects unsupported and ambiguous data', () => {
  const corpus = read('cloud-conformance-v1.json');
  for (const entry of corpus.manifestMutations) assert.throws(() => validateManifest({ ...manifest, [entry.field]: entry.value }), entry.name);
  for (const entry of corpus.descriptorMutations) assert.throws(() => validateManifest({ ...manifest, snapshot: { ...manifest.snapshot, [entry.field]: entry.value } }), entry.name);
  for (const name of Object.keys(manifest)) { const value = structuredClone(manifest); delete value[name]; assert.throws(() => validateManifest(value)); }
  for (const other of [{ ...binding, accountTag: '0'.repeat(64) }, { ...binding, vaultTag: '0'.repeat(64) }, { ...binding, provider: 'icloud' }]) assert.throws(() => openManifest(manifestBytes, key, other));
});
test('manifest size strict JSON canonical encoding and authentication fail closed', () => {
  assert.throws(() => openManifest(Buffer.alloc(cloudLimits.envelopeBytes + 1), key, binding));
  assert.throws(() => openManifest(Buffer.from('{"formatVersion":1,"formatVersion":1}'), key, binding));
  for (const field of ['nonce', 'tag', 'ciphertext']) {
    const value = { ...envelope, [field]: 'A' + envelope[field].slice(1) };
    assert.throws(() => openManifest(encoded(value), key, binding));
  }
  assert.throws(() => openManifest(manifestBytes, 'pny1-' + '00'.repeat(32), binding));
  assert.throws(() => openManifest(encoded({ ...envelope, ciphertext: 'A'.repeat(12000) }), key, binding));
  assert.throws(() => openManifest(encoded({ ...envelope, tag: envelope.tag.replaceAll('=', '') }), key, binding));
});
test('snapshot reference verification enforces byte count digest authentication and identities', () => {
  assert.throws(() => verifyReferencedSnapshot(bytes.subarray(1), key, manifest));
  const corrupt = Buffer.from(bytes); corrupt[100] ^= 1;
  assert.throws(() => verifyReferencedSnapshot(corrupt, key, manifest));
  assert.throws(() => verifyReferencedSnapshot(corrupt, key, { ...manifest, snapshot: { ...manifest.snapshot, sha256: sha256(corrupt) } }));
  for (const patch of [{ snapshotId: operationId }, { snapshotSchemaVersion: 2 }, { createdAt: '2026-09-13T12:00:00.000Z' }]) assert.throws(() => verifyReferencedSnapshot(bytes, key, { ...manifest, snapshot: { ...manifest.snapshot, ...patch } }));
  assert.throws(() => verifyReferencedSnapshot(bytes, key, { ...manifest, vaultTag: '0'.repeat(64) }));
});
test('publication requires ordered remote snapshot and exact manifest readback before last-good changes', () => {
  let state = start(); const before = structuredClone(state);
  for (const phase of publicationPhases) {
    assert.equal(state.phase, phase); assert.equal(state.lastGood, null);
    assert.equal(publicationEffect(state, context).immutable, true);
    state = move(state);
  }
  assert.deepEqual(start(), before); assert.deepEqual(state.lastGood, manifest);
  assert.equal(publicationStatus(state, context).currentVaultVerified, true);
  assert.equal(publicationEffect(state, context), null);
  assert.equal(publicationStatus(state, { ...context, localRevision: 43 }).pendingChanges, true);
});
test('account switch cancellation and provider failures at every await preserve the prior verified manifest', () => {
  const previous = { ...manifest, manifestId: operationId, localRevision: 41 };
  const nextManifest = { ...manifest, previousManifestId: previous.manifestId };
  const nextBytes = encoded(sealManifest(nextManifest, key));
  const initial = beginPublication({ operationId, manifest: nextManifest, manifestBytes: nextBytes, snapshotBytes: bytes, recoveryText: key, context, lastGood: previous });
  let state = initial;
  for (const phase of publicationPhases) {
    assert.equal(state.phase, phase);
    for (const changed of [{ ...context, accountTag: '0'.repeat(64) }, { ...context, provider: 'icloud' }, { ...context, sessionEpoch: 3 }, { ...context, vaultTag: '0'.repeat(64) }, { ...context, cancelled: true }]) {
      assert.equal(publicationEffect(state, changed), null);
      const result = advancePublication(state, event(state), changed, key);
      assert.equal(result.phase, 'aborted'); assert.deepEqual(result.lastGood, previous);
      assert.equal(publicationStatus(result, changed).currentVaultVerified, false);
    }
    const failure = advancePublication(state, { operationId, phase, kind: 'failed' }, context, key);
    assert.equal(failure.phase, 'failed'); assert.deepEqual(failure.lastGood, previous);
    const completion = { ...event(state), bytes: phase === 'snapshotDownload' ? bytes : nextBytes, manifestBytes: nextBytes };
    state = advancePublication(state, completion, context, key);
  }
  assert.equal(state.phase, 'verified'); assert.deepEqual(state.lastGood, nextManifest);
});
test('bad downloads wrong keys manifest substitution stale callbacks and revisions never claim current success', () => {
  let state = move(start());
  for (const bad of [Buffer.alloc(0), Buffer.from('not a snapshot')]) assert.equal(advancePublication(state, { ...event(state), bytes: bad }, context, key).phase, 'failed');
  assert.equal(advancePublication(state, { ...event(state), manifestBytes: Buffer.from('invalid staged manifest') }, context, key).phase, 'failed');
  assert.equal(advancePublication(state, event(state), context, 'pny1-' + '00'.repeat(32)).phase, 'failed');
  assert.deepEqual(advancePublication(state, { ...event(state), operationId: manifest.manifestId }, context, key), state);
  assert.deepEqual(advancePublication(state, { ...event(state), phase: 'manifestDownload' }, context, key), state);
  state = move(move(state));
  assert.equal(state.phase, 'manifestDownload');
  assert.equal(advancePublication(state, { ...event(state), bytes: encoded(sealManifest(manifest, key)) }, context, key).phase, 'failed');
  assert.equal(advancePublication(state, event(state), { ...context, localRevision: 41 }, key).phase, 'aborted');
  const validOlder = move(state, { ...context, localRevision: 43 });
  assert.equal(validOlder.phase, 'verified'); assert.equal(publicationStatus(validOlder, { ...context, localRevision: 43 }).pendingChanges, true);
  assert.throws(() => beginPublication({ operationId, manifest, manifestBytes, snapshotBytes: bytes, recoveryText: key, context: { ...context, localRevision: 43 } }));
});
test('bounded discovery rejects incomplete repeated or ambiguous pages and never deletes unknown objects', () => {
  const name = remoteNames(manifest).manifest;
  assert.deepEqual(collectManifestCandidates([{ items: [{ id: 'remote-1', name }, { id: 'remote-2', name: '../unknown' }], nextPageToken: null }]), [{ id: 'remote-1', name }]);
  for (const pages of [
    [{ items: [], nextPageToken: 'more' }],
    [{ items: [], nextPageToken: 'same' }, { items: [], nextPageToken: 'same' }],
    [{ items: [{ id: 'one', name }, { id: 'two', name }], nextPageToken: null }],
    [{ items: Array(101).fill({ id: 'one', name }), nextPageToken: null }],
    Array(11).fill({ items: [], nextPageToken: null }),
  ]) assert.throws(() => collectManifestCandidates(pages));
});
test('interleaved immutable writers and same-revision conflicts remain explicit recovery candidates', () => {
  const a = start(), other = { ...manifest, manifestId: '56789abc-5678-4678-8678-56789abcdef0', writerId: operationId, localRevision: 1, snapshot: { ...manifest.snapshot, objectId: '6789abcd-6789-4789-8789-6789abcdef01' } };
  const otherManifestBytes = encoded(sealManifest(other, key));
  let b = beginPublication({ operationId, manifest: other, manifestBytes: otherManifestBytes, snapshotBytes: bytes, recoveryText: key, context: { ...context, localRevision: 1 } });
  let first = a;
  for (const phase of publicationPhases) {
    first = move(first);
    b = advancePublication(b, { ...event(b), bytes: phase === 'snapshotDownload' ? bytes : otherManifestBytes, manifestBytes: otherManifestBytes }, { ...context, localRevision: 1 }, key);
  }
  assert.equal(first.phase, 'verified'); assert.equal(b.phase, 'verified');
  assert.deepEqual(first.lastGood, manifest); assert.deepEqual(b.lastGood, other);
  const history = manifestHistory([manifest, other], binding);
  assert.throws(() => manifestHistory([manifest], { provider: binding.provider, accountTag: binding.accountTag }));
  assert.equal(history.multipleWriters, true); assert.equal(history.writers.length, 2); assert.equal(history.automaticDeletionAllowed, false);
  const changedSnapshot = encoded(sealBackup(read('snapshot-v3.json'), key));
  const conflict = { ...manifest, manifestId: '789abcde-789a-489a-889a-789abcdef012', snapshot: { ...manifest.snapshot, sha256: sha256(changedSnapshot), byteCount: changedSnapshot.length } };
  assert.equal(manifestHistory([manifest, conflict], binding).revisionConflict, true);
});
