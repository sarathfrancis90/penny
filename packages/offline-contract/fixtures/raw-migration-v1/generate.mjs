// Public synthetic evidence only. Fixed key/nonce are confined to fixtures.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { collections } from '../../../../scripts/offline/export-legacy-raw.mjs';
import { prepareRawMigration } from '../../../../scripts/offline/migrate-raw-evidence.mjs';
import { sealForTest } from '../../contract.mjs';

export const identity = { project: 'penny-public-fixture', userId: 'public-migration-user', bucket: 'penny-public-fixture.appspot.com', timeZone: 'America/Toronto' };
export const instant = '2026-09-13T12:00:00.000Z';
export const recoveryKey = `pny1-${'07'.repeat(32)}`;
export const digest = data => createHash('sha256').update(data).digest('hex');
export const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const base = `projects/${identity.project}/databases/(default)/documents`;
export function typed(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(typed) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typed(v)])) } };
}
export function makeSource(records = {}) {
  const common = { userId: identity.userId, createdAt: instant, updatedAt: instant };
  const domains = { expenses: [{ ...common, id: 'expense-1', vendor: 'Public fixture cafe', amount: 12.34, category: 'Meals and entertainment', date: '2026-09-12', expenseType: 'personal', description: 'Public description', notes: 'Separate public note', receiptUrl: 'https://untrusted.invalid/never-fetched' }], budgets_personal: [{ ...common, id: 'budget-1', category: 'Meals and entertainment', monthlyLimit: 100, period: { year: 2026, month: 9 }, settings: { rollover: true, alertThreshold: 80.5, notificationsEnabled: false } }], income_sources_personal: [{ ...common, id: 'income-1', name: 'Public salary', category: 'salary', amount: 1000, netAmount: 800, currency: 'CAD', taxable: true, isRecurring: true, isActive: true, frequency: 'monthly', recurringDate: 15, startDate: '2026-01-15', description: 'Configured source only' }], ...records };
  const docs = Object.fromEntries(collections.map(c => [c, (domains[c] ?? []).map(r => ({ name: `${base}/${c}/${r.id}`, fields: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typed(v)])), createTime: instant, updateTime: instant })).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))]));
  let requests = 0, responseBytes = 0;
  const page = (c, list, cursor, limit, fixed = true) => {
    const request = { structuredQuery: { from: [{ collectionId: c }], where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: identity.userId } } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit, ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}) }, ...(fixed ? { readTime: instant } : {}) };
    const response = list.length ? list.map(document => ({ document, readTime: instant })) : [{ readTime: instant }], raw = Buffer.from(JSON.stringify(response));
    requests++; responseBytes += raw.length;
    return { request, response, responseSha256: digest(raw), responseBytes: raw.length, finalTime: instant, cursor: list.at(-1)?.name ?? cursor, count: list.length };
  };
  const probe = page('expenses', docs.expenses.slice(0, 1), null, 1, false);
  const result = collections.map(c => {
    const pages = []; let cursor = null;
    for (let i = 0; ; i += 100) { const list = docs[c].slice(i, i + 100); const p = page(c, list, cursor, 100); pages.push(p); cursor = p.cursor; if (list.length < 100) break; }
    return { collection: c, ownerField: 'userId', queryExhausted: true, documentCount: docs[c].length, pages };
  });
  const receiptReferences = [], quarantined = [];
  for (const c of collections) for (const d of docs[c]) {
    const f = d.fields;
    if (f.groupId !== undefined || f.groupMetadata !== undefined || f.expenseType?.stringValue === 'group' || f.isGroupExpense?.booleanValue === true || c === 'groupMembers') quarantined.push({ document: d.name, reason: 'group_evidence_not_personal_migration' });
    if (c === 'expenses' && f.expenseType?.stringValue !== 'personal') quarantined.push({ document: d.name, reason: 'expense_type_requires_review' });
    if (c === 'expenses' && f.receiptUrl !== undefined) receiptReferences.push({ document: d.name, source: f.receiptUrl, status: 'unresolved_not_downloaded' });
  }
  return { format: 'penny-legacy-raw-evidence-v1', ...{ project: identity.project, database: '(default)', userId: identity.userId }, readTime: instant, startedAt: instant, finishedAt: instant,
    scope: { collections: [...collections], ownerQueriesExhausted: true, fullAccountExport: false, migrationReady: false, storageSnapshotConsistent: false, omitted: ['other owners group records', 'unlisted collections/subcollections', 'device-only or unsynced records', 'receipt bytes'] },
    totals: { documents: Object.values(docs).reduce((n, d) => n + d.length, 0), requests, responseBytes, unresolvedReceipts: receiptReferences.length }, probe, collections: result, receiptReferences, quarantined };
}
export function makeReceipts(sourceBytes, png = readFileSync(new URL('../receipt.png', import.meta.url))) {
  const source = JSON.parse(sourceBytes), name = `receipts/${identity.userId}/public.png`, md5Hash = createHash('md5').update(png).digest('base64');
  const documents = source.receiptReferences.filter(r => r.source.stringValue).map(r => r.document);
  const metadata = { bucket: identity.bucket, name, generation: '1234567890123456789', metageneration: '1', size: String(png.length), md5Hash, timeCreated: instant, updated: instant, contentType: 'image/png', contentEncoding: '' };
  const mapping = { format: 'penny-legacy-receipt-map-v1', ...identity, readTime: source.readTime, sourceSha256: digest(sourceBytes), receipts: documents.map(document => ({ document, object: name })) }; delete mapping.timeZone;
  return { format: 'penny-legacy-receipt-evidence-v1', project: identity.project, userId: identity.userId, bucket: identity.bucket, readTime: source.readTime, sourceSha256: digest(sourceBytes), mappingSha256: digest(encode(mapping)), startedAt: instant, finishedAt: instant,
    scope: { allMappedReferencesAcquired: true, storageSnapshotConsistent: false, migrationReady: false, nativeImageValidated: false, historicalGenerationDownload: false, sourceExportReauthenticated: false }, totals: { objects: documents.length ? 1 : 0, references: documents.length, originalBytes: documents.length ? png.length : 0 },
    receipts: documents.length ? [{ documents, object: name, before: metadata, after: { ...metadata }, byteCount: png.length, sha256: digest(png), originalBase64: png.toString('base64'), status: 'current_object_observed_unchanged' }] : [] };
}
export function fixtureOutputs() {
  const sourceBytes = encode(makeSource()), receiptBytes = encode(makeReceipts(sourceBytes));
  const result = prepareRawMigration({ sourceBytes, receiptBytes, ...identity });
  if (!result.ready) throw new Error(JSON.stringify(result.report.issues));
  const snapshot = result.snapshot; snapshot.snapshotId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const invalid = JSON.parse(readFileSync(new URL('../png-integrity-corpus.json', import.meta.url))).cases.find(c => c.id === 'rgba9-plain-invalid_filter');
  const negative = JSON.parse(JSON.stringify(snapshot)); Object.assign(negative.attachments[0], { byteCount: invalid.byteCount, sha256: invalid.sha256, dataBase64: invalid.dataBase64 });
  const positiveBytes = encode(sealForTest(snapshot, recoveryKey, Buffer.alloc(12, 0x51)));
  const negativeBytes = encode(sealForTest(negative, recoveryKey, Buffer.alloc(12, 0x52)));
  const manifest = { format: 'penny-raw-migration-fixtures-v1', publicFixtureOnly: true, recoveryKey, sourceSha256: digest(sourceBytes), receiptEvidenceSha256: digest(receiptBytes),
    expected: { schemaVersion: 3, snapshotId: snapshot.snapshotId, vaultId: snapshot.vaultId, createdAt: snapshot.createdAt, counts: Object.fromEntries(['expenses', 'attachments', 'budgets', 'incomeSources', 'incomeEntries', 'savingsGoals', 'savingsEntries', 'recurringExpenses'].map(k => [k, snapshot[k].length])), expenseTotalMinor: 1234, budgetTotalMinor: 10000, configuredGrossMinor: 100000, configuredNetMinor: 80000, receivedIncomeMinor: 0, attachmentSha256: snapshot.attachments[0].sha256 },
    cases: [{ file: 'positive.pennybackup', sha256: digest(positiveBytes), bytes: positiveBytes.length, nativeExpected: 'accept', snapshotFile: 'positive.snapshot.json' }, { file: 'invalid-image.pennybackup', sha256: digest(negativeBytes), bytes: negativeBytes.length, nativeExpected: 'reject', portableExpected: 'accept', reason: 'PNG invalid filter with valid chunk CRCs and valid AEAD/attachment hash', imageSource: 'png-integrity-corpus.json#rgba9-plain-invalid_filter', imageSha256: invalid.sha256 }] };
  return { 'source.json': sourceBytes, 'receipt-evidence.json': receiptBytes, 'positive.snapshot.json': encode(snapshot), 'positive.pennybackup': positiveBytes, 'invalid-image.pennybackup': negativeBytes, 'fixture-manifest.json': encode(manifest) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const verify = process.argv[2] === '--verify';
  for (const [name, bytes] of Object.entries(fixtureOutputs())) {
    const path = new URL(name, import.meta.url);
    if (verify) { if (!readFileSync(path).equals(bytes)) throw new Error(`Stale public fixture: ${name}`); }
    else writeFileSync(fileURLToPath(path), bytes);
  }
}
