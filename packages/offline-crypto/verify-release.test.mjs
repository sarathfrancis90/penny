import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyRelease } from './verify-release.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const archive = Buffer.from('public synthetic release fixture');
  const keyId = Buffer.from('0001020304050607', 'hex');
  const rawKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const fileSignature = sign(null, createHash('blake2b512').update(archive).digest(), privateKey);
  const packet = Buffer.concat([Buffer.from('ED'), keyId, fileSignature]);
  const comment = 'timestamp:1\tfile:libsodium-test.tar.gz\thashed';
  const signature = Buffer.from(`untrusted comment: test\n${packet.toString('base64')}\ntrusted comment: ${comment}\n${sign(null, Buffer.concat([fileSignature, Buffer.from(comment)]), privateKey).toString('base64')}\n`);
  const manifest = { schemaVersion: 1, name: 'libsodium', version: 'test', archive: { sizeBytes: archive.length, sha256: hash(archive), url: 'https://example.invalid/libsodium-test.tar.gz' }, signature: { sha256: hash(signature), publicKey: Buffer.concat([Buffer.from('Ed'), keyId, rawKey]).toString('base64') } };
  return { archive, signature, manifest };
}
function changedSignature(f, edit) {
  f.signature = Buffer.from(edit(f.signature.toString()));
  f.manifest.signature.sha256 = hash(f.signature);
}

test('independent Ed25519 file and trusted-comment verification', () => {
  const f = fixture();
  assert.equal(verifyRelease(f.archive, f.signature, f.manifest).signature, 'verified');
});
test('changed payload fails even when expected digest is replaced', () => {
  const f = fixture(); f.archive[0] ^= 1; f.manifest.archive.sha256 = hash(f.archive);
  assert.throws(() => verifyRelease(f.archive, f.signature, f.manifest), /Archive signature verification failed/);
});
test('changed trusted comment fails even when packet digest is replaced', () => {
  const f = fixture(); changedSignature(f, text => text.replace('timestamp:1', 'timestamp:2'));
  assert.throws(() => verifyRelease(f.archive, f.signature, f.manifest), /Trusted comment signature verification failed/);
});
test('wrong public key with same identifier does not authenticate', () => {
  const f = fixture(); const key = Buffer.from(f.manifest.signature.publicKey, 'base64'); key[10] ^= 1;
  f.manifest.signature.publicKey = key.toString('base64');
  assert.throws(() => verifyRelease(f.archive, f.signature, f.manifest), /Archive signature verification failed/);
});
test('legacy signature algorithm and wrong key identifier are rejected', () => {
  for (const index of [1, 2]) {
    const f = fixture(); changedSignature(f, text => {
      const lines = text.split('\n'); const packet = Buffer.from(lines[1], 'base64'); packet[index] ^= 1;
      lines[1] = packet.toString('base64'); return lines.join('\n');
    });
    assert.throws(() => verifyRelease(f.archive, f.signature, f.manifest), /algorithm or key identity/);
  }
});
test('signed filename must match the selected release', () => {
  const f = fixture(); f.manifest.archive.url = 'https://example.invalid/different.tar.gz';
  assert.throws(() => verifyRelease(f.archive, f.signature, f.manifest), /Signed archive filename mismatch/);
});
test('noncanonical base64 and wrong archive size fail closed', () => {
  const f = fixture(); changedSignature(f, text => text.replace(/\n([^\n]+)\n/, '\n$1 \n'));
  assert.throws(() => verifyRelease(f.archive, f.signature, f.manifest), /Invalid signature encoding/);
  const g = fixture(); g.manifest.archive.sizeBytes += 1;
  assert.throws(() => verifyRelease(g.archive, g.signature, g.manifest), /Invalid archive size/);
});
