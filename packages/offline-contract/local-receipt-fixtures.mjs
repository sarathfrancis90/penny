// Deterministic PUBLIC test material only. Fixed keys/nonces are never app inputs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { associatedData, authenticateFixture, deriveKey, sha256 } from './local-receipt.mjs';
export const fixtureDirectory = new URL('./fixtures/local-receipt-v1/', import.meta.url);
export function buildFixtures() {
  const attachment = JSON.parse(readFileSync(new URL('./fixtures/attachment-valid.json', import.meta.url), 'utf8'));
  const { dataBase64, ...a } = attachment;
  const descriptor = { vaultId: '33333333-3333-4333-8333-333333333333', generationId: '55555555-5555-4555-8555-555555555555', ...a };
  const root = Buffer.alloc(32, 11), nonce = Buffer.from('000102030405060708090a0b', 'hex'), plain = Buffer.from(dataBase64, 'base64');
  const envelope = authenticateFixture(root, descriptor, plain, nonce);
  const positive = { name: 'public-png', file: 'receipt.pennyreceipt', plaintextFile: 'receipt.png', rootHex: root.toString('hex'), nonceHex: nonce.toString('hex'), descriptor, derivedKeyHex: deriveKey(root, descriptor.vaultId, descriptor.generationId).toString('hex'), aadHex: associatedData(descriptor).toString('hex'), envelopeBytes: envelope.length, envelopeSha256: sha256(envelope) };
  const negatives = [];
  function negative(name, scope, d = descriptor, bytes = envelope, key = root) {
    negatives.push({ name, scope, expected: 'reject', descriptor: d, rootHex: key.toString('hex'), envelopeHex: bytes.toString('hex'), envelopeSha256: sha256(bytes) });
  }
  const patch = (name, field, value, scope = 'metadata') => negative(name, scope, { ...descriptor, [field]: value });
  for (const field of ['vaultId', 'generationId', 'id', 'expenseId']) patch(`substitute-${field}`, field, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authentication');
  patch('substitute-media', 'mediaType', 'image/jpeg', 'authentication');
  patch('substitute-length', 'byteCount', plain.length + 1, 'envelope');
  patch('substitute-hash', 'sha256', '00'.repeat(32), 'authentication');
  negative('wrong-root', 'authentication', descriptor, envelope, Buffer.alloc(32, 12));
  negative('short-root', 'metadata', descriptor, envelope, Buffer.alloc(31, 11));
  for (const [name, offset, scope] of [['magic', 0, 'envelope'], ['nonce', 8, 'authentication'], ['ciphertext', 20, 'authentication'], ['tag', envelope.length - 1, 'authentication']]) {
    const changed = Buffer.from(envelope); changed[offset] ^= 1; negative(`tamper-${name}`, scope, descriptor, changed);
  }
  negative('truncate-header', 'envelope', descriptor, envelope.subarray(0, 19));
  negative('truncate-tag', 'envelope', descriptor, envelope.subarray(0, -1));
  negative('trailing-byte', 'envelope', descriptor, Buffer.concat([envelope, Buffer.from([0])]));
  negative('empty-envelope', 'envelope', descriptor, Buffer.alloc(0));
  patch('uppercase-uuid', 'id', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
  patch('path-uuid', 'id', '../receipt'); patch('short-uuid', 'vaultId', '3333');
  patch('zero-length', 'byteCount', 0); patch('negative-length', 'byteCount', -1);
  patch('fraction-length', 'byteCount', 1.5); patch('boolean-length', 'byteCount', true);
  patch('string-length', 'byteCount', '70'); patch('oversize-length', 'byteCount', 2097153);
  patch('unknown-media', 'mediaType', 'application/octet-stream');
  patch('uppercase-hash', 'sha256', descriptor.sha256.toUpperCase()); patch('short-hash', 'sha256', '00');
  negative('unknown-field', 'metadata', { ...descriptor, path: '/tmp/receipt' });
  const missing = { ...descriptor }; delete missing.expenseId; negative('missing-field', 'metadata', missing);
  // Valid GCM with deliberately false claims: these must fail after authentication.
  const falseHash = { ...descriptor, sha256: '00'.repeat(32) };
  negative('authenticated-false-hash', 'content', falseHash, authenticateFixture(root, falseHash, plain, nonce));
  const falseMedia = { ...descriptor, mediaType: 'image/jpeg' };
  negative('authenticated-false-media', 'image-structure', falseMedia, authenticateFixture(root, falseMedia, plain, nonce));
  const shortPlain = plain.subarray(0, -1);
  negative('authenticated-false-length', 'envelope', descriptor, authenticateFixture(root, descriptor, shortPlain, nonce));
  const garbage = Buffer.alloc(70), garbageDescriptor = { ...descriptor, sha256: sha256(garbage) };
  negative('authenticated-non-image', 'image-structure', garbageDescriptor, authenticateFixture(root, garbageDescriptor, garbage, nonce));
  const lifecycle = [
    { name: 'cross-generation', steps: ['open A', 'write descriptor bound to B'], expected: 'reject before admission; discard only A-owned files' },
    { name: 'duplicate-id', steps: ['open', 'write receipt', 'write same ID with same or changed descriptor'], expected: 'reject; never replace first file' },
    { name: 'count-bound', steps: ['open', 'write 100 distinct valid receipts', 'write 101st'], expected: '100 admitted; 101st rejected without file admission' },
    { name: 'byte-bound', steps: ['open', 'write valid receipts totalling 8388608 bytes', 'write one more receipt'], expected: 'exact bound accepted; extra receipt rejected without admission' },
    { name: 'write-failure', steps: ['open', 'inject write/sync/close/reopen or cancellation failure'], expected: 'no successful handle; no subsequent operation reuse; owned ciphertext cleaned or cleanup failure surfaced' },
    { name: 'seal-tamper', steps: ['open', 'write valid receipt', 'change/remove/add owned file before seal', 'seal'], expected: 'reject; no generation returned' },
    { name: 'seal-transfer', steps: ['open', 'write', 'seal', 'operation discard', 'read generation', 'write or seal again'], expected: 'generation remains readable; old operation refuses writes/second seal; generation owns cleanup' },
    { name: 'discard-terminal', steps: ['open', 'write', 'discard', 'write or seal'], expected: 'owned files removed; reuse rejected' },
    { name: 'foreign-path', steps: ['precreate foreign file/directory or symlink collision', 'attempt create/write/read/discard'], expected: 'reject unsafe adoption; foreign sentinel unchanged; no plaintext temporary file' },
  ];
  const manifest = { format: 'penny-local-receipt-fixtures-v1', scope: 'Local codec only; native decode and lifecycle require native proof', positives: [positive], negatives, lifecycle };
  return new Map([['receipt.pennyreceipt', envelope], ['receipt.png', plain], ['fixture-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]]);
}
export function verifyFixtures() {
  const files = buildFixtures();
  for (const [name, expected] of files) {
    if (!readFileSync(new URL(name, fixtureDirectory)).equals(expected)) throw new Error(`stale_fixture:${name}`);
  }
  return files.size;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === 'generate') {
    mkdirSync(fixtureDirectory, { recursive: true });
    for (const [name, bytes] of buildFixtures()) writeFileSync(new URL(name, fixtureDirectory), bytes);
  } else if (mode === 'verify') {
    process.stdout.write(`Verified ${verifyFixtures()} deterministic local receipt fixture files (read-only).\n`);
  } else throw new Error('usage: node local-receipt-fixtures.mjs generate|verify');
}
