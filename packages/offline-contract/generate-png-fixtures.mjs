// Public synthetic native decoder inputs; portable snapshot validation remains unchanged.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const u32 = value => { const data = Buffer.alloc(4); data.writeUInt32BE(value >>> 0); return data; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return Buffer.concat([u32(data.length), body, u32(crc ^ 0xffffffff)]);
}
function fixture(id, interlaced, failure = null, width = 9, height = 9, color = 6) {
  const depth = color === 3 ? 1 : 8;
  const passes = interlaced
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  const rows = [];
  for (const [x, y, dx, dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / dx));
    const h = Math.max(0, Math.ceil((height - y) / dy));
    if (!w) continue;
    for (let row = 0; row < h; row++) {
      const data = Buffer.alloc(1 + (color === 6 ? 4 * w : color === 3 ? Math.ceil(w / 8) : w));
      if (color === 6) for (let pixel = 0; pixel < w; pixel++) data.set([90, 40, 20, 255], 1 + 4 * pixel);
      rows.push(data);
    }
  }
  const expectedInflatedBytes = rows.reduce((sum, row) => sum + row.length, 0);
  // Fault the final row to catch first-scanline-only and incomplete Adam7 checks.
  if (failure === 'invalid_filter') rows.at(-1)[0] = 5;
  const raw = Buffer.concat([...rows, ...(failure === 'extra_inflated_byte' ? [Buffer.from([0])] : [])]);
  let compressed = deflateSync(raw, { level: 9 });
  if (failure === 'truncated_zlib') compressed = compressed.subarray(0, compressed.length - 1);
  if (failure === 'invalid_zlib_checksum') compressed[compressed.length - 1] ^= 1;
  if (failure === 'trailing_compressed_byte') compressed = Buffer.concat([compressed, Buffer.from([0])]);
  const bytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([depth, color, 0, 0, Number(interlaced)])])),
    ...[...compressed].map(byte => chunk('IDAT', Buffer.from([byte]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { id, valid: failure === null, failure, width, height, interlaced, expectedInflatedBytes,
    byteCount: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), dataBase64: bytes.toString('base64') };
}
function containerCase(base, id, failure, transform) {
  const bytes = Buffer.from(base.dataBase64, 'base64'), parts = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    parts.push([bytes.toString('ascii', offset + 4, offset + 8), bytes.subarray(offset + 8, offset + 8 + length)]);
    offset += length + 12;
  }
  const result = Buffer.concat([bytes.subarray(0, 8), ...transform(parts).map(([type, data]) => chunk(type, data))]);
  return { ...base, id, valid: failure === null, failure, byteCount: result.length,
    sha256: createHash('sha256').update(result).digest('hex'), dataBase64: result.toString('base64') };
}
const rgba = fixture('base', false, null, 1, 1);
const gray = fixture('gray1-valid', false, null, 1, 1, 0);
const indexed = fixture('indexed1-base', false, null, 1, 1, 3);
const palette = ['PLTE', Buffer.from([0, 0, 0, 255, 255, 255])];
const beforeData = extra => parts => [parts[0], ...extra, ...parts.slice(1)];
const cases = [
  fixture('rgba9-plain-split-idat', false),
  fixture('rgba9-adam7-split-idat', true),
  fixture('rgba1-adam7-empty-passes', true, null, 1, 1),
  ...[false, true].flatMap(interlaced => ['invalid_filter', 'extra_inflated_byte'].map(failure =>
    fixture(`rgba9-${interlaced ? 'adam7' : 'plain'}-${failure}`, interlaced, failure))),
  ...['truncated_zlib', 'invalid_zlib_checksum', 'trailing_compressed_byte'].map(failure =>
    fixture(`rgba9-plain-${failure}`, false, failure)),
  gray,
  containerCase(indexed, 'indexed1-valid-palette', null, beforeData([palette])),
  ...[
    ['invalid_chunk_name', ['a1Cd', Buffer.alloc(0)]],
    ['invalid_reserved_bit', ['abcd', Buffer.alloc(0)]],
    ['unknown_critical_chunk', ['ABCD', Buffer.alloc(0)]],
    ['stray_fctl', ['fcTL', Buffer.alloc(26)]],
    ['stray_fdat', ['fdAT', Buffer.alloc(4)]],
    ['invalid_palette_length', ['PLTE', Buffer.alloc(2)]],
    ['palette_over_capacity', ['PLTE', Buffer.alloc(771)]],
  ].map(([failure, part]) => containerCase(rgba, `container-${failure}`, failure, beforeData([part]))),
  containerCase(rgba, 'container-duplicate-palette', 'duplicate_palette', beforeData([palette, palette])),
  containerCase(rgba, 'container-late-palette', 'late_palette', parts => [...parts.slice(0, -1), palette, parts.at(-1)]),
  containerCase(gray, 'container-gray-palette', 'forbidden_gray_palette', beforeData([palette])),
  containerCase(indexed, 'container-missing-palette', 'missing_indexed_palette', parts => parts),
  containerCase(indexed, 'container-indexed-palette-capacity', 'indexed_palette_over_capacity', beforeData([['PLTE', Buffer.alloc(9)]])),
];
writeFileSync(new URL('./fixtures/png-integrity-corpus.json', import.meta.url), JSON.stringify({
  version: 1,
  scope: 'Public synthetic native image admission cases; every PNG chunk CRC is valid. Native readers preserve valid bytes and reject valid:false before saving/restoring. Node snapshot validation is not a full image decoder.',
  cases,
}, null, 2) + '\n');
