// Executable interoperability reference. Native applications implement the same
// contract with CryptoKit and Android's cryptography APIs; this is not app code.
import { readFileSync } from 'node:fs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { validateFinanceExpense, validateFinanceDomains } from './finance.mjs';

export const categories = JSON.parse(readFileSync(new URL('./categories.json', import.meta.url)));
export const limits = Object.freeze({ amountMinor: 99999999999, totalMinor: 999999999999999, expenses: 10000, plaintextBytes: 15 * 1024 * 1024, envelopeBytes: 20 * 1024 * 1024, envelopeReserve: 1024, attachments: 100, attachmentBytes: 2 * 1024 * 1024, totalAttachmentBytes: 8 * 1024 * 1024, imageDimension: 4096, imagePixels: 16000000 });
export const aad = Buffer.from('PENNY-OFFLINE-BACKUP:1', 'utf8');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function requireThat(ok, code) { if (!ok) throw new Error(code); }
export function validUnicode(value) {
  return typeof value === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
}
export function exactKeys(value, keys) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'object_required');
  requireThat(Object.keys(value).sort().join(',') === [...keys].sort().join(','), 'unknown_or_missing_field');
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function validTimestamp(value) {
  if (typeof value !== 'string' || !timestamp.test(value) || !validDate(value.slice(0, 10))) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.toISOString() === value;
}
export function parseAmount(text) {
  requireThat(typeof text === 'string' && /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(text), 'invalid_money');
  const [whole, cents = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  requireThat(minor > 0 && minor <= limits.amountMinor, 'invalid_money');
  return minor;
}
export function validateExpense(value) {
  exactKeys(value, ['id', 'merchant', 'amountMinor', 'currencyCode', 'expenseDate', 'category', 'note', 'createdAt', 'updatedAt']);
  requireThat(typeof value.id === 'string' && uuid.test(value.id), 'invalid_uuid');
  requireThat(validUnicode(value.merchant) && value.merchant === value.merchant.trim() && [...value.merchant].length >= 1 && [...value.merchant].length <= 200, 'invalid_merchant');
  requireThat(Number.isSafeInteger(value.amountMinor) && value.amountMinor > 0 && value.amountMinor <= limits.amountMinor, 'invalid_money');
  requireThat(value.currencyCode === 'CAD', 'unsupported_currency');
  requireThat(validDate(value.expenseDate), 'invalid_date');
  requireThat(categories.includes(value.category), 'invalid_category');
  requireThat(validUnicode(value.note) && [...value.note].length <= 4000, 'invalid_note');
  requireThat(validTimestamp(value.createdAt) && validTimestamp(value.updatedAt) && value.updatedAt >= value.createdAt, 'invalid_timestamp');
  return value;
}
export function validateSnapshot(value) {
  exactKeys(value, ['schemaVersion', 'snapshotId', 'vaultId', 'createdAt', 'expenses', 'attachments', ...(value?.schemaVersion === 3 ? ['budgets', 'incomeSources', 'incomeEntries', 'savingsGoals', 'savingsEntries', 'recurringExpenses'] : [])]);
  requireThat([1, 2, 3].includes(value.schemaVersion), 'unsupported_schema');
  requireThat(typeof value.snapshotId === 'string' && uuid.test(value.snapshotId) && typeof value.vaultId === 'string' && uuid.test(value.vaultId), 'invalid_uuid');
  requireThat(validTimestamp(value.createdAt), 'invalid_timestamp');
  requireThat(Array.isArray(value.expenses) && value.expenses.length <= limits.expenses, 'expense_limit');
  requireThat(Array.isArray(value.attachments), 'attachments_required');
  requireThat(value.schemaVersion >= 2 || value.attachments.length === 0, 'attachments_require_new_schema');
  requireThat(value.attachments.length <= limits.attachments, 'attachment_count');
  const ids = new Set();
  let total = 0;
  for (const expense of value.expenses) {
    if (value.schemaVersion === 3) validateFinanceExpense(expense); else validateExpense(expense);
    requireThat(!ids.has(expense.id), 'duplicate_expense');
    ids.add(expense.id);
    total += expense.amountMinor;
    requireThat(Number.isSafeInteger(total) && total <= limits.totalMinor, 'aggregate_limit');
  }
  const attachmentIds = new Set();
  let attachmentBytes = 0;
  for (const attachment of value.attachments) {
    validateAttachment(attachment);
    requireThat(ids.has(attachment.expenseId), 'orphan_attachment');
    requireThat(!attachmentIds.has(attachment.id), 'duplicate_attachment');
    attachmentIds.add(attachment.id);
    attachmentBytes += attachment.byteCount;
    requireThat(attachmentBytes <= limits.totalAttachmentBytes, 'attachment_total');
  }
  if (value.schemaVersion === 3) validateFinanceDomains(value);
  requireThat(Buffer.byteLength(JSON.stringify(value), 'utf8') <= limits.plaintextBytes, 'plaintext_limit');
  return value;
}

// No caller can smuggle a filesystem path: the closed attachment object carries
// bytes, not references. Platform apps additionally require full image decoding.
export function validateAttachment(value) {
  exactKeys(value, ['id', 'expenseId', 'mediaType', 'byteCount', 'sha256', 'dataBase64']);
  requireThat(typeof value.id === 'string' && uuid.test(value.id) && typeof value.expenseId === 'string' && uuid.test(value.expenseId), 'invalid_uuid');
  requireThat(value.mediaType === 'image/png' || value.mediaType === 'image/jpeg', 'unsupported_media');
  requireThat(Number.isSafeInteger(value.byteCount) && value.byteCount > 0 && value.byteCount <= limits.attachmentBytes, 'attachment_size');
  requireThat(typeof value.dataBase64 === 'string' && value.dataBase64.length <= 4 * Math.ceil(limits.attachmentBytes / 3), 'attachment_size');
  const bytes = base64(value.dataBase64, value.byteCount);
  requireThat(typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) && createHash('sha256').update(bytes).digest('hex') === value.sha256, 'attachment_digest');
  validateImageHeader(bytes, value.mediaType);
  return value;
}

export function validateImageHeader(bytes, mediaType) {
  let width, height;
  if (mediaType === 'image/png') {
    requireThat(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR', 'invalid_image');
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    let offset = 8, ended = false, imageData = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      requireThat(length <= bytes.length - offset - 12, 'invalid_image');
      requireThat(type !== 'acTL', 'animated_image');
      requireThat(type !== 'IHDR' || offset === 8, 'invalid_image');
      imageData ||= type === 'IDAT';
      offset += 12 + length;
      if (type === 'IEND') { requireThat(length === 0 && offset === bytes.length, 'invalid_image'); ended = true; break; }
    }
    requireThat(ended && imageData, 'invalid_image');
  } else {
    requireThat(bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217, 'invalid_image');
    let offset = 2;
    while (offset < bytes.length - 2) {
      requireThat(bytes[offset++] === 255, 'invalid_image');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      requireThat(offset + 2 <= bytes.length, 'invalid_image');
      const length = bytes.readUInt16BE(offset);
      requireThat(length >= 2 && offset + length <= bytes.length, 'invalid_image');
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        requireThat(length >= 8, 'invalid_image');
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  }
  requireThat(width > 0 && height > 0 && width <= limits.imageDimension && height <= limits.imageDimension && width * height <= limits.imagePixels, 'image_dimensions');
}

export function upgradeSnapshot(value) {
  validateSnapshot(value);
  requireThat(value.schemaVersion <= 2, 'cannot_downgrade_schema');
  // Closed v1 validation happens before conversion, preserving every field.
  return { ...structuredClone(value), schemaVersion: 2 };
}
export function requireExportCapacity(plaintextBytes) {
  requireThat(Number.isSafeInteger(plaintextBytes) && plaintextBytes >= 0 && plaintextBytes <= limits.plaintextBytes && 4 * Math.ceil(plaintextBytes / 3) + limits.envelopeReserve <= limits.envelopeBytes, 'export_capacity');
}

// Reject duplicate members and deeply nested JSON before platform-style JSON
// decoding. Duplicate JSON fields otherwise vary across platform decoders.
export function parseStrictJSON(bytes, maxBytes) {
  requireThat(bytes.byteLength <= maxBytes, 'file_limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let i = 0;
  function white() { while ([' ', '\t', '\n', '\r'].includes(text[i])) i++; }
  function string() {
    requireThat(text[i] === '"', 'invalid_json');
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '\\') { i++; continue; }
      if (c === '"') {
        const decoded = JSON.parse(text.slice(start, i));
        requireThat(validUnicode(decoded), 'invalid_unicode');
        return decoded;
      }
    }
    throw new Error('invalid_json');
  }
  function value(depth) {
    requireThat(depth <= 32, 'json_depth');
    white();
    if (text[i] === '"') { string(); return; }
    if (text[i] === '{' || text[i] === '[') {
      const object = text[i++] === '{';
      const close = object ? '}' : ']';
      const keys = new Set();
      white();
      if (text[i] === close) { i++; return; }
      while (true) {
        if (object) {
          white();
          const key = string();
          requireThat(!keys.has(key), 'duplicate_json_member');
          keys.add(key);
          white(); requireThat(text[i++] === ':', 'invalid_json');
        }
        value(depth + 1); white();
        if (text[i] === close) { i++; return; }
        requireThat(text[i++] === ',', 'invalid_json');
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    requireThat(token, 'invalid_json');
    i += token[0].length;
  }
  value(0); white(); requireThat(i === text.length, 'invalid_json');
  return JSON.parse(text);
}
export function parseRecoveryKey(text) {
  requireThat(typeof text === 'string' && /^pny1-[0-9a-f]{64}$/.test(text.trim()), 'invalid_recovery_key');
  return Buffer.from(text.trim().slice(5), 'hex');
}
export function generateRecoveryKey() { return `pny1-${randomBytes(32).toString('hex')}`; }
export function canonicalBase64(value, size) {
  requireThat(typeof value === 'string' && value.length % 4 === 0, 'invalid_base64');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const end = value.length - padding;
  for (let index = 0; index < end; index++) {
    const c = value.charCodeAt(index);
    requireThat(c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57 || c === 43 || c === 47, 'invalid_base64');
  }
  const result = Buffer.from(value, 'base64');
  requireThat(result.toString('base64') === value && (size === undefined || result.length === size), 'invalid_base64');
  return result;
}
const base64 = canonicalBase64;
export function validateEnvelope(value) {
  exactKeys(value, ['formatVersion', 'algorithm', 'nonce', 'ciphertext', 'tag']);
  requireThat(value.formatVersion === 1 && value.algorithm === 'AES-256-GCM', 'unsupported_envelope');
  base64(value.nonce, 12); base64(value.tag, 16);
  const ciphertext = base64(value.ciphertext);
  requireThat(ciphertext.length > 0 && ciphertext.length <= limits.plaintextBytes, 'ciphertext_limit');
  return value;
}
// Fixture generation supplies a fixed nonce through this exported test helper.
// Production native encryption always obtains fresh random nonces from the OS.
export function sealForTest(snapshot, recoveryText, nonce = randomBytes(12)) {
  const plaintext = Buffer.from(JSON.stringify(validateSnapshot(snapshot)), 'utf8');
  requireExportCapacity(plaintext.length);
  requireThat(nonce.length === 12, 'invalid_nonce');
  const cipher = createCipheriv('aes-256-gcm', parseRecoveryKey(recoveryText), nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = { formatVersion: 1, algorithm: 'AES-256-GCM', nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  requireThat(Buffer.byteLength(JSON.stringify(envelope)) <= limits.envelopeBytes, 'envelope_limit');
  return envelope;
}
export function sealBackup(snapshot, recoveryText) {
  return sealForTest(snapshot, recoveryText, randomBytes(12));
}
export function openBackup(bytes, recoveryText) {
  const envelope = validateEnvelope(parseStrictJSON(bytes, limits.envelopeBytes));
  const decipher = createDecipheriv('aes-256-gcm', parseRecoveryKey(recoveryText), base64(envelope.nonce, 12), { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(base64(envelope.tag, 16));
  const plaintext = Buffer.concat([decipher.update(base64(envelope.ciphertext)), decipher.final()]);
  return validateSnapshot(parseStrictJSON(plaintext, limits.plaintextBytes));
}
