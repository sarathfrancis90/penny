// Offline, representable-subset conversion. Local traces are not server attestations.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collections, limits as rawLimits, privateFile, publishEvidence } from './export-legacy-raw.mjs';
import { convertObservedSavings } from './migrate-observed-savings.mjs';
import { prepareLegacyMigration } from './migrate-legacy.mjs';
import { parseStrictJSON, canonicalBase64, parseAmount, validTimestamp, validateSnapshot, requireExportCapacity, sealBackup, openBackup, limits as nativeLimits } from '../../packages/offline-contract/contract.mjs';

export const limits = Object.freeze({ sourceBytes: 64 * 1024 * 1024, receiptBytes: 32 * 1024 * 1024 });
const supported = { expenses: 'expenses', budgets_personal: 'budgets', income_sources_personal: 'income', savings_goals_personal: 'savings' };
const blockReasons = { savings_contributions: 'savings_history_completeness_unestablished', monthly_income_records: 'received_income_and_allocations_unrepresented', monthly_savings_summary: 'monthly_savings_reconciliation_unimplemented', budget_allocation_history: 'allocation_history_unrepresented', monthly_setup_status: 'setup_history_unrepresented', groupMembers: 'group_data_unrepresented' };
const ensure = (ok, code) => { if (!ok) throw new Error(code); };
const hash = (bytes, kind = 'sha256', encoding = 'hex') => createHash(kind).update(bytes).digest(encoding);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function exact(v, fields) { ensure(object(v) && equal(Object.keys(v).sort(), [...fields].sort()), 'unexpected_fields'); }
function allowed(v, fields) { ensure(object(v) && Object.keys(v).every(k => fields.includes(k)), 'unexpected_fields'); }
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const count = (v, maximum) => Number.isSafeInteger(v) && v >= 0 && v <= maximum;
function timestamp(v) {
  ensure(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v), 'invalid_timestamp');
  const d = new Date(v); ensure(Number.isFinite(d.getTime()) && d.toISOString().slice(0, 19) === v.slice(0, 19), 'invalid_timestamp');
  return BigInt(Date.parse(`${v.slice(0, 19)}Z`)) * 1000000n + BigInt((/\.(\d+)Z$/.exec(v)?.[1] ?? '').padEnd(9, '0'));
}
function nativeTimestamp(v) { ensure(timestamp(v) % 1000000n === 0n, 'timestamp_precision_unrepresented'); return new Date(v).toISOString(); }
function component(v) { return typeof v === 'string' && v.length > 0 && v !== '.' && v !== '..' && !/[/\\%?#]/.test(v) && ![...v].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127); }
function query(domain, userId, cursor, limit, readTime) {
  return { structuredQuery: { from: [{ collectionId: domain }], where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit, ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}) }, ...(readTime ? { readTime } : {}) };
}
// Recheck the retained transcript; raw HTTP bodies are absent, so their hashes cannot be recomputed.
function trace(source, project, userId) {
  exact(source, ['format', 'project', 'database', 'userId', 'readTime', 'startedAt', 'finishedAt', 'scope', 'totals', 'probe', 'collections', 'receiptReferences', 'quarantined']);
  ensure(source.format === 'penny-legacy-raw-evidence-v1' && source.project === project && source.userId === userId && source.database === '(default)', 'source_identity');
  exact(source.scope, ['collections', 'ownerQueriesExhausted', 'fullAccountExport', 'migrationReady', 'storageSnapshotConsistent', 'omitted']);
  ensure(equal(source.scope.collections, collections) && source.scope.ownerQueriesExhausted === true && source.scope.fullAccountExport === false && source.scope.migrationReady === false && source.scope.storageSnapshotConsistent === false && equal(source.scope.omitted, ['other owners group records', 'unlisted collections/subcollections', 'device-only or unsynced records', 'receipt bytes']), 'source_scope');
  const t = timestamp(source.readTime), started = timestamp(source.startedAt), finished = timestamp(source.finishedAt);
  ensure(validTimestamp(source.startedAt) && validTimestamp(source.finishedAt) && finished >= started && finished - started <= BigInt(rawLimits.durationMs) * 1000000n && t % 1000n === 0n && t <= finished && t >= started - 3600000000000n, 'source_time');
  let requests = 0, responseBytes = 0, documents = 0; const all = {}, expectedRefs = [], expectedQuarantine = [];
  function page(value, domain, cursor, fixedTime) {
    exact(value, ['request', 'response', 'responseSha256', 'responseBytes', 'finalTime', 'cursor', 'count']);
    const size = value.request?.structuredQuery?.limit;
    ensure(count(size, rawLimits.page) && size > 0 && (fixedTime !== undefined || size === 1) && equal(value.request, query(domain, userId, cursor, size, fixedTime)), 'query_scope_or_cursor');
    ensure(hex(value.responseSha256) && count(value.responseBytes, rawLimits.responseBytes) && value.responseBytes > 0, 'response_evidence');
    responseBytes += value.responseBytes; ensure(++requests <= rawLimits.pages && responseBytes <= rawLimits.totalBytes, 'trace_limit');
    ensure(Array.isArray(value.response) && value.response.length > 0 && value.response.length <= rawLimits.responseBytes, 'invalid_response');
    let last = cursor, preceding = fixedTime ? t : null, finalTime; const docs = [];
    for (const [index, frame] of value.response.entries()) {
      allowed(frame, ['document', 'readTime', 'skippedResults', 'done']);
      const at = timestamp(frame.readTime); ensure((preceding === null || at >= preceding) && at <= finished, 'response_time'); preceding = at; finalTime = frame.readTime;
      ensure(frame.skippedResults === undefined || frame.skippedResults === 0, 'skipped_results');
      ensure(frame.done === undefined || (frame.done === true && index === value.response.length - 1), 'invalid_done');
      if (frame.document === undefined) continue;
      const d = frame.document; exact(d, ['name', 'fields', 'createTime', 'updateTime']);
      const prefix = `projects/${project}/databases/(default)/documents/${domain}/`;
      ensure(typeof d.name === 'string' && d.name.startsWith(prefix) && component(d.name.slice(prefix.length)) && (last === null || Buffer.compare(Buffer.from(last), Buffer.from(d.name)) < 0), 'document_scope_or_order');
      ensure(object(d.fields) && equal(d.fields.userId, { stringValue: userId }), 'document_owner');
      ensure(timestamp(d.createTime) <= timestamp(d.updateTime) && timestamp(d.updateTime) <= (fixedTime ? t : at), 'document_version');
      last = d.name; docs.push(d);
    }
    ensure(docs.length <= size && value.count === docs.length && value.cursor === last && value.finalTime === finalTime, 'page_accounting');
    return { docs, cursor: last, exhausted: docs.length < size };
  }
  page(source.probe, 'expenses', null, undefined); ensure(source.probe.finalTime === source.readTime, 'probe_time');
  ensure(Array.isArray(source.collections) && source.collections.length === collections.length, 'ten_domains_required');
  for (const [index, domain] of source.collections.entries()) {
    exact(domain, ['collection', 'ownerField', 'queryExhausted', 'documentCount', 'pages']);
    const name = collections[index]; ensure(domain.collection === name && domain.ownerField === 'userId' && domain.queryExhausted === true && Array.isArray(domain.pages) && domain.pages.length > 0, 'domain_scope');
    let cursor = null; const docs = [];
    for (const [p, value] of domain.pages.entries()) {
      const result = page(value, name, cursor, source.readTime); ensure(result.exhausted === (p === domain.pages.length - 1), 'incomplete_page_chain'); cursor = result.cursor; docs.push(...result.docs);
    }
    ensure(domain.documentCount === docs.length, 'domain_count'); documents += docs.length; ensure(documents <= rawLimits.documents, 'document_limit'); all[name] = docs;
    for (const d of docs) {
      const f = d.fields;
      if (f.groupId !== undefined || f.groupMetadata !== undefined || f.expenseType?.stringValue === 'group' || f.isGroupExpense?.booleanValue === true || name === 'groupMembers') expectedQuarantine.push({ document: d.name, reason: 'group_evidence_not_personal_migration' });
      if (name === 'expenses' && f.expenseType?.stringValue !== 'personal') expectedQuarantine.push({ document: d.name, reason: 'expense_type_requires_review' });
      if (name === 'expenses' && f.receiptUrl !== undefined) expectedRefs.push({ document: d.name, source: f.receiptUrl, status: 'unresolved_not_downloaded' });
    }
  }
  ensure(equal(source.totals, { documents, requests, responseBytes, unresolvedReceipts: expectedRefs.length }) && equal(source.receiptReferences, expectedRefs) && equal(source.quarantined, expectedQuarantine), 'source_accounting');
  return all;
}
function decode(v, path = '') {
  ensure(object(v) && Object.keys(v).length === 1, 'invalid_typed_value'); const [kind, value] = Object.entries(v)[0];
  switch (kind) {
    case 'nullValue': ensure(value === null || value === 'NULL_VALUE', 'invalid_null'); return null;
    case 'stringValue': ensure(typeof value === 'string', 'invalid_string'); return value;
    case 'booleanValue': ensure(typeof value === 'boolean', 'invalid_boolean'); return value;
    case 'integerValue': ensure(typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value) && value.length <= 20 && BigInt(value) >= BigInt(Number.MIN_SAFE_INTEGER) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER), 'unsafe_integer'); return Number(value);
    case 'doubleValue': ensure(typeof value === 'number' && Number.isFinite(value), 'invalid_double'); return value;
    case 'timestampValue': return nativeTimestamp(value);
    case 'arrayValue': allowed(value, ['values']); ensure(value.values === undefined || Array.isArray(value.values), 'invalid_array'); return (value.values ?? []).map((v, i) => decode(v, `${path}[${i}]`));
    case 'mapValue': allowed(value, ['fields']); ensure(value.fields === undefined || object(value.fields), 'invalid_map'); return Object.fromEntries(Object.entries(value.fields ?? {}).map(([key, v]) => [key, decode(v, `${path}.${key}`)]));
    default: throw new Error('unrepresented_firestore_type');
  }
}
function record(d) {
  const value = Object.fromEntries(Object.entries(d.fields).map(([field, v]) => [field, decode(v, field)])), id = d.name.split('/').at(-1);
  ensure(value.id === undefined || value.id === id, 'conflicting_stored_id');
  if (Object.hasOwn(value, 'isGroupExpense')) ensure(typeof value.isGroupExpense === 'boolean', 'invalid_group_flag');
  // Preserve exact native timestamp semantics; do not silently round source strings either.
  for (const field of ['createdAt', 'updatedAt', 'lastReceivedAt']) if (value[field] !== undefined && value[field] !== null) value[field] = nativeTimestamp(value[field]);
  return { ...value, id };
}
function receiptAssets(bytes, source, sourceSha256, bucket, documents) {
  const required = new Set();
  for (const d of documents) if (d.fields.receiptUrl !== undefined) {
    const value = decode(d.fields.receiptUrl); if (value === null) continue;
    ensure(typeof value === 'string' && value.length > 0, 'invalid_receipt_reference'); required.add(d.name);
  }
  if (bytes === undefined) { ensure(required.size === 0, 'receipt_evidence_required'); return []; }
  ensure(Buffer.isBuffer(bytes) && bytes.length <= limits.receiptBytes, 'receipt_evidence_limit');
  const evidence = parseStrictJSON(bytes, limits.receiptBytes);
  exact(evidence, ['format', 'project', 'userId', 'bucket', 'readTime', 'sourceSha256', 'mappingSha256', 'startedAt', 'finishedAt', 'scope', 'totals', 'receipts']);
  ensure(typeof bucket === 'string' && bucket.length > 0 && evidence.format === 'penny-legacy-receipt-evidence-v1' && evidence.project === source.project && evidence.userId === source.userId && evidence.bucket === bucket && evidence.readTime === source.readTime && evidence.sourceSha256 === sourceSha256 && hex(evidence.mappingSha256), 'receipt_binding');
  ensure(equal(evidence.scope, { allMappedReferencesAcquired: true, storageSnapshotConsistent: false, migrationReady: false, nativeImageValidated: false, historicalGenerationDownload: false, sourceExportReauthenticated: false }), 'receipt_scope');
  ensure(timestamp(evidence.startedAt) >= timestamp(source.readTime) && timestamp(evidence.finishedAt) >= timestamp(evidence.startedAt), 'receipt_times');
  ensure(Array.isArray(evidence.receipts) && evidence.receipts.length <= 100, 'receipt_count');
  const assets = [], seen = new Set(), objects = new Set(); let uniqueBytes = 0, expandedBytes = 0;
  for (const r of evidence.receipts) {
    exact(r, ['documents', 'object', 'before', 'after', 'byteCount', 'sha256', 'originalBase64', 'status']);
    const prefix = `receipts/${source.userId}/`;
    ensure(typeof r.object === 'string' && r.object.startsWith(prefix) && component(r.object.slice(prefix.length)) && Buffer.byteLength(r.object) <= 1024 && !objects.has(r.object), 'receipt_object'); objects.add(r.object);
    ensure(r.status === 'current_object_observed_unchanged' && equal(r.before, r.after), 'receipt_changed');
    const m = r.before; exact(m, ['bucket', 'name', 'generation', 'metageneration', 'size', 'md5Hash', 'timeCreated', 'updated', 'contentType', 'contentEncoding']);
    for (const field of ['generation', 'metageneration']) ensure(typeof m[field] === 'string' && /^[1-9]\d{0,19}$/.test(m[field]) && BigInt(m[field]) <= 9223372036854775807n, 'receipt_generation');
    ensure(m.bucket === bucket && m.name === r.object && typeof m.size === 'string' && /^[1-9]\d*$/.test(m.size) && Number(m.size) === r.byteCount && count(r.byteCount, nativeLimits.attachmentBytes) && r.byteCount > 0, 'receipt_size_or_identity');
    ensure(timestamp(m.timeCreated) <= timestamp(m.updated) && timestamp(m.updated) <= timestamp(source.readTime) && ['image/png', 'image/jpeg'].includes(m.contentType) && ['', 'identity'].includes(m.contentEncoding), 'receipt_metadata');
    ensure(typeof r.originalBase64 === 'string' && r.originalBase64.length <= 3 * 1024 * 1024, 'receipt_size');
    const data = canonicalBase64(r.originalBase64, r.byteCount);
    try { ensure(hash(data) === r.sha256 && hash(data, 'md5', 'base64') === m.md5Hash, 'receipt_digest'); } finally { data.fill(0); }
    uniqueBytes += r.byteCount; ensure(Array.isArray(r.documents) && r.documents.length > 0, 'receipt_documents');
    for (const name of r.documents) {
      ensure(required.has(name) && !seen.has(name), 'receipt_ownership_or_duplicate'); seen.add(name);
      expandedBytes += r.byteCount; ensure(expandedBytes <= nativeLimits.totalAttachmentBytes && assets.length < nativeLimits.attachments, 'native_receipt_capacity');
      assets.push({ sourceExpenseId: name.split('/').at(-1), mediaType: m.contentType, dataBase64: r.originalBase64 });
    }
  }
  ensure(seen.size === required.size && equal(evidence.totals, { objects: objects.size, references: seen.size, originalBytes: uniqueBytes }), 'receipt_accounting');
  return assets;
}
function reconciliation(snapshot) {
  const expenseByMonthCategory = {}, budgetByMonthCategory = {};
  for (const e of snapshot.expenses) { const k = JSON.stringify([e.expenseDate.slice(0, 7), e.category]); expenseByMonthCategory[k] = (expenseByMonthCategory[k] ?? 0) + e.amountMinor; }
  for (const b of snapshot.budgets) budgetByMonthCategory[JSON.stringify([b.month, b.category])] = b.limitMinor;
  return { expenseByMonthCategory, budgetByMonthCategory, configuredGrossMinor: snapshot.incomeSources.reduce((n, s) => n + s.grossMinor, 0), configuredNetMinor: snapshot.incomeSources.reduce((n, s) => n + (s.netMinor ?? 0), 0), configuredNetUnspecified: snapshot.incomeSources.filter(s => s.netMinor === null).length, receivedIncomeMinor: 0, savingsMinor: snapshot.savingsGoals.reduce((n, g) => n + g.openingMinor, 0), attachmentBytes: snapshot.attachments.reduce((n, a) => n + a.byteCount, 0) };
}
export function prepareRawMigration({ sourceBytes, receiptBytes, project, userId, bucket, timeZone, now }) {
  const issues = [], report = { adapter: 'penny-raw-migration-v1', candidateReady: false, scope: { fullAccountMigration: false, historyCompletenessEstablished: false, storageSnapshotConsistent: false, nativeImageDecodeEstablished: false, liveSourceReauthenticated: false }, sourceSha256: Buffer.isBuffer(sourceBytes) ? hash(sourceBytes) : null, receiptEvidenceSha256: Buffer.isBuffer(receiptBytes) ? hash(receiptBytes) : null, project, userId, timeZone, sourceCounts: {}, issues };
  try {
    ensure(typeof project === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) && component(userId) && userId.length <= 128, 'invalid_identity');
    ensure(typeof timeZone === 'string' && timeZone.length > 0, 'explicit_timezone_required'); new Intl.DateTimeFormat('en-CA', { timeZone });
    ensure(Buffer.isBuffer(sourceBytes) && sourceBytes.length <= limits.sourceBytes, 'source_limit');
    const source = parseStrictJSON(sourceBytes, limits.sourceBytes), docs = trace(source, project, userId);
    report.readTime = source.readTime; report.calculatedAt = now ?? source.finishedAt; ensure(validTimestamp(report.calculatedAt), 'invalid_conversion_time');
    report.sourceCounts = Object.fromEntries(collections.map(c => [c, docs[c].length]));
    const normalized = { expenses: [], budgets: [], income: [], savings: [] }, mappings = [];
    for (const domain of collections) for (const d of docs[domain]) {
      if (!supported[domain]) { issues.push({ domain, document: d.name, reason: blockReasons[domain] }); continue; }
      try { normalized[supported[domain]].push(record(d)); mappings.push({ domain, document: d.name, sourceId: d.name.split('/').at(-1), sourceCreateTime: d.createTime, sourceUpdateTime: d.updateTime }); }
      catch (error) { issues.push({ domain, document: d.name, reason: error.message }); }
    }
    let assets = [];
    try { assets = receiptAssets(receiptBytes, source, report.sourceSha256, bucket, docs.expenses); }
    catch (error) { issues.push({ domain: 'receipts', reason: error.message }); }
    if (issues.length) return { ready: false, snapshot: null, report };
    let observedSavings;
    if (normalized.savings.length) {
      observedSavings = convertObservedSavings(normalized.savings, { userId, timeZone, readTime: source.readTime });
      issues.push(...observedSavings.issues);
      report.observedSavings = observedSavings.report;
      if (issues.length) return { ready: false, snapshot: null, report };
    }
    // The history-based converter receives no savings and no history-completeness assertion.
    const legacyRecords = { ...normalized, savings: [] };
    const n = Math.max(1, ...Object.values(legacyRecords).map(a => Math.ceil(a.length / 100)));
    const pages = Array.from({ length: n }, (_, i) => ({ requestCursor: i === 0 ? null : `adapter:${i}`, response: { schemaVersion: 1, serverWatermark: report.calculatedAt, hasMore: i < n - 1, nextCursor: i < n - 1 ? `adapter:${i + 1}` : null, records: Object.fromEntries(Object.entries(legacyRecords).map(([k, a]) => [k, a.slice(i * 100, i * 100 + 100)])) } }));
    // Diagnose business records before supplying assets: the legacy wrapper throws
    // orphan_receipt_asset if a rejected expense leaves its asset unused, hiding
    // the useful underlying record issue. This private validation-only copy is
    // never emitted or used as the final candidate.
    const diagnosticPages = structuredClone(pages);
    for (const page of diagnosticPages) for (const expense of page.response.records.expenses) delete expense.receiptUrl;
    const diagnostic = prepareLegacyMigration({ exportVersion: 1, userId, timeZone, pages: diagnosticPages }, { now: report.calculatedAt });
    if (!diagnostic.ready) { issues.push(...diagnostic.issues); report.converter = diagnostic.report; report.mappings = mappings; return { ready: false, snapshot: null, report }; }
    const converted = prepareLegacyMigration({ exportVersion: 1, userId, timeZone, pages, receiptAssets: assets }, { now: report.calculatedAt });
    issues.push(...converted.issues); report.converter = converted.report; report.mappings = mappings; report.converterProvenance = converted.provenance;
    if (!converted.ready) return { ready: false, snapshot: null, report };
    const snapshot = converted.snapshot;
    if (observedSavings) snapshot.savingsGoals = observedSavings.goals;
    validateSnapshot(snapshot); requireExportCapacity(Buffer.byteLength(JSON.stringify(snapshot)));
    const sumMoney = values => values.reduce((sum, value) => sum + BigInt(value === 0 ? 0 : parseAmount(value.toString())), 0n);
    const sourceExpenseMinor = sumMoney(normalized.expenses.map(e => e.amount));
    ensure(sourceExpenseMinor === snapshot.expenses.reduce((sum, e) => sum + BigInt(e.amountMinor), 0n) && snapshot.expenses.length === normalized.expenses.length && snapshot.budgets.length === normalized.budgets.length && snapshot.incomeSources.length === normalized.income.length, 'reconciliation_failed');
    ensure(sumMoney(normalized.budgets.map(b => b.monthlyLimit)) === snapshot.budgets.reduce((sum, b) => sum + BigInt(b.limitMinor), 0n) && sumMoney(normalized.income.map(s => s.amount)) === snapshot.incomeSources.reduce((sum, s) => sum + BigInt(s.grossMinor), 0n) && sumMoney(normalized.income.map(s => s.netAmount ?? 0)) === snapshot.incomeSources.reduce((sum, s) => sum + BigInt(s.netMinor ?? 0), 0n), 'finance_reconciliation_failed');
    ensure(snapshot.savingsGoals.length === normalized.savings.length && snapshot.savingsEntries.length === 0 && sumMoney(normalized.savings.map(g => g.currentAmount)) === snapshot.savingsGoals.reduce((sum, g) => sum + BigInt(g.openingMinor), 0n), 'observed_savings_reconciliation_failed');
    report.reconciliation = reconciliation(snapshot); report.candidateReady = true;
    return { ready: true, snapshot, report };
  } catch (error) { issues.push({ domain: 'source_or_conversion', reason: error.message }); return { ready: false, snapshot: null, report }; }
}
export function migrateRaw({ sourceFile, receiptFile, project, userId, bucket, timeZone, output, keyFile, reportFile }) {
  ensure(typeof reportFile === 'string' && Boolean(output) === Boolean(keyFile) && (!output || resolve(output) !== resolve(reportFile)), 'output_arguments');
  let sourceBytes, receiptBytes, keyBytes;
  try {
    sourceBytes = privateFile(sourceFile, limits.sourceBytes); if (receiptFile) receiptBytes = privateFile(receiptFile, limits.receiptBytes);
    const result = prepareRawMigration({ sourceBytes, receiptBytes, project, userId, bucket, timeZone }); let envelope;
    if (result.ready && output) {
      keyBytes = privateFile(keyFile, 128); envelope = sealBackup(result.snapshot, keyBytes.toString('utf8').trim());
      ensure(equal(openBackup(Buffer.from(JSON.stringify(envelope)), keyBytes.toString('utf8').trim()), result.snapshot), 'encrypted_readback_failed');
      result.report.backupSha256 = hash(Buffer.from(`${JSON.stringify(envelope)}\n`));
    }
    // A report attests preflight only; a later backup publication can still fail.
    publishEvidence(reportFile, result.report); if (envelope) publishEvidence(output, envelope);
    return { ready: result.ready, unresolved: result.report.issues.length, backupWritten: Boolean(envelope) };
  } finally { sourceBytes?.fill(0); receiptBytes?.fill(0); keyBytes?.fill(0); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), v = {}, flags = ['--source', '--receipts', '--project', '--user', '--bucket', '--timezone', '--output', '--key-file', '--report'];
    ensure(args.length % 2 === 0, 'usage');
    for (let i = 0; i < args.length; i += 2) { ensure(flags.includes(args[i]) && !Object.hasOwn(v, args[i]), 'usage'); v[args[i]] = args[i + 1]; }
    const result = migrateRaw({ sourceFile: v['--source'], receiptFile: v['--receipts'], project: v['--project'], userId: v['--user'], bucket: v['--bucket'], timeZone: v['--timezone'], output: v['--output'], keyFile: v['--key-file'], reportFile: v['--report'] });
    process.stdout.write(`Raw migration preflight: ${result.ready ? 'representable candidate' : 'blocked'}, ${result.unresolved} unresolved issues, backup written: ${result.backupWritten}. Full-account migration is not established.\n`);
    if (!result.ready) process.exitCode = 2;
  } catch { process.stderr.write('Raw migration failed. No successful migration is claimed; retain source evidence and check the private report and unused output paths.\n'); process.exitCode = 1; }
}
