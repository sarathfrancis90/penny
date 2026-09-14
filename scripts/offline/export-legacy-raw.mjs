// Read-only legacy evidence acquisition. Never a native restore or API bootstrap page.
import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync, readSync, writeFileSync, fsyncSync, linkSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { parseStrictJSON } from '../../packages/offline-contract/contract.mjs';

export const collections = Object.freeze(['expenses', 'budgets_personal', 'income_sources_personal', 'savings_goals_personal', 'savings_contributions', 'monthly_income_records', 'monthly_savings_summary', 'budget_allocation_history', 'monthly_setup_status', 'groupMembers']);
export const limits = Object.freeze({ page: 100, pages: 1000, documents: 50000, responseBytes: 4 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, tokenBytes: 16384, requestMs: 30000, durationMs: 15 * 60 * 1000 });
const certificatesURL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const ensure = (ok, code) => { if (!ok) throw new Error(code); };
const hash = data => createHash('sha256').update(data).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) { ensure(object(value) && Object.keys(value).every(k => allowed.includes(k)), 'unexpected_response_shape'); }
function timestamp(value) {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value), 'invalid_timestamp');
  const date = new Date(value); ensure(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19), 'invalid_timestamp');
  const fraction = /\.(\d+)Z$/.exec(value)?.[1] ?? '';
  return BigInt(Date.parse(`${value.slice(0, 19)}Z`)) * 1000000n + BigInt(fraction.padEnd(9, '0'));
}
function typed(value, depth = 0) {
  ensure(depth <= 24 && object(value) && Object.keys(value).length === 1, 'invalid_firestore_value');
  const [kind, v] = Object.entries(value)[0];
  switch (kind) {
    case 'nullValue': ensure(v === null || v === 'NULL_VALUE', 'invalid_null'); break;
    case 'stringValue': case 'referenceValue': ensure(typeof v === 'string', 'invalid_string'); break;
    case 'booleanValue': ensure(typeof v === 'boolean', 'invalid_boolean'); break;
    case 'integerValue': ensure(typeof v === 'string' && /^-?(0|[1-9]\d*)$/.test(v) && v.length <= 20 && BigInt(v) >= -(1n << 63n) && BigInt(v) < (1n << 63n), 'invalid_integer'); break;
    case 'doubleValue': ensure((typeof v === 'number' && Number.isFinite(v)) || ['NaN', 'Infinity', '-Infinity'].includes(v), 'invalid_double'); break;
    case 'timestampValue': timestamp(v); break;
    case 'bytesValue': ensure(typeof v === 'string' && Buffer.from(v, 'base64').toString('base64') === v, 'invalid_base64'); break;
    case 'geoPointValue': keys(v, ['latitude', 'longitude']); ensure(typeof v.latitude === 'number' && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90 && typeof v.longitude === 'number' && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180, 'invalid_geopoint'); break;
    case 'arrayValue': keys(v, ['values']); ensure(v.values === undefined || Array.isArray(v.values), 'invalid_array'); for (const item of v.values ?? []) typed(item, depth + 1); break;
    case 'mapValue': keys(v, ['fields']); ensure(v.fields === undefined || object(v.fields), 'invalid_map'); for (const item of Object.values(v.fields ?? {})) typed(item, depth + 1); break;
    default: throw new Error('unknown_firestore_value_type');
  }
}
export async function requestJSON(url, init, { fetchImpl = fetch, maximum = limits.responseBytes, now = Date.now, deadline = now() + limits.requestMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(limits.requestMs, Math.max(1, deadline - now())));
  try {
    ensure(now() < deadline, 'export_deadline');
    const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
    ensure(response.ok && !response.redirected && (response.url === '' || response.url === url), 'http_failure');
    ensure(/^application\/json\b/i.test(response.headers.get('content-type') ?? ''), 'non_json_response');
    const declared = response.headers.get('content-length');
    if (declared !== null) ensure(/^\d+$/.test(declared) && Number(declared) <= maximum, 'response_limit');
    ensure(response.body, 'missing_body'); const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; ensure(bytes <= maximum && now() < deadline, 'response_limit_or_deadline'); chunks.push(chunk); }
    ensure(now() < deadline, 'export_deadline'); const raw = Buffer.concat(chunks);
    return { value: parseStrictJSON(raw, maximum), bytes: raw.length, sha256: hash(raw) };
  } finally { clearTimeout(timer); controller.abort(); }
}
async function identity(token, project, userId, transport) {
  ensure(typeof token === 'string' && token.length <= limits.tokenBytes && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), 'invalid_token');
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  for (const part of [encodedHeader, encodedPayload, signature]) ensure(Buffer.from(part, 'base64url').toString('base64url') === part, 'noncanonical_token');
  const header = parseStrictJSON(Buffer.from(encodedHeader, 'base64url'), limits.tokenBytes);
  const payload = parseStrictJSON(Buffer.from(encodedPayload, 'base64url'), limits.tokenBytes);
  ensure(!Object.hasOwn(header, 'crit') && !Object.hasOwn(header, 'b64') && (header.typ === undefined || header.typ === 'JWT') && header.alg === 'RS256' && typeof header.kid === 'string' && header.kid.length <= 200, 'invalid_token_header');
  const certs = (await requestJSON(certificatesURL, { method: 'GET' }, { ...transport, maximum: 100000 })).value;
  ensure(object(certs) && Object.hasOwn(certs, header.kid) && typeof certs[header.kid] === 'string', 'unknown_signing_key');
  const signingKey = createPublicKey(certs[header.kid]);
  ensure(signingKey.asymmetricKeyType === 'rsa' && signingKey.asymmetricKeyDetails.modulusLength >= 2048, 'invalid_signing_key');
  ensure(verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), signingKey, Buffer.from(signature, 'base64url')), 'invalid_signature');
  ensure(payload.aud === project && payload.iss === `https://securetoken.google.com/${project}`, 'token_project_mismatch');
  ensure(payload.sub === userId && typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 128, 'identity_mismatch');
  function check() {
    const seconds = Math.floor(transport.now() / 1000);
    ensure(Number.isSafeInteger(payload.exp) && payload.exp > seconds && Number.isSafeInteger(payload.iat) && payload.iat >= 0 && payload.iat <= seconds && Number.isSafeInteger(payload.auth_time) && payload.auth_time >= 0 && payload.auth_time <= seconds && (payload.nbf === undefined || (Number.isSafeInteger(payload.nbf) && payload.nbf <= seconds)), 'token_expired_or_invalid');
  }
  check(); return check;
}
function query(collection, userId, cursor, pageSize) {
  return { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: pageSize, ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}) } };
}
export async function collectRawEvidence({ project, userId, token, database = '(default)' }, { fetchImpl = fetch, now = Date.now, pageSize = limits.page } = {}) {
  ensure(typeof project === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project), 'invalid_project');
  ensure(typeof userId === 'string' && userId.length >= 1 && userId.length <= 128 && ![...userId].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127 || c === '/'), 'invalid_user');
  ensure(database === '(default)', 'unsupported_database');
  ensure(Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= limits.page, 'invalid_page_size');
  const started = now(), deadline = started + limits.durationMs, transport = { fetchImpl, now, deadline };
  const checkIdentity = await identity(token, project, userId, transport);
  const base = `projects/${project}/databases/${database}/documents`, endpoint = `https://firestore.googleapis.com/v1/${base}:runQuery`;
  let receivedBytes = 0, documentCount = 0, pages = 0;
  async function run(body, collection, readTime = null, cursor = null) {
    checkIdentity(); ensure(++pages <= limits.pages, 'page_limit');
    const response = await requestJSON(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, transport);
    checkIdentity(); receivedBytes += response.bytes; ensure(receivedBytes <= limits.totalBytes, 'aggregate_limit');
    const frames = response.value; ensure(Array.isArray(frames) && frames.length > 0, 'invalid_query_stream');
    const documents = []; let last = cursor, finalTime, precedingTime = readTime ? timestamp(readTime) : null;
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index]; keys(frame, ['document', 'readTime', 'skippedResults', 'done']);
      const time = timestamp(frame.readTime); finalTime = frame.readTime;
      ensure(precedingTime === null || time >= precedingTime, 'inconsistent_read_time'); precedingTime = time;
      ensure(frame.skippedResults === undefined || frame.skippedResults === 0, 'skipped_results');
      ensure(frame.done === undefined || (frame.done === true && index === frames.length - 1), 'invalid_done');
      if (frame.document === undefined) continue;
      const doc = frame.document; keys(doc, ['name', 'fields', 'createTime', 'updateTime']);
      const prefix = `${base}/${collection}/`;
      ensure(typeof doc.name === 'string' && doc.name.startsWith(prefix) && doc.name.length > prefix.length && !doc.name.slice(prefix.length).includes('/'), 'document_scope');
      ensure(last === null || Buffer.compare(Buffer.from(last), Buffer.from(doc.name)) < 0, 'cursor_order'); last = doc.name;
      ensure(object(doc.fields) && doc.fields.userId?.stringValue === userId, 'owner_mismatch');
      for (const value of Object.values(doc.fields)) typed(value);
      ensure(timestamp(doc.createTime) <= timestamp(doc.updateTime) && timestamp(doc.updateTime) <= (readTime ? timestamp(readTime) : time), 'document_time');
      documents.push(doc);
    }
    ensure(documents.length <= body.structuredQuery.limit, 'page_overflow');
    return { request: body, response: frames, responseSha256: response.sha256, responseBytes: response.bytes, finalTime, cursor: last, count: documents.length };
  }
  // Probe only selects a server time; every exported collection is then reread at T.
  const probe = await run(query('expenses', userId, null, 1), 'expenses');
  const readTime = probe.finalTime, time = timestamp(readTime);
  ensure(time % 1000n === 0n && time <= BigInt(now()) * 1000000n && time >= BigInt(now() - 60 * 60 * 1000) * 1000000n, 'read_time_outside_window');
  const results = [], receiptReferences = [], quarantined = [];
  for (const collection of collections) {
    let cursor = null, count = 0; const trace = [];
    for (;;) {
      ensure(now() - started < limits.durationMs, 'export_deadline');
      const page = await run({ ...query(collection, userId, cursor, pageSize), readTime }, collection, readTime, cursor);
      trace.push(page); count += page.count; documentCount += page.count; ensure(documentCount <= limits.documents, 'document_limit');
      for (const frame of page.response) if (frame.document) {
        const doc = frame.document, f = doc.fields;
        if (f.groupId !== undefined || f.groupMetadata !== undefined || f.expenseType?.stringValue === 'group' || f.isGroupExpense?.booleanValue === true || collection === 'groupMembers') quarantined.push({ document: doc.name, reason: 'group_evidence_not_personal_migration' });
        if (collection === 'expenses' && f.expenseType?.stringValue !== 'personal') quarantined.push({ document: doc.name, reason: 'expense_type_requires_review' });
        if (collection === 'expenses' && f.receiptUrl !== undefined) receiptReferences.push({ document: doc.name, source: f.receiptUrl, status: 'unresolved_not_downloaded' });
      }
      if (page.count < pageSize) break;
      ensure(page.cursor !== cursor, 'cursor_not_advancing'); cursor = page.cursor;
    }
    results.push({ collection, ownerField: 'userId', queryExhausted: true, documentCount: count, pages: trace });
  }
  checkIdentity(); ensure(now() < deadline, 'export_deadline');
  return { format: 'penny-legacy-raw-evidence-v1', project, database, userId, readTime, startedAt: new Date(started).toISOString(), finishedAt: new Date(now()).toISOString(),
    scope: { collections: [...collections], ownerQueriesExhausted: true, fullAccountExport: false, migrationReady: false, storageSnapshotConsistent: false, omitted: ['other owners group records', 'unlisted collections/subcollections', 'device-only or unsynced records', 'receipt bytes'] },
    totals: { documents: documentCount, requests: pages, responseBytes: receivedBytes, unresolvedReceipts: receiptReferences.length }, probe, collections: results, receiptReferences, quarantined };
}
function privateFile(file, maximum) {
  // A FIFO must not block before fstat can reject nonregular inputs.
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd); ensure(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && stat.nlink === 1 && stat.size <= maximum, 'unsafe_token_file');
    const bytes = Buffer.alloc(maximum + 1); let count = 0;
    try {
      while (count < bytes.length) { const got = readSync(fd, bytes, count, bytes.length - count, null); if (got === 0) break; count += got; }
      const after = fstatSync(fd);
      ensure(count <= maximum && after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs, 'token_limit_or_changed');
      return Buffer.from(bytes.subarray(0, count));
    } finally { bytes.fill(0); }
  }
  finally { closeSync(fd); }
}
export function publishEvidence(output, evidence) {
  const target = resolve(output), parent = dirname(target), parentFD = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let temporary, owned, fileFD;
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
  function removeStage() {
    if (temporary && owned) {
      let current; try { current = lstatSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (current && same(current, owned)) unlinkSync(temporary);
    }
  }
  try {
    const directory = fstatSync(parentFD);
    ensure(realpathSync(parent) === parent && directory.isDirectory() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0, 'unsafe_output_directory');
    const bytes = Buffer.from(`${JSON.stringify(evidence)}\n`); ensure(bytes.length <= limits.totalBytes * 2, 'output_limit');
    temporary = resolve(parent, `.${basename(target)}.${randomUUID()}.stage`);
    fileFD = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); owned = fstatSync(fileFD);
    writeFileSync(fileFD, bytes); fsyncSync(fileFD);
    ensure(same(lstatSync(parent), directory), 'output_directory_changed');
    linkSync(temporary, target); // Atomic, exclusive publication; never overwrites.
    unlinkSync(temporary); temporary = undefined; fsyncSync(parentFD);
  } finally {
    try { removeStage(); } finally { try { if (fileFD !== undefined) closeSync(fileFD); } finally { closeSync(parentFD); } }
  }
}
export async function exportRaw({ project, userId, tokenFile, output }, dependencies = {}) {
  const bytes = privateFile(tokenFile, limits.tokenBytes);
  let token;
  try { token = bytes.toString('utf8').trim(); } finally { bytes.fill(0); }
  const evidence = await collectRawEvidence({ project, userId, token }, dependencies);
  publishEvidence(output, evidence); return evidence.totals;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), options = {};
    ensure(args.length === 8, 'usage');
    for (let i = 0; i < args.length; i += 2) { ensure(['--project', '--user', '--token-file', '--output'].includes(args[i]) && !Object.hasOwn(options, args[i]), 'usage'); options[args[i]] = args[i + 1]; }
    const totals = await exportRaw({ project: options['--project'], userId: options['--user'], tokenFile: options['--token-file'], output: options['--output'] });
    process.stdout.write(`Read-only raw export saved: ${totals.documents} documents, ${totals.requests} requests, ${totals.unresolvedReceipts} unresolved receipt references. Not migration-ready.\n`);
  } catch { process.stderr.write('Raw export failed; no successful export is claimed. Check credentials, ownership, fixed-time queries and private output storage.\n'); process.exitCode = 1; }
}
