import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalBase64, categories, limits, validateExpense, validateSnapshot, upgradeSnapshot, requireExportCapacity, parseAmount, validDate, validTimestamp, parseStrictJSON, parseRecoveryKey, sealBackup, sealForTest, openBackup } from './contract.mjs';
const read = path => JSON.parse(readFileSync(new URL(`./fixtures/${path}`, import.meta.url)));
const snapshot = read('snapshot-v1.json');
const envelope = read('backup-v1.pennybackup');
const vector = read('golden-vector.json');
const corpus = read('conformance.json');
const encode = value => Buffer.from(JSON.stringify(value));
const clone = value => structuredClone(value);
test('canonical categories match existing shared source exactly', () => {
  const shared = readFileSync(new URL('../shared/src/categories.ts', import.meta.url), 'utf8');
  assert.deepEqual(categories, [...shared.split('] as const;')[0].matchAll(/^ {2}'(.+)',$/gm)].map(match => match[1]));
});
test('decimal money corpus never uses floating point parsing', () => {
  for (const { input, expected } of corpus.money) {
    if (expected === null) assert.throws(() => parseAmount(input), input);
    else assert.equal(parseAmount(input), expected, input);
  }
});
test('civil dates and UTC timestamps roundtrip exactly', () => {
  for (const { input, valid } of corpus.dates) assert.equal(validDate(input), valid, input);
  for (const { input, valid } of corpus.timestamps) assert.equal(validTimestamp(input), valid, input);
});
test('golden expense validation includes invalid field corpus', () => {
  assert.deepEqual(validateExpense(read('expense-valid.json')), snapshot.expenses[0]);
  for (const { name, field, value } of corpus.expenseMutations) assert.throws(() => validateExpense({ ...snapshot.expenses[0], [field]: value }), name);
});
test('string limits use Unicode code points', () => {
  const expense = { ...snapshot.expenses[0], merchant: '☕'.repeat(200), note: '😀'.repeat(4000) };
  validateExpense(expense);
  assert.throws(() => validateExpense({ ...expense, merchant: '😀'.repeat(201) }));
});
test('snapshot rejects duplicate IDs, future version, attachments and unknown fields', () => {
  assert.throws(() => validateSnapshot({ ...snapshot, expenses: [...snapshot.expenses, ...snapshot.expenses] }));
  assert.throws(() => validateSnapshot({ ...snapshot, schemaVersion: 3 }));
  assert.throws(() => validateSnapshot({ ...snapshot, attachments: [{}] }));
  assert.throws(() => validateSnapshot({ ...snapshot, userId: 'legacy-user' }));
  assert.throws(() => validateSnapshot({ ...snapshot, expenses: Array(limits.expenses + 1).fill(snapshot.expenses[0]) }));
});
test('deterministic AES256-GCM ciphertext and plaintext interoperate', () => {
  assert.deepEqual(sealForTest(snapshot, vector.recoveryKey, Buffer.from(vector.nonceHex, 'hex')), envelope);
  assert.deepEqual(openBackup(encode(envelope), vector.recoveryKey), snapshot);
  assert.equal(JSON.stringify(snapshot), vector.plaintextUtf8);
});
test('new random nonce produces independent backups with same contents', () => {
  const first = sealBackup(snapshot, vector.recoveryKey);
  const second = sealBackup(snapshot, vector.recoveryKey);
  assert.notEqual(first.nonce, second.nonce);
  assert.deepEqual(openBackup(encode(first), vector.recoveryKey), openBackup(encode(second), vector.recoveryKey));
});

const snapshot2 = read('snapshot-v2.json');
const vector2 = read('golden-vector-v2.json');
const corpus2 = read('conformance-v2.json');
const withBytes = bytes => ({ ...snapshot2.attachments[0], byteCount: bytes.length, dataBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') });
test('v2 public vector preserves exact encrypted receipt bytes and digest', () => {
  const envelope2 = read('backup-v2.pennybackup');
  assert.deepEqual(sealForTest(snapshot2, vector2.recoveryKey, Buffer.from(vector2.nonceHex, 'hex')), envelope2);
  assert.deepEqual(openBackup(encode(envelope2), vector2.recoveryKey), snapshot2);
  assert.equal(JSON.stringify(snapshot2), vector2.plaintextUtf8);
  assert.deepEqual(Buffer.from(snapshot2.attachments[0].dataBase64, 'base64'), readFileSync(new URL('./fixtures/receipt.png', import.meta.url)));
  assert.equal(snapshot2.attachments[0].sha256, vector2.expectedAttachmentSha256);
});
test('captured iOS and Android runtime archives interoperate without local build dependencies', () => {
  const provenance = read('native-exports/provenance.json');
  for (const entry of provenance.exports) {
    const bytes = readFileSync(new URL(`./fixtures/native-exports/${entry.file}`, import.meta.url));
    assert.equal(bytes.length, entry.byteCount);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    const expected = read(`native-exports/${entry.expectedSnapshot}`);
    const key = read(`native-exports/${entry.testKeyReference}`).recoveryKey;
    const actual = openBackup(bytes, key);
    // Stored rows may be exported in a different display order. Compare all records, by ID.
    const byID = rows => rows.toSorted((a, b) => a.id.localeCompare(b.id));
    for (const field of Object.keys(expected).filter(field => Array.isArray(expected[field]))) {
      assert.deepEqual(byID(actual[field]), byID(expected[field]), `${entry.file}: ${field}`);
    }
    assert.equal(actual.vaultId, expected.vaultId); assert.equal(actual.schemaVersion, expected.schemaVersion);
  }
});
test('strict v1 migration is lossless and refuses unrepresented fields', () => {
  const before = encode(snapshot);
  assert.deepEqual(upgradeSnapshot(snapshot), { ...snapshot, schemaVersion: 2 });
  assert.deepEqual(upgradeSnapshot(snapshot2), snapshot2);
  assert.deepEqual(encode(snapshot), before);
  assert.throws(() => upgradeSnapshot({ ...snapshot, budgets: [] }));
  assert.throws(() => upgradeSnapshot({ ...snapshot, expenses: [{ ...snapshot.expenses[0], receiptUrl: 'https://example.invalid/receipt' }] }));
});
test('v2 attachment corpus refuses hashes, sizes, media, orphans, paths and extra fields', () => {
  for (const { name, field, value } of corpus2.attachmentMutations) {
    assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [{ ...snapshot2.attachments[0], [field]: value }] }), name);
  }
  assert.throws(() => validateSnapshot({ ...snapshot2, schemaVersion: 3 }));
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [snapshot2.attachments[0], snapshot2.attachments[0]] }));
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments: Array(limits.attachments + 1).fill(snapshot2.attachments[0]) }));
  const path = { ...snapshot2.attachments[0], path: 'receipts/same.png' };
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [path, { ...path, id: snapshot.snapshotId }] }));
});
test('malformed or overlarge image rejected even with matching SHA256', () => {
  const png = Buffer.from(snapshot2.attachments[0].dataBase64, 'base64');
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [withBytes(Buffer.from('not a photograph'))] }));
  const bad = Buffer.from(png); bad.writeUInt32BE(4097, 16);
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [withBytes(bad)] }));
  bad.writeUInt32BE(4096, 16); bad.writeUInt32BE(4096, 20);
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [withBytes(bad)] }));
  for (const { name, attachment } of corpus2.imageFailures) assert.throws(() => validateSnapshot({ ...snapshot2, attachments: [attachment] }), name);
});
test('aggregate attachment size is bounded independently of single receipt and envelope size', () => {
  // Node validates headers rather than full PNG data: padded synthetic bytes test
  // the size gate only. Native tests must additionally run a full image decoder.
  const png = Buffer.from(snapshot2.attachments[0].dataBase64, 'base64');
  const padding = Buffer.alloc(limits.attachmentBytes - png.length);
  padding.writeUInt32BE(padding.length - 12); padding.write('npAD', 4);
  const bytes = Buffer.concat([png.subarray(0, -12), padding, png.subarray(-12)]);
  const large = withBytes(bytes);
  const attachments = Array.from({ length: 5 }, (_, index) => ({ ...large, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
  validateSnapshot({ ...snapshot2, attachments: attachments.slice(0, 4) });
  assert.throws(() => validateSnapshot({ ...snapshot2, attachments }), /attachment_total/);
});
test('export overhead reserve is common and plaintext cap alone is insufficient', () => {
  const maximum = Math.floor((limits.envelopeBytes - limits.envelopeReserve) / 4) * 3;
  requireExportCapacity(maximum);
  assert.throws(() => requireExportCapacity(maximum + 1), /export_capacity/);
  assert.throws(() => requireExportCapacity(limits.plaintextBytes), /export_capacity/);
});
test('unpaired UTF16 surrogates fail both strict wire parser and direct validation', () => {
  for (const raw of corpus2.strictJsonFailures) assert.throws(() => parseStrictJSON(Buffer.from(raw), limits.plaintextBytes), /invalid_unicode/);
  for (const value of ['\ud800', '\udc00', 'x\ud800x', '\ud800\ud800']) {
    assert.throws(() => validateExpense({ ...snapshot.expenses[0], note: value }));
    assert.throws(() => validateExpense({ ...snapshot.expenses[0], merchant: value }));
  }
  assert.deepEqual(parseStrictJSON(Buffer.from('{"note":"\\ud83d\\ude00"}'), 100), { note: '😀' });
});
test('wrong recovery key and each authenticated component tamper fail closed', () => {
  assert.throws(() => openBackup(encode(envelope), `pny1-${'ff'.repeat(32)}`));
  for (const field of ['ciphertext', 'nonce', 'tag']) {
    const modified = clone(envelope);
    const bytes = Buffer.from(modified[field], 'base64'); bytes[0] ^= 1;
    modified[field] = bytes.toString('base64');
    assert.throws(() => openBackup(encode(modified), vector.recoveryKey), field);
  }
});
test('future envelope, algorithm, extra and missing members rejected', () => {
  for (const modified of [{ ...envelope, formatVersion: 2 }, { ...envelope, algorithm: 'AES-CBC' }, { ...envelope, extra: true }]) assert.throws(() => openBackup(encode(modified), vector.recoveryKey));
  const missing = clone(envelope); delete missing.tag;
  assert.throws(() => openBackup(encode(missing), vector.recoveryKey));
});
test('strict parser rejects duplicate/escaped duplicate members, malformed and deeply nested JSON', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":}', '[1,]', '{"a":1}{}', '['.repeat(40) + '0' + ']'.repeat(40)]) assert.throws(() => parseStrictJSON(Buffer.from(text), limits.envelopeBytes), text);
  const escaped = { a: 'escaped " quote', b: [true, false, null] };
  assert.deepEqual(parseStrictJSON(Buffer.from(JSON.stringify(escaped)), limits.envelopeBytes), escaped);
});
test('untrusted envelope rejected before decryption on truncation, invalid UTF8 and oversize', () => {
  assert.throws(() => openBackup(encode(envelope).subarray(0, 100), vector.recoveryKey));
  assert.throws(() => openBackup(Buffer.from([0xff]), vector.recoveryKey));
  assert.throws(() => openBackup(Buffer.alloc(limits.envelopeBytes + 1), vector.recoveryKey));
});
test('base64 spelling, nonce/tag length and recovery text are strict', () => {
  assert.throws(() => openBackup(encode({ ...envelope, tag: envelope.tag.replaceAll('=', '') }), vector.recoveryKey));
  assert.throws(() => openBackup(encode({ ...envelope, nonce: 'AA==' }), vector.recoveryKey));
  assert.throws(() => parseRecoveryKey('ordinary password'));
  assert.throws(() => parseRecoveryKey(vector.recoveryKey.toUpperCase()));
  assert.equal(parseRecoveryKey(` ${vector.recoveryKey}\n`).length, 32);
});
test('near-limit encrypted backup and malformed long base64 use bounded linear validation', () => {
  const large = { ...snapshot, expenses: Array.from({ length: 4000 }, (_, index) => ({ ...snapshot.expenses[0], id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`, note: 'x'.repeat(3500) })) };
  const encrypted = sealBackup(large, vector.recoveryKey), bytes = encode(encrypted);
  assert.ok(bytes.length > 19 * 1024 * 1024 && bytes.length <= limits.envelopeBytes);
  assert.deepEqual(openBackup(bytes, vector.recoveryKey), large);
  for (const malformed of [encrypted.ciphertext.slice(0, -4) + 'AA=A', encrypted.ciphertext.slice(0, -1) + '!', encrypted.ciphertext + '====']) {
    assert.throws(() => canonicalBase64(malformed), { message: 'invalid_base64' });
  }
});
test('restore preflight is read-only and leaves current state untouched on failure', () => {
  const current = clone(snapshot);
  const before = JSON.stringify(current);
  assert.throws(() => openBackup(encode({ ...envelope, tag: 'AAAAAAAAAAAAAAAAAAAAAA==' }), vector.recoveryKey));
  assert.equal(JSON.stringify(current), before);
  const preview = openBackup(encode(envelope), vector.recoveryKey);
  assert.equal(preview.expenses.length, 1);
  assert.equal(JSON.stringify(current), before);
  // Native file/SQLite transactional replacement and crash rollback require
  // native tests. This test only proves the shared preflight has no mutation.
});
