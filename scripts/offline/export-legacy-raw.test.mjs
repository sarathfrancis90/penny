import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, chmodSync, symlinkSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { collectRawEvidence, collections, exportRaw, publishEvidence, requestJSON } from './export-legacy-raw.mjs';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certificate = publicKey.export({ type: 'spki', format: 'pem' });
const project = 'penny-test', userId = 'public-user', instant = '2026-09-13T12:00:00.000000Z';
const start = Date.parse(instant), base = `projects/${project}/databases/(default)/documents`;
const token = (changes = {}) => { const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'public-test-key', typ: 'JWT' })).toString('base64url'); const payload = Buffer.from(JSON.stringify({ sub: userId, aud: project, iss: `https://securetoken.google.com/${project}`, iat: start / 1000 - 60, auth_time: start / 1000 - 100, exp: start / 1000 + 3600, ...changes })).toString('base64url'); const body = `${header}.${payload}`; return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`; };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function transport({ mutate = () => {}, clock = { time: start } } = {}) {
  const calls = [];
  const documents = [0, 1, 2].map(i => ({ name: `${base}/expenses/e${i}`, fields: { userId: { stringValue: userId }, amount: { integerValue: '9223372036854775807' }, unsupported: { mapValue: { fields: { history: { arrayValue: { values: [{ stringValue: 'retain me' }] } } } } }, ...(i === 0 ? { receiptUrl: { stringValue: 'https://untrusted.invalid/token?secret=do-not-fetch' }, groupId: { stringValue: 'group' } } : {}) }, createTime: instant, updateTime: instant }));
  return { calls, clock, fetchImpl: async (url, init) => {
    assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    if (url.startsWith('https://www.googleapis.com/robot/')) { assert.equal(init.method, 'GET'); assert.equal(init.headers, undefined); return json({ 'public-test-key': certificate }); }
    assert.equal(url, `https://firestore.googleapis.com/v1/${base}:runQuery`); assert.equal(init.method, 'POST');
    assert.ok(init.headers.Authorization.startsWith('Bearer '));
    const body = JSON.parse(init.body), q = body.structuredQuery; calls.push(body);
    assert.deepEqual(q.where.fieldFilter, { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } });
    const collection = q.from[0].collectionId, cursor = q.startAt?.values[0].referenceValue;
    if (cursor) assert.equal(q.startAt.before, false);
    const docs = (collection === 'expenses' ? documents.filter(d => !cursor || d.name > cursor) : []).slice(0, q.limit);
    const frames = docs.length ? docs.map(document => ({ document: structuredClone(document), readTime: instant })) : [{ readTime: instant }];
    const replacement = mutate({ body, frames, calls, clock });
    return replacement ?? json(frames);
  }, now: () => clock.time };
}
const options = () => ({ project, userId, token: token() });
test('fixed-time pagination preserves unsupported/group values, exact integer strings and unresolved URLs', async () => {
  const fake = transport(), result = await collectRawEvidence(options(), { ...fake, pageSize: 2 });
  assert.equal(result.scope.fullAccountExport, false); assert.equal(result.scope.migrationReady, false);
  assert.equal(result.collections.length, collections.length); assert.equal(result.totals.documents, 3);
  assert.equal(result.collections[0].pages.length, 2); assert.equal(result.receiptReferences.length, 1);
  assert.equal(result.collections[0].pages[0].response[0].document.fields.amount.integerValue, '9223372036854775807');
  assert.equal(result.collections[0].pages[0].response[0].document.fields.unsupported.mapValue.fields.history.arrayValue.values[0].stringValue, 'retain me');
  assert.ok(result.quarantined.some(x => x.reason === 'group_evidence_not_personal_migration'));
  assert.ok(fake.calls.slice(1).every(x => x.readTime === instant)); assert.equal(fake.calls[0].readTime, undefined);
});
test('an exactly full final page requires an explicit subsequent empty query', async () => {
  const result = await collectRawEvidence(options(), { ...transport(), pageSize: 3 });
  assert.equal(result.collections[0].pages.length, 2);
  assert.equal(result.collections[0].pages[1].count, 0);
  assert.equal(result.collections[0].pages[1].request.structuredQuery.startAt.values[0].referenceValue, `${base}/expenses/e2`);
});
test('rejects missing/backwards read times, foreign owner/path, duplicates and malformed typed values', async () => {
  const mutations = [
    f => { delete f.readTime; }, f => { f.readTime = '2026-09-13T11:59:59.999999Z'; },
    f => { f.document.fields.userId.stringValue = 'someone-else'; }, f => { f.document.name = `${base}/expenses/x/y`; },
    f => { f.document.fields.amount.integerValue = '9223372036854775808'; }, f => { f.skippedResults = 1; },
  ];
  for (const mutate of mutations) {
    const fake = transport({ mutate: ({ body, frames }) => { if (body.readTime && frames[0].document) mutate(frames[0]); } });
    await assert.rejects(collectRawEvidence(options(), fake));
  }
  const fake = transport({ mutate: ({ body, frames }) => { if (body.readTime && frames.length > 1) frames[1] = frames[0]; } });
  await assert.rejects(collectRawEvidence(options(), fake), /cursor_order/);
});
test('monotonic response readTimes are accepted while all requests and document versions stay at T', async () => {
  const fake = transport({ mutate: ({ body, frames }) => { if (body.readTime) frames.forEach((f, i) => { f.readTime = `2026-09-13T12:00:00.00000${i + 1}Z`; }); } });
  const result = await collectRawEvidence(options(), fake);
  assert.equal(result.readTime, instant); assert.ok(fake.calls.slice(1).every(x => x.readTime === instant));
  const future = transport({ mutate: ({ body, frames }) => { if (body.readTime && frames[0].document) { frames[0].readTime = '2026-09-13T12:00:00.000001Z'; frames[0].document.updateTime = frames[0].readTime; } } });
  await assert.rejects(collectRawEvidence(options(), future), /document_time/);
});
test('token signature, identity, audience and expiry are checked before data or between pages', async () => {
  for (const changes of [{ sub: 'foreign' }, { aud: 'wrong-project' }, { exp: start / 1000 }, { iat: start / 1000 + 10 }, { auth_time: start / 1000 + 10 }, { nbf: start / 1000 + 10 }]) {
    const fake = transport(); await assert.rejects(collectRawEvidence({ ...options(), token: token(changes) }, fake)); assert.equal(fake.calls.length, 0);
  }
  const bad = token().split('.'); bad[2] = Buffer.alloc(256).toString('base64url');
  await assert.rejects(collectRawEvidence({ ...options(), token: bad.join('.') }, transport()));
  const fake = transport({ mutate: ({ body, clock }) => { if (body.readTime) clock.time += 3600001; } });
  await assert.rejects(collectRawEvidence(options(), fake), /expired|deadline/);
});
test('unavailable collections and truncated responses abort instead of becoming empty/complete', async () => {
  for (const response of [() => new Response('denied', { status: 403 }), () => new Response('[{"readTime":', { headers: { 'content-type': 'application/json' } })]) {
    const fake = transport({ mutate: ({ body }) => body.structuredQuery.from[0].collectionId === 'savings_contributions' ? response() : undefined });
    await assert.rejects(collectRawEvidence(options(), fake));
  }
});
test('HTTP rejects redirects, content-length and streamed size overrun, expired deadline', async () => {
  await assert.rejects(requestJSON('https://example.invalid', {}, { fetchImpl: async () => new Response('', { status: 302, headers: { location: 'https://foreign.invalid' } }) }));
  await assert.rejects(requestJSON('https://example.invalid', {}, { maximum: 3, fetchImpl: async () => json({ large: true }) }));
  await assert.rejects(requestJSON('https://example.invalid', {}, { maximum: 3, fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '99' } }) }));
  let aborted = false;
  await assert.rejects(requestJSON('https://example.invalid', {}, { deadline: Date.now() + 20, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true })) }));
  assert.equal(aborted, true);
  await assert.rejects(requestJSON('https://example.invalid', {}, { now: () => 1, deadline: 0, fetchImpl: async () => { throw new Error('must not call'); } }), /deadline/);
});
test('private exclusive output; no output on partial query failure; unsafe token/output rejected', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'penny-raw-'))), output = join(dir, 'raw.json'), tokenFile = join(dir, 'token');
  try {
    writeFileSync(tokenFile, token(), { mode: 0o600 });
    const fake = transport({ mutate: ({ body }) => body.structuredQuery.from[0].collectionId === 'budgets_personal' ? new Response('', { status: 403 }) : undefined });
    await assert.rejects(exportRaw({ project, userId, tokenFile, output }, fake)); assert.equal(existsSync(output), false);
    await exportRaw({ project, userId, tokenFile, output }, transport());
    const bytes = readFileSync(output); assert.equal(statSync(output).mode & 0o777, 0o600); assert.equal(bytes.includes(Buffer.from(token())), false);
    assert.throws(() => publishEvidence(output, { overwrite: true })); assert.deepEqual(readFileSync(output), bytes);
    assert.deepEqual(readdirSync(dir).sort(), ['raw.json', 'token']);
    const link = join(dir, 'link'); symlinkSync(output, link); assert.throws(() => publishEvidence(link, {})); assert.deepEqual(readFileSync(output), bytes);
    const tokenLink = join(dir, 'token-link'); symlinkSync(tokenFile, tokenLink);
    await assert.rejects(exportRaw({ project, userId, tokenFile: tokenLink, output: join(dir, 'other') }, transport()));
    chmodSync(tokenFile, 0o644); await assert.rejects(exportRaw({ project, userId, tokenFile, output: join(dir, 'other') }, transport()));
    chmodSync(dir, 0o755); assert.throws(() => publishEvidence(join(dir, 'public'), {}), /unsafe_output/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('a FIFO token path is rejected before it can block waiting for a writer', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'penny-raw-fifo-')));
  try {
    const fifo = join(dir, 'token'), output = join(dir, 'raw.json');
    execFileSync('mkfifo', ['-m', '600', fifo]);
    const result = spawnSync(process.execPath, ['scripts/offline/export-legacy-raw.mjs', '--project', project, '--user', userId, '--token-file', fifo, '--output', output], { encoding: 'utf8', timeout: 2000 });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.equal(existsSync(output), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
