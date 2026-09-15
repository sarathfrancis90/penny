import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, statSync, readdirSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireReceipts, collectReceiptEvidence, readOriginal, limits } from './acquire-legacy-receipts.mjs';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certificate = publicKey.export({ type: 'spki', format: 'pem' });
const project = 'penny-test', userId = 'public-user', bucket = 'penny-test.appspot.com';
const instant = '2026-09-13T12:00:00.000000Z', start = Date.parse(instant);
const document = `projects/${project}/databases/(default)/documents/expenses/e1`, object = `receipts/${userId}/example.png`;
const png = readFileSync(new URL('../../packages/offline-contract/fixtures/receipt.png', import.meta.url));
const hash = (b, kind = 'sha256', encoding = 'hex') => createHash(kind).update(b).digest(encoding);
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function token(changes = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'public-test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, aud: project, iss: `https://securetoken.google.com/${project}`, iat: start / 1000 - 1, auth_time: start / 1000 - 1, exp: start / 1000 + 3600, ...changes })).toString('base64url');
  const body = `${header}.${payload}`; return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
function inputs(mutateSource = () => {}, mutateMap = () => {}) {
  const reference = { stringValue: 'https://untrusted.invalid/receipt?token=NEVER-COPY-OR-FETCH' };
  const source = { format: 'penny-legacy-raw-evidence-v1', project, userId, database: '(default)', readTime: instant, scope: { ownerQueriesExhausted: true }, collections: [{ collection: 'expenses', queryExhausted: true, pages: [{ request: { readTime: instant }, response: [{ document: { name: document, createTime: instant, updateTime: instant, fields: { userId: { stringValue: userId }, receiptUrl: reference } } }] }] }], receiptReferences: [{ document, source: reference, status: 'unresolved_not_downloaded' }] };
  mutateSource(source); const sourceBytes = Buffer.from(JSON.stringify(source));
  const mapping = { format: 'penny-legacy-receipt-map-v1', project, userId, bucket, readTime: instant, sourceSha256: hash(sourceBytes), receipts: [{ document, object }] };
  mutateMap(mapping); return { sourceBytes, mappingBytes: Buffer.from(JSON.stringify(mapping)) };
}
function fake({ mutate = () => {}, original = png } = {}) {
  const calls = [], clock = { value: start }; let metadataReads = 0;
  return { calls, clock, now: () => clock.value, fetchImpl: async (url, init) => {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    if (url.startsWith('https://www.googleapis.com/robot/')) { assert.equal(init.headers, undefined); return json({ 'public-test': certificate }); }
    assert.ok(url.startsWith(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/receipts%2F${userId}%2F`));
    assert.ok(init.headers.Authorization.startsWith('Firebase ')); assert.equal(url.includes('token='), false); assert.equal(url.includes('generation='), false); calls.push(url);
    const media = url.endsWith('?alt=media');
    const meta = { bucket, name: decodeURIComponent(url.split('/o/')[1]), generation: '1234567890123456789', metageneration: '1', size: String(original.length), md5Hash: hash(original, 'md5', 'base64'), timeCreated: instant, updated: instant, contentType: 'image/png', downloadTokens: 'SECRET-DOWNLOAD-TOKEN', metadata: { secret: 'NEVER-PERSIST' } };
    if (!media) metadataReads++;
    const response = mutate({ media, ordinal: metadataReads, meta, clock, calls, init });
    return response ?? (media ? new Response(original) : json(meta));
  } };
}
const options = (overrides = {}) => ({ project, userId, bucket, token: token(), ...inputs(), ...overrides });
test('authentic bounded current object with two metadata reads, exact original, no tokens/URLs copied', async () => {
  const transport = fake(), result = await collectReceiptEvidence(options(), transport);
  assert.equal(transport.calls.length, 3); const receipt = result.receipts[0];
  assert.deepEqual(Buffer.from(receipt.originalBase64, 'base64'), png); assert.equal(receipt.sha256, hash(png));
  assert.deepEqual(receipt.before, receipt.after); assert.equal(receipt.before.generation, '1234567890123456789');
  assert.equal(result.totals.originalBytes, png.length); assert.equal(result.scope.storageSnapshotConsistent, false); assert.equal(result.scope.migrationReady, false); assert.equal(result.scope.sourceExportReauthenticated, false);
  assert.equal(JSON.stringify(result).includes('SECRET'), false); assert.equal(JSON.stringify(result).includes('NEVER'), false);
});
test('explicit mapping requires exact source owner, digest, coverage and canonical configured namespace', async () => {
  const mutations = [m => { m.bucket = 'foreign'; }, m => { m.sourceSha256 = '0'.repeat(64); }, m => { m.receipts = []; }, m => { m.receipts.push(m.receipts[0]); }, m => { m.receipts[0].document = document + 'x'; }, ...['receipts/foreign/x.png', `receipts/${userId}/x/y.png`, `receipts/${userId}/..`, `receipts/${userId}/x%2Fy`, 'https://evil.invalid/x', `receipts/${userId}/x\\y`].map(path => m => { m.receipts[0].object = path; }), m => { m.receipts[0].extra = true; }];
  for (const mutation of mutations) { const t = fake(); await assert.rejects(collectReceiptEvidence(options(inputs(undefined, mutation)), t)); assert.equal(t.calls.length, 0); }
  for (const mutation of [s => { s.userId = 'foreign'; }, s => { s.collections[0].pages[0].response[0].document.fields.userId.stringValue = 'foreign'; }, s => { s.receiptReferences = []; }, s => { s.collections[0].pages[0].request.readTime = '2026-09-12T12:00:00Z'; }]) await assert.rejects(collectReceiptEvidence(options(inputs(mutation)), fake()));
});
test('duplicate object references download once; null references require no acquisition', async () => {
  const io = inputs(s => {
    const second = structuredClone(s.collections[0].pages[0].response[0]); second.document.name += '2'; s.collections[0].pages[0].response.push(second);
    s.receiptReferences.push({ ...s.receiptReferences[0], document: second.document.name });
    const empty = structuredClone(second); empty.document.name += '3'; empty.document.fields.receiptUrl = { nullValue: null }; s.collections[0].pages[0].response.push(empty);
    s.receiptReferences.push({ document: empty.document.name, source: { nullValue: null }, status: 'unresolved_not_downloaded' });
  }, m => { m.receipts.push({ document: document + '2', object }); });
  const result = await collectReceiptEvidence(options(io), fake()); assert.deepEqual(result.totals, { objects: 1, references: 2, originalBytes: png.length });
});
test('wrong identity and expiry prevent storage reads or publication after a completed media response', async () => {
  for (const changes of [{ sub: 'foreign' }, { aud: 'foreign' }, { exp: start / 1000 }]) { const t = fake(); await assert.rejects(collectReceiptEvidence(options({ token: token(changes) }), t)); assert.equal(t.calls.length, 0); }
  const t = fake({ mutate: ({ media, clock }) => { if (media) clock.value += 3600001; } });
  await assert.rejects(collectReceiptEvidence(options(), t), /deadline|expired/);
});
test('metadata identity, checksum, encoding, type, size and later-than-T are strict', async () => {
  const mutations = [m => { m.bucket = 'foreign'; }, m => { m.name = 'receipts/foreign/x'; }, m => { m.generation = 123; }, m => { m.metageneration = '01'; }, m => { m.size = String(limits.originalBytes + 1); }, m => { m.size = '0'; }, m => { delete m.md5Hash; }, m => { m.md5Hash = 'bad'; }, m => { m.contentEncoding = 'gzip'; }, m => { m.contentType = 'application/pdf'; }, m => { m.timeCreated = '2026-09-14T00:00:00Z'; }, m => { m.updated = '2026-09-13T12:00:00.000001Z'; }];
  for (const mutation of mutations) { const t = fake({ mutate: ({ meta, media }) => { if (!media) mutation(meta); } }); await assert.rejects(collectReceiptEvidence(options(), t)); assert.equal(t.calls.length, 1); }
});
test('changed generation/metageneration/metadata, missing after-read and body mismatch all reject', async () => {
  for (const mutation of [m => { m.generation = '2'; }, m => { m.metageneration = '2'; }, m => { m.contentType = 'image/jpeg'; }, m => { m.md5Hash = Buffer.alloc(16).toString('base64'); }]) await assert.rejects(collectReceiptEvidence(options(), fake({ mutate: ({ ordinal, media, meta }) => { if (!media && ordinal === 2) mutation(meta); } })), /object_changed/);
  await assert.rejects(collectReceiptEvidence(options(), fake({ mutate: ({ ordinal, media }) => !media && ordinal === 2 ? new Response('', { status: 404 }) : undefined })), /http_failure/);
  const damaged = Buffer.from(png); damaged[0] ^= 1;
  await assert.rejects(collectReceiptEvidence(options(), fake({ mutate: ({ media }) => media ? new Response(damaged) : undefined })), /md5_mismatch/);
});
test('media EOF, status, redirects, transformed bytes, bounds and abort are checked independently', async () => {
  const responses = [new Response(png.subarray(1)), new Response(Buffer.concat([png, Buffer.from([0])])), new Response(png, { status: 206 }), new Response('', { status: 302 }), new Response(png, { headers: { 'content-encoding': 'gzip' } }), new Response(png, { headers: { 'content-length': '999' } }), new Response(png, { headers: { 'content-range': 'bytes 0-1/10' } })];
  for (const response of responses) await assert.rejects(readOriginal('https://example.invalid', {}, png.length, { fetchImpl: async () => response }));
  const partial = new ReadableStream({ start(c) { c.enqueue(png.subarray(0, 4)); c.error(new Error('interrupted')); } });
  await assert.rejects(readOriginal('https://example.invalid', {}, png.length, { fetchImpl: async () => new Response(partial) }));
  let aborted = false;
  await assert.rejects(readOriginal('https://example.invalid', {}, 1, { deadline: Date.now() + 20, fetchImpl: async (_u, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); })) })); assert.equal(aborted, true);
});
test('10 MiB originals are acquired intact; aggregate ceiling refuses before another media read', async () => {
  const big = Buffer.alloc(limits.originalBytes, 42), t = fake({ original: big });
  const single = await collectReceiptEvidence(options(), t); assert.equal(single.totals.originalBytes, big.length); assert.equal(Buffer.from(single.receipts[0].originalBase64, 'base64').length, big.length);
  const io = inputs(s => { const frame = structuredClone(s.collections[0].pages[0].response[0]); frame.document.name += '2'; s.collections[0].pages[0].response.push(frame); s.receiptReferences.push({ ...s.receiptReferences[0], document: frame.document.name }); }, m => { m.receipts.push({ document: document + '2', object: object + '2' }); });
  const second = fake({ original: big }); await assert.rejects(collectReceiptEvidence(options(io), second), /aggregate_limit/); assert.equal(second.calls.filter(u => u.endsWith('?alt=media')).length, 1);
});
test('exclusive private publication and failure cleanup preserve all preexisting files', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'penny-receipts-'))), output = join(dir, 'bundle.json');
  const tokenFile = join(dir, 'token'), sourceFile = join(dir, 'raw.json'), mappingFile = join(dir, 'mapping.json');
  try {
    const io = inputs(); for (const [path, bytes] of [[tokenFile, token()], [sourceFile, io.sourceBytes], [mappingFile, io.mappingBytes]]) writeFileSync(path, bytes, { mode: 0o600 });
    const args = { project, userId, bucket, tokenFile, sourceFile, mappingFile, output };
    await assert.rejects(acquireReceipts(args, fake({ mutate: ({ media, ordinal }) => !media && ordinal === 2 ? new Response('', { status: 403 }) : undefined })));
    assert.deepEqual(readdirSync(dir).sort(), ['mapping.json', 'raw.json', 'token']);
    await acquireReceipts(args, fake()); const original = readFileSync(output); assert.equal(statSync(output).mode & 0o777, 0o600);
    await assert.rejects(acquireReceipts(args, fake())); assert.deepEqual(readFileSync(output), original); assert.equal(readdirSync(dir).some(n => n.endsWith('.stage')), false);
    const link = join(dir, 'source-link'); symlinkSync(sourceFile, link); await assert.rejects(acquireReceipts({ ...args, sourceFile: link }, fake()));
    chmodSync(mappingFile, 0o644); await assert.rejects(acquireReceipts(args, fake())); chmodSync(mappingFile, 0o600);
    chmodSync(dir, 0o755); await assert.rejects(acquireReceipts({ ...args, output: join(dir, 'new.json') }, fake()), /unsafe_output_directory/);
    assert.deepEqual(readFileSync(output), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
