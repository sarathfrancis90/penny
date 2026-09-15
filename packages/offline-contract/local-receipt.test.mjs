import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { associatedData, authenticateFixture, deriveKey, openReceipt, sealReceipt, validateDescriptor } from './local-receipt.mjs';
import { fixtureDirectory, verifyFixtures } from './local-receipt-fixtures.mjs';
const manifest = JSON.parse(readFileSync(new URL('fixture-manifest.json', fixtureDirectory)));
const p = manifest.positives[0], root = Buffer.from(p.rootHex, 'hex');
const plaintext = readFileSync(new URL(p.plaintextFile, fixtureDirectory));
const envelope = readFileSync(new URL(p.file, fixtureDirectory));
test('committed deterministic corpus is fresh without rewriting', () => assert.equal(verifyFixtures(), 3));
test('public golden key, AAD, encryption and authenticated read agree exactly', () => {
  assert.equal(deriveKey(root, p.descriptor.vaultId, p.descriptor.generationId).toString('hex'), p.derivedKeyHex);
  assert.equal(associatedData(p.descriptor).toString('hex'), p.aadHex);
  assert.equal(associatedData(p.descriptor).length, 143);
  assert.equal(associatedData(p.descriptor).readBigUInt64BE(103), 70n);
  assert.deepEqual(authenticateFixture(root, p.descriptor, plaintext, Buffer.from(p.nonceHex, 'hex')), envelope);
  assert.deepEqual(openReceipt(root, p.descriptor, envelope), plaintext);
});
test('every shared negative fails, including valid-GCM false claims', () => {
  assert.equal(manifest.negatives.length, 35);
  for (const n of manifest.negatives) assert.throws(() => openReceipt(Buffer.from(n.rootHex, 'hex'), n.descriptor, Buffer.from(n.envelopeHex, 'hex')), undefined, n.name);
});
test('runtime entry point uses fresh nonce and validates content before sealing', () => {
  const a = sealReceipt(root, p.descriptor, plaintext), b = sealReceipt(root, p.descriptor, plaintext);
  assert.notDeepEqual(a.subarray(8, 20), b.subarray(8, 20));
  assert.deepEqual(openReceipt(root, p.descriptor, a), plaintext);
  assert.throws(() => sealReceipt(root, p.descriptor, Buffer.alloc(70)));
});
test('typed metadata rejects nonfinite lengths and preserves existing UUID shape', () => {
  for (const byteCount of [NaN, Infinity, -Infinity, undefined, null, false, 1.00000001]) assert.throws(() => validateDescriptor({ ...p.descriptor, byteCount }));
  assert.doesNotThrow(() => validateDescriptor({ ...p.descriptor, id: '00000000-0000-0000-0000-000000000000', byteCount: 2097152 }));
  assert.equal(manifest.lifecycle.length, 9); // Scenarios require native filesystem proof.
});
