import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const root = new URL('./', import.meta.url);
const shared = readFileSync(new URL('../shared/src/categories.ts', root), 'utf8');
const categories = [...shared.split('] as const;')[0].matchAll(/^ {2}'(.+)',$/gm)].map(match => match[1]);
if (categories.length !== 38) throw new Error('Canonical category inventory changed; review before regenerating.');
const write = (path, data) => writeFileSync(new URL(path, root), `${JSON.stringify(data, null, 2)}\n`);
write('categories.json', categories);
const { sealForTest, limits } = await import('./contract.mjs');
const expense = { id: '11111111-1111-4111-8111-111111111111', merchant: 'Café Toronto ☕', amountMinor: 1234, currencyCode: 'CAD', expenseDate: '2024-02-29', category: 'Meals and entertainment', note: 'Team lunch\nReceipt reviewed locally.', createdAt: '2026-09-13T12:00:00.000Z', updatedAt: '2026-09-13T12:00:00.000Z' };
const snapshot = { schemaVersion: 1, snapshotId: '22222222-2222-4222-8222-222222222222', vaultId: '33333333-3333-4333-8333-333333333333', createdAt: '2026-09-13T12:01:00.000Z', expenses: [expense], attachments: [] };
const recoveryKey = 'pny1-000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const nonce = Buffer.from('000102030405060708090a0b', 'hex');
write('fixtures/expense-valid.json', expense);
write('fixtures/snapshot-v1.json', snapshot);
write('fixtures/backup-v1.pennybackup', sealForTest(snapshot, recoveryKey, nonce));
write('fixtures/golden-vector.json', { purpose: 'Public deterministic test material. NEVER use this key or nonce for user data.', recoveryKey, nonceHex: nonce.toString('hex'), aadUtf8: 'PENNY-OFFLINE-BACKUP:1', plaintextUtf8: JSON.stringify(snapshot), expectedTotalMinor: 1234 });
// A synthetic 1x1 opaque red PNG, generated without external image dependencies.
function chunk(type, bytes) {
  const payload = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, payload, checksum]);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
const attachment = { id: '44444444-4444-4444-8444-444444444444', expenseId: expense.id, mediaType: 'image/png', byteCount: png.length, sha256: createHash('sha256').update(png).digest('hex'), dataBase64: png.toString('base64') };
const animationControl = Buffer.alloc(8); animationControl.writeUInt32BE(1);
const apng = Buffer.concat([png.subarray(0, 33), chunk('acTL', animationControl), png.subarray(33)]);
const snapshot2 = { ...snapshot, schemaVersion: 2, snapshotId: '55555555-5555-4555-8555-555555555555', attachments: [attachment] };
const nonce2 = Buffer.from('101112131415161718191a1b', 'hex');
write('fixtures/snapshot-v2.json', snapshot2);
write('fixtures/attachment-valid.json', attachment);
writeFileSync(new URL('fixtures/receipt.png', root), png);
write('fixtures/backup-v2.pennybackup', sealForTest(snapshot2, recoveryKey, nonce2));
write('fixtures/golden-vector-v2.json', { purpose: 'Public deterministic test material only.', recoveryKey, nonceHex: nonce2.toString('hex'), aadUtf8: 'PENNY-OFFLINE-BACKUP:1', plaintextUtf8: JSON.stringify(snapshot2), expectedTotalMinor: 1234, expectedAttachmentBytes: png.length, expectedAttachmentSha256: attachment.sha256 });
write('fixtures/conformance-v2.json', {
  attachmentMutations: [ ['wrong digest', 'sha256', '0'.repeat(64)], ['uppercase digest', 'sha256', attachment.sha256.toUpperCase()], ['wrong size', 'byteCount', png.length + 1], ['empty bytes', 'byteCount', 0], ['over capacity bytes', 'byteCount', limits.attachmentBytes + 1], ['unsupported media', 'mediaType', 'image/heic'], ['media mismatch', 'mediaType', 'image/jpeg'], ['orphan', 'expenseId', '66666666-6666-4666-8666-666666666666'], ['path traversal id', 'id', '../../receipt.png'], ['path field', 'path', '../../receipt.png'], ['url field', 'url', 'https://example.invalid/receipt.png'], ['noncanonical base64', 'dataBase64', attachment.dataBase64 + '\n'] ].map(([name, field, value]) => ({ name, field, value, valid: false })),
  snapshotFailures: ['duplicate_attachment_id', 'duplicate_path_field', 'future_schema', 'too_many_attachments', 'total_attachment_bytes', 'malformed_image_with_matching_digest', 'overlarge_image_dimensions'],
  strictJsonFailures: ['{"note":"\\ud800"}', '{"note":"\\udc00"}', '{"\\ud800":1}'],
  imageFailures: [ ['APNG acTL even with one frame', apng], ['trailing data after PNG IEND', Buffer.concat([png, Buffer.from([0])])], ['duplicate PNG IHDR', Buffer.concat([png.subarray(0, 33), png.subarray(8, 33), png.subarray(33)])], ['PNG without image data', Buffer.concat([png.subarray(0, 33), png.subarray(-12)])] ].map(([name, bytes]) => ({ name, attachment: { ...attachment, byteCount: bytes.length, dataBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') } })),
  migration: { fromSchema: 1, toSchema: 2, preserve: 'all expense and snapshot fields except schemaVersion', attachments: [] },
  limits,
});
write('fixtures/conformance.json', {
  money: [ ['0.01', 1], ['12', 1200], ['12.3', 1230], ['999999999.99', 99999999999], ['0', null], ['-1', null], ['1.001', null], ['1e2', null], ['01.20', null], ['1,20', null], [' 1.20 ', null], ['1000000000', null] ].map(([input, expected]) => ({ input, expected })),
  dates: [ ['2024-02-29', true], ['2025-02-29', false], ['2026-04-31', false], ['2026-09-13', true], ['0000-01-01', false], ['2026-9-13', false] ].map(([input, valid]) => ({ input, valid })),
  timestamps: [ ['2026-09-13T12:00:00.000Z', true], ['2026-09-13T12:00:00Z', false], ['2026-09-13T12:00:00.000+00:00', false], ['2026-02-30T12:00:00.000Z', false], ['2026-09-13T24:00:00.000Z', false], ['2026-09-13T12:00:60.000Z', false] ].map(([input, valid]) => ({ input, valid })),
  expenseMutations: [ ['zero amount', 'amountMinor', 0], ['fractional money', 'amountMinor', 1.2], ['overflow money', 'amountMinor', limits.amountMinor + 1], ['blank merchant', 'merchant', ''], ['untrimmed merchant', 'merchant', ' Café'], ['unknown category', 'category', 'Dining'], ['wrong currency', 'currencyCode', 'USD'], ['uppercase uuid', 'id', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'], ['calendar overflow', 'expenseDate', '2026-02-30'], ['timestamp order', 'updatedAt', '2026-09-12T12:00:00.000Z'] ].map(([name, field, value]) => ({ name, field, value, valid: false })),
  snapshotFailures: ['duplicate_ids', 'future_schema', 'unsupported_attachments', 'unknown_fields', 'too_many_expenses'],
  envelopeFailures: ['wrong_key', 'ciphertext_tamper', 'nonce_tamper', 'tag_tamper', 'future_envelope', 'wrong_algorithm', 'missing_field', 'unknown_field', 'duplicate_json_key', 'noncanonical_base64', 'truncated_json', 'invalid_utf8', 'oversize_file']
});
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const timestamp = { type: 'string', format: 'date-time', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' };
const expenseProperties = { id: uuid, merchant: { type: 'string', minLength: 1, maxLength: 200 }, amountMinor: { type: 'integer', minimum: 1, maximum: limits.amountMinor }, currencyCode: { const: 'CAD' }, expenseDate: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, category: { enum: categories }, note: { type: 'string', maxLength: 4000 }, createdAt: timestamp, updatedAt: timestamp };
const snapshotProperties = { schemaVersion: { const: 1 }, snapshotId: uuid, vaultId: uuid, createdAt: timestamp, expenses: { type: 'array', maxItems: limits.expenses, items: { $ref: '#/$defs/expense' } }, attachments: { type: 'array', maxItems: 0 } };
write('snapshot.schema.json', { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Penny Offline expense snapshot v1', description: 'Application validators also enforce exact calendar/UTC roundtrip, timestamp ordering, trimmed merchant, unique IDs, total cap, UTF8 byte limits and empty attachments. String lengths count Unicode code points.', type: 'object', additionalProperties: false, required: Object.keys(snapshotProperties), properties: snapshotProperties, $defs: { expense: { type: 'object', additionalProperties: false, required: Object.keys(expenseProperties), properties: expenseProperties } } });
const attachmentProperties = { id: uuid, expenseId: uuid, mediaType: { enum: ['image/png', 'image/jpeg'] }, byteCount: { type: 'integer', minimum: 1, maximum: limits.attachmentBytes }, sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, dataBase64: { type: 'string', contentEncoding: 'base64', maxLength: 4 * Math.ceil(limits.attachmentBytes / 3) } };
write('snapshot-v2.schema.json', { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Penny Offline expenses and receipts snapshot v2', description: 'Same expense semantics as v1. Semantic validators additionally enforce attachment ownership, unique IDs, exact canonical base64/byte count/SHA256, decoded image validity/dimensions, total attachment bytes and snapshot/export byte budgets. No paths or URLs.', type: 'object', additionalProperties: false, required: Object.keys(snapshotProperties), properties: { ...snapshotProperties, schemaVersion: { const: 2 }, attachments: { type: 'array', maxItems: limits.attachments, items: { $ref: '#/$defs/attachment' } } }, $defs: { expense: { type: 'object', additionalProperties: false, required: Object.keys(expenseProperties), properties: expenseProperties }, attachment: { type: 'object', additionalProperties: false, required: Object.keys(attachmentProperties), properties: attachmentProperties } } });
const base64 = { type: 'string', contentEncoding: 'base64', pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' };
const envelopeProperties = { formatVersion: { const: 1 }, algorithm: { const: 'AES-256-GCM' }, nonce: { ...base64, minLength: 16, maxLength: 16 }, ciphertext: { ...base64, minLength: 4, maxLength: Math.ceil(limits.plaintextBytes / 3) * 4 }, tag: { ...base64, minLength: 24, maxLength: 24 } };
write('backup-envelope.schema.json', { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Penny Offline encrypted portable backup envelope v1', type: 'object', additionalProperties: false, required: Object.keys(envelopeProperties), properties: envelopeProperties });
await import('./generate-finance-fixtures.mjs');
await import('./generate-cloud-fixtures.mjs');
