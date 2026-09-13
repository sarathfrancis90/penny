import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/png-integrity-corpus.json', import.meta.url)));
test('native PNG corpus preserves exact inputs and isolates scanline/stream faults', () => {
  assert.equal(corpus.version, 1);
  assert.equal(corpus.cases.length, 24);
  assert.equal(new Set(corpus.cases.map(entry => entry.id)).size, 24);
  for (const entry of corpus.cases) {
    const bytes = Buffer.from(entry.dataBase64, 'base64');
    assert.equal(bytes.toString('base64'), entry.dataBase64, entry.id);
    assert.equal(bytes.length, entry.byteCount, entry.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.id);
    const chunks = [];
    for (let offset = 8; offset < bytes.length;) {
      const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      assert.ok(offset + size + 12 <= bytes.length, entry.id);
      if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size));
      offset += size + 12;
    }
    const compressed = Buffer.concat(chunks);
    if (entry.failure === 'truncated_zlib' || entry.failure === 'invalid_zlib_checksum') {
      assert.throws(() => inflateSync(compressed, { maxOutputLength: 4096 }), undefined, entry.id);
      continue;
    }
    const { buffer: raw, engine } = inflateSync(compressed, { maxOutputLength: 4096, info: true });
    assert.equal(raw.length, entry.expectedInflatedBytes + Number(entry.failure === 'extra_inflated_byte'), entry.id);
    assert.equal(engine.bytesWritten, compressed.length - Number(entry.failure === 'trailing_compressed_byte'), entry.id);
    const passes = entry.interlaced
      ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
      : [[0, 0, 1, 1]];
    let offset = 0, badFilters = 0;
    for (const [x, y, dx, dy] of passes) {
      const w = Math.max(0, Math.ceil((entry.width - x) / dx));
      if (!w) continue;
      for (let row = y; row < entry.height; row += dy) {
        badFilters += Number(raw[offset] > 4);
        offset += 1 + Math.ceil(w * (bytes[25] === 6 ? 4 : 1) * bytes[24] / 8);
      }
    }
    assert.equal(badFilters, Number(entry.failure === 'invalid_filter'), entry.id);
    assert.equal(entry.valid, entry.failure === null, entry.id);
  }
});
