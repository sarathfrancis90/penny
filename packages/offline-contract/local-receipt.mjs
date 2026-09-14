// Independent interoperability oracle; never imported by native production code.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { exactKeys, requireThat, validateImageHeader } from './contract.mjs';

export const receiptLimits = Object.freeze({ bytes: 2 * 1024 * 1024, count: 100, totalBytes: 8 * 1024 * 1024 });
export const magic = Buffer.from('PNYRCP01', 'ascii');
export const keyDomain = Buffer.from('PENNY-OFFLINE-LOCAL-RECEIPT-KEY:1\0', 'utf8');
export const aadDomain = Buffer.from('PENNY-OFFLINE-LOCAL-RECEIPT:1\0', 'utf8');
const fields = ['vaultId', 'generationId', 'id', 'expenseId', 'mediaType', 'byteCount', 'sha256'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function rawId(id) {
  requireThat(typeof id === 'string' && uuid.test(id), 'invalid_uuid');
  return Buffer.from(id.replaceAll('-', ''), 'hex');
}
export function validateDescriptor(d) {
  exactKeys(d, fields);
  for (const name of fields.slice(0, 4)) rawId(d[name]);
  requireThat(d.mediaType === 'image/png' || d.mediaType === 'image/jpeg', 'unsupported_media');
  requireThat(Number.isSafeInteger(d.byteCount) && d.byteCount >= 1 && d.byteCount <= receiptLimits.bytes, 'receipt_size');
  requireThat(typeof d.sha256 === 'string' && /^[0-9a-f]{64}$/.test(d.sha256), 'receipt_digest');
  return d;
}
export function deriveKey(root, vaultId, generationId) {
  requireThat(Buffer.isBuffer(root) && root.length === 32, 'root_size');
  return createHmac('sha256', root).update(Buffer.concat([keyDomain, rawId(vaultId), rawId(generationId)])).digest();
}
export function associatedData(d) {
  validateDescriptor(d);
  const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(d.byteCount));
  return Buffer.concat([aadDomain, magic, ...fields.slice(0, 4).map(name => rawId(d[name])), Buffer.from([d.mediaType === 'image/png' ? 1 : 2]), length, Buffer.from(d.sha256, 'hex')]);
}
function validateContent(d, plaintext) {
  requireThat(Buffer.isBuffer(plaintext) && plaintext.length === d.byteCount, 'receipt_size');
  requireThat(sha256(plaintext) === d.sha256, 'receipt_digest');
  validateImageHeader(plaintext, d.mediaType);
}
// Public fixture generation only. Deliberately permits authenticated false content
// claims so the corpus can test post-authentication length/hash/image validation.
export function authenticateFixture(root, d, plaintext, nonce) {
  validateDescriptor(d);
  requireThat(Buffer.isBuffer(plaintext) && plaintext.length <= receiptLimits.bytes, 'receipt_size');
  requireThat(Buffer.isBuffer(nonce) && nonce.length === 12, 'nonce_size');
  const key = deriveKey(root, d.vaultId, d.generationId);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    cipher.setAAD(associatedData(d));
    return Buffer.concat([magic, nonce, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  } finally { key.fill(0); }
}
export function sealReceipt(root, d, plaintext) {
  validateDescriptor(d); validateContent(d, plaintext);
  return authenticateFixture(root, d, plaintext, randomBytes(12));
}
export function openReceipt(root, d, envelope) {
  validateDescriptor(d);
  requireThat(Buffer.isBuffer(envelope) && envelope.length === d.byteCount + 36, 'envelope_size');
  requireThat(envelope.subarray(0, 8).equals(magic), 'envelope_magic');
  const key = deriveKey(root, d.vaultId, d.generationId);
  let provisional;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(8, 20), { authTagLength: 16 });
    decipher.setAAD(associatedData(d)); decipher.setAuthTag(envelope.subarray(-16));
    provisional = decipher.update(envelope.subarray(20, -16));
    const plaintext = Buffer.concat([provisional, decipher.final()]);
    try { validateContent(d, plaintext); return plaintext; }
    catch (error) { plaintext.fill(0); throw error; }
  } finally { key.fill(0); provisional?.fill(0); }
}
