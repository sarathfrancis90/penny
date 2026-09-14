import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const currentCapBase = new URL('./fixtures/current-cap-v1/', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function paddedReceipt(png, length) {
  const chunk = Buffer.alloc(length - png.length);
  if (chunk.length < 12) throw new Error('Insufficient ancillary chunk space');
  chunk.writeUInt32BE(chunk.length - 12, 0);
  chunk.write('npAD', 4, 'ascii');
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
}

export function currentCapSnapshot(plan) {
  const bytes = readFileSync(new URL(plan.sourceSnapshot, currentCapBase));
  if (sha256(bytes) !== plan.sourceSnapshotSha256) throw new Error('Source fixture changed');
  const snapshot = JSON.parse(bytes);
  const png = Buffer.from(snapshot.attachments[0].dataBase64, 'base64');
  if (sha256(png) !== plan.sourceReceiptSha256) throw new Error('Source receipt changed');
  const generated = plan.expenseCount - snapshot.expenses.length;
  for (let index = 0; index < generated; index++) {
    snapshot.expenses.push({ ...plan.expenseTemplate,
      id: plan.expenseIdPrefix + String(index).padStart(12, '0'),
      merchant: plan.merchantPrefix + index });
  }
  const images = new Map();
  snapshot.attachments = plan.receiptLengths.map((length, index) => {
    if (!images.has(length)) images.set(length, paddedReceipt(png, length));
    const image = images.get(length);
    return { id: plan.receiptIdPrefix + String(index).padStart(12, '0'),
      expenseId: snapshot.expenses[index].id, mediaType: 'image/png', byteCount: length,
      sha256: sha256(image), dataBase64: image.toString('base64') };
  });
  return snapshot;
}
