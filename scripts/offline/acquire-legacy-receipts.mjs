// Current-object evidence only. No historical generation selector or native admission.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseStrictJSON } from '../../packages/offline-contract/contract.mjs';
import { identity, privateFile, publishEvidence, requestJSON, limits as rawLimits } from './export-legacy-raw.mjs';

export const limits = Object.freeze({ originalBytes: 10 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, objects: 100, references: 1000, sourceBytes: 64 * 1024 * 1024, mappingBytes: 1024 * 1024, metadataBytes: 64 * 1024, requestMs: 30000, durationMs: 15 * 60 * 1000 });
const ensure = (ok, code) => { if (!ok) throw new Error(code); };
const digest = (kind, bytes, encoding = 'hex') => createHash(kind).update(bytes).digest(encoding);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function closed(v, fields) { ensure(object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k)), 'invalid_mapping_shape'); }
function time(v) {
  ensure(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v), 'invalid_time');
  const d = new Date(v); ensure(Number.isFinite(d.getTime()) && d.toISOString().slice(0, 19) === v.slice(0, 19), 'invalid_time');
  return BigInt(Date.parse(`${v.slice(0, 19)}Z`)) * 1000000n + BigInt((/\.(\d+)Z$/.exec(v)?.[1] ?? '').padEnd(9, '0'));
}
function component(v) { return typeof v === 'string' && v.length > 0 && v !== '.' && v !== '..' && !/[/\\%?#]/u.test(v) && ![...v].some(c => { const n = c.codePointAt(0); return n < 32 || n === 127 || (n >= 0xD800 && n <= 0xDFFF); }); }
function configuration(project, userId, bucket) {
  ensure(typeof project === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project), 'invalid_project');
  ensure(component(userId) && userId.length <= 128, 'invalid_user');
  // Deliberately a conservative configured-bucket subset, never a URL or inferred default.
  ensure(typeof bucket === 'string' && bucket.length >= 3 && bucket.length <= 222 && bucket.split('.').every(s => s.length >= 1 && s.length <= 63 && /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(s)), 'invalid_bucket');
}
function inputs(sourceBytes, mappingBytes, project, userId, bucket, now) {
  ensure(Buffer.isBuffer(sourceBytes) && sourceBytes.length <= limits.sourceBytes && Buffer.isBuffer(mappingBytes) && mappingBytes.length <= limits.mappingBytes, 'input_limit');
  const source = parseStrictJSON(sourceBytes, limits.sourceBytes), mapping = parseStrictJSON(mappingBytes, limits.mappingBytes);
  ensure(source.format === 'penny-legacy-raw-evidence-v1' && source.project === project && source.userId === userId && source.database === '(default)' && source.scope?.ownerQueriesExhausted === true, 'source_identity_or_scope');
  const readTime = time(source.readTime); ensure(readTime <= BigInt(now()) * 1000000n, 'future_source');
  closed(mapping, ['format', 'project', 'userId', 'bucket', 'readTime', 'sourceSha256', 'receipts']);
  ensure(mapping.format === 'penny-legacy-receipt-map-v1' && mapping.project === project && mapping.userId === userId && mapping.bucket === bucket && mapping.readTime === source.readTime && mapping.sourceSha256 === digest('sha256', sourceBytes), 'mapping_binding');
  ensure(Array.isArray(mapping.receipts) && mapping.receipts.length <= limits.references, 'mapping_limit');
  ensure(Array.isArray(source.collections) && Array.isArray(source.receiptReferences), 'source_shape');
  const domains = source.collections.filter(d => d.collection === 'expenses');
  ensure(domains.length === 1 && domains[0].queryExhausted === true && Array.isArray(domains[0].pages), 'source_expenses');
  const docs = new Map(), refs = new Set();
  const prefix = `projects/${project}/databases/(default)/documents/expenses/`;
  for (const page of domains[0].pages) {
    ensure(Array.isArray(page.response) && page.request?.readTime === source.readTime, 'source_page');
    for (const frame of page.response) if (frame.document !== undefined) {
      const d = frame.document;
      ensure(typeof d.name === 'string' && d.name.startsWith(prefix) && component(d.name.slice(prefix.length)) && !docs.has(d.name) && d.fields?.userId?.stringValue === userId, 'source_owner_or_document');
      ensure(time(d.createTime) <= time(d.updateTime) && time(d.updateTime) <= readTime, 'source_document_time');
      docs.set(d.name, d.fields.receiptUrl);
    }
  }
  for (const r of source.receiptReferences) {
    ensure(object(r) && docs.has(r.document) && !refs.has(r.document) && r.status === 'unresolved_not_downloaded' && JSON.stringify(r.source) === JSON.stringify(docs.get(r.document)), 'source_reference');
    refs.add(r.document);
  }
  const required = new Set();
  for (const [name, value] of docs) if (value !== undefined) {
    ensure(refs.has(name) && object(value) && Object.keys(value).length === 1, 'source_reference');
    if (Object.hasOwn(value, 'nullValue')) { ensure(value.nullValue === null || value.nullValue === 'NULL_VALUE', 'source_reference'); continue; }
    ensure(typeof value.stringValue === 'string' && value.stringValue.length > 0, 'unsupported_receipt_reference'); required.add(name);
  }
  ensure(required.size === mapping.receipts.length, 'mapping_coverage');
  const seen = new Set(), groups = new Map(), objectPrefix = `receipts/${userId}/`;
  for (const r of mapping.receipts) {
    closed(r, ['document', 'object']);
    ensure(required.has(r.document) && !seen.has(r.document), 'mapping_document'); seen.add(r.document);
    ensure(typeof r.object === 'string' && r.object.startsWith(objectPrefix) && component(r.object.slice(objectPrefix.length)) && Buffer.byteLength(r.object) <= 1024, 'object_owner_or_path');
    if (!groups.has(r.object)) groups.set(r.object, []); groups.get(r.object).push(r.document);
  }
  ensure(groups.size <= limits.objects, 'object_limit');
  return { sourceSha256: mapping.sourceSha256, mappingSha256: digest('sha256', mappingBytes), readTime: source.readTime, groups };
}
function metadata(v, bucket, name, readTime) {
  ensure(object(v) && v.bucket === bucket && v.name === name, 'metadata_identity');
  for (const field of ['generation', 'metageneration']) ensure(typeof v[field] === 'string' && /^[1-9]\d{0,19}$/.test(v[field]) && BigInt(v[field]) <= 9223372036854775807n, 'metadata_generation');
  ensure(typeof v.size === 'string' && /^(0|[1-9]\d{0,19})$/.test(v.size) && BigInt(v.size) >= 1n && BigInt(v.size) <= BigInt(limits.originalBytes), 'original_limit');
  ensure(typeof v.md5Hash === 'string' && Buffer.from(v.md5Hash, 'base64').length === 16 && Buffer.from(v.md5Hash, 'base64').toString('base64') === v.md5Hash, 'metadata_md5');
  ensure(time(v.timeCreated) <= time(v.updated) && time(v.updated) <= time(readTime), 'object_newer_than_source');
  ensure(typeof v.contentType === 'string' && /^image\/[a-zA-Z0-9.+-]+$/.test(v.contentType), 'unsupported_content_type');
  ensure(v.contentEncoding === undefined || v.contentEncoding === '' || v.contentEncoding === 'identity', 'unsupported_encoding');
  // Never copy downloadTokens, custom metadata, mediaLink or other server strings.
  return { bucket, name, generation: v.generation, metageneration: v.metageneration, size: v.size, md5Hash: v.md5Hash, timeCreated: v.timeCreated, updated: v.updated, contentType: v.contentType, contentEncoding: v.contentEncoding ?? '' };
}
export async function readOriginal(url, headers, expected, { fetchImpl = fetch, now = Date.now, deadline = now() + limits.requestMs } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(limits.requestMs, Math.max(1, deadline - now())));
  const chunks = []; let bytes = 0;
  try {
    ensure(Number.isSafeInteger(expected) && expected > 0 && expected <= limits.originalBytes && now() < deadline, 'original_limit_or_deadline');
    const response = await fetchImpl(url, { method: 'GET', headers: { ...headers, 'Accept-Encoding': 'identity' }, redirect: 'error', signal: controller.signal });
    ensure(response.status === 200 && !response.redirected && (response.url === '' || response.url === url), 'media_http_failure');
    ensure(!response.headers.has('content-range') && ['', 'identity'].includes(response.headers.get('content-encoding') ?? ''), 'media_transformed_or_partial');
    const declared = response.headers.get('content-length');
    if (declared !== null) ensure(/^(0|[1-9]\d*)$/.test(declared) && Number(declared) === expected, 'media_length');
    ensure(response.body, 'missing_media_body');
    for await (const chunk of response.body) { bytes += chunk.length; ensure(bytes <= expected && now() < deadline, 'media_limit_or_deadline'); chunks.push(Buffer.from(chunk)); }
    ensure(bytes === expected && now() < deadline, 'media_length_or_deadline');
    return Buffer.concat(chunks, bytes);
  } finally { clearTimeout(timer); controller.abort(); for (const chunk of chunks) chunk.fill(0); }
}
export async function collectReceiptEvidence({ project, userId, bucket, token, sourceBytes, mappingBytes }, { fetchImpl = fetch, now = Date.now } = {}) {
  configuration(project, userId, bucket);
  const started = now(), deadline = started + limits.durationMs, transport = { fetchImpl, now, deadline };
  const bound = inputs(sourceBytes, mappingBytes, project, userId, bucket, now);
  const checkIdentity = await identity(token, project, userId, transport), receipts = [];
  const headers = { Authorization: `Firebase ${token}` }; let total = 0;
  for (const [name, documents] of bound.groups) {
    checkIdentity(); const endpoint = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;
    const beforeResponse = await requestJSON(endpoint, { method: 'GET', headers }, { ...transport, maximum: limits.metadataBytes });
    checkIdentity(); const before = metadata(beforeResponse.value, bucket, name, bound.readTime);
    total += Number(before.size); ensure(total <= limits.totalBytes, 'aggregate_limit');
    const bytes = await readOriginal(`${endpoint}?alt=media`, headers, Number(before.size), transport);
    try {
      checkIdentity(); ensure(digest('md5', bytes, 'base64') === before.md5Hash, 'original_md5_mismatch');
      const afterResponse = await requestJSON(endpoint, { method: 'GET', headers }, { ...transport, maximum: limits.metadataBytes });
      checkIdentity(); const after = metadata(afterResponse.value, bucket, name, bound.readTime);
      ensure(JSON.stringify(before) === JSON.stringify(after), 'object_changed');
      receipts.push({ documents, object: name, before, after, byteCount: bytes.length, sha256: digest('sha256', bytes), originalBase64: bytes.toString('base64'), status: 'current_object_observed_unchanged' });
    } finally { bytes.fill(0); }
  }
  checkIdentity(); ensure(now() < deadline, 'acquisition_deadline');
  return { format: 'penny-legacy-receipt-evidence-v1', project, userId, bucket, readTime: bound.readTime, sourceSha256: bound.sourceSha256, mappingSha256: bound.mappingSha256, startedAt: new Date(started).toISOString(), finishedAt: new Date(now()).toISOString(), scope: { allMappedReferencesAcquired: true, storageSnapshotConsistent: false, migrationReady: false, nativeImageValidated: false, historicalGenerationDownload: false, sourceExportReauthenticated: false }, totals: { objects: receipts.length, references: [...bound.groups.values()].reduce((n, docs) => n + docs.length, 0), originalBytes: total }, receipts };
}
export async function acquireReceipts({ project, userId, bucket, tokenFile, sourceFile, mappingFile, output }, dependencies = {}) {
  let sourceBytes, mappingBytes, tokenBytes, token;
  try {
    sourceBytes = privateFile(sourceFile, limits.sourceBytes); mappingBytes = privateFile(mappingFile, limits.mappingBytes);
    tokenBytes = privateFile(tokenFile, rawLimits.tokenBytes);
    try { token = tokenBytes.toString('utf8').trim(); } finally { tokenBytes.fill(0); }
    const evidence = await collectReceiptEvidence({ project, userId, bucket, token, sourceBytes, mappingBytes }, dependencies);
    publishEvidence(output, evidence); return evidence.totals;
  } finally { sourceBytes?.fill(0); mappingBytes?.fill(0); tokenBytes?.fill(0); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), values = {}, flags = ['--project', '--user', '--bucket', '--token-file', '--source', '--mapping', '--output'];
    ensure(args.length === flags.length * 2, 'usage');
    for (let i = 0; i < args.length; i += 2) { ensure(flags.includes(args[i]) && !Object.hasOwn(values, args[i]), 'usage'); values[args[i]] = args[i + 1]; }
    const totals = await acquireReceipts({ project: values['--project'], userId: values['--user'], bucket: values['--bucket'], tokenFile: values['--token-file'], sourceFile: values['--source'], mappingFile: values['--mapping'], output: values['--output'] });
    process.stdout.write(`Receipt evidence saved: ${totals.objects} originals, ${totals.references} references, ${totals.originalBytes} bytes. Not migration-ready.\n`);
  } catch { process.stderr.write('Receipt acquisition failed; no successful acquisition is claimed. Check identity, mapping, unchanged metadata, limits and private output storage.\n'); process.exitCode = 1; }
}
