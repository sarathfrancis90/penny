import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync, mkdtempSync, rmSync, statSync, readdirSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareRawMigration, migrateRaw } from './migrate-raw-evidence.mjs';
import { openBackup } from '../../packages/offline-contract/contract.mjs';
import { collections } from './export-legacy-raw.mjs';
import { identity, instant, recoveryKey, encode, digest, typed, makeSource, makeReceipts, fixtureOutputs } from '../../packages/offline-contract/fixtures/raw-migration-v1/generate.mjs';
const fixture = name => new URL(`../../packages/offline-contract/fixtures/raw-migration-v1/${name}`, import.meta.url);
function options(source = makeSource(), receiptMutation) {
  const sourceBytes = encode(source), receipt = makeReceipts(sourceBytes); if (receiptMutation) receiptMutation(receipt);
  return { sourceBytes, receiptBytes: encode(receipt), ...identity };
}
function reject(source, pattern, overrides = {}) {
  const result = prepareRawMigration({ ...options(source), ...overrides }); assert.equal(result.ready, false); assert.equal(result.snapshot, null);
  if (pattern) assert.match(JSON.stringify(result.report.issues), pattern); return result;
}
const defaultExpense = () => Object.fromEntries(Object.entries(makeSource().collections[0].pages[0].response[0].document.fields).map(([k, v]) => [k, v.stringValue ?? v.doubleValue ?? Number(v.integerValue)]));
test('public fixtures are fresh; schema3 contents and authenticated-invalid-image scope are exact', () => {
  for (const [name, bytes] of Object.entries(fixtureOutputs())) assert.deepEqual(readFileSync(fixture(name)), bytes, name);
  const manifest = JSON.parse(readFileSync(fixture('fixture-manifest.json')));
  for (const c of manifest.cases) { const b = readFileSync(fixture(c.file)); assert.equal(digest(b), c.sha256); assert.equal(b.length, c.bytes); assert.equal(openBackup(b, recoveryKey).schemaVersion, 3); }
  const snapshot = openBackup(readFileSync(fixture('positive.pennybackup')), recoveryKey);
  assert.equal(snapshot.expenses[0].amountMinor, 1234); assert.equal(snapshot.expenses[0].description, 'Public description'); assert.equal(snapshot.expenses[0].note, 'Separate public note');
  assert.equal(snapshot.budgets[0].alertThresholdBps, 8050); assert.equal(snapshot.incomeSources[0].netMinor, 80000);
  assert.equal(snapshot.incomeEntries.length, 0); assert.equal(snapshot.savingsEntries.length, 0);
});
test('representable subset reconciles all ten source domains and keeps evidence claims limited', () => {
  const input = options(), before = Buffer.from(input.sourceBytes), result = prepareRawMigration(input);
  assert.equal(result.ready, true, JSON.stringify(result.report.issues)); assert.deepEqual(input.sourceBytes, before);
  assert.deepEqual(Object.keys(result.report.sourceCounts), collections); assert.equal(result.report.sourceSha256, digest(before));
  assert.equal(result.report.reconciliation.expenseByMonthCategory['["2026-09","Meals and entertainment"]'], 1234);
  assert.equal(result.report.reconciliation.configuredGrossMinor, 100000); assert.equal(result.report.reconciliation.receivedIncomeMinor, 0);
  assert.equal(result.report.scope.fullAccountMigration, false); assert.equal(result.report.scope.historyCompletenessEstablished, false);
  assert.equal(result.report.scope.nativeImageDecodeEstablished, false); assert.equal(result.report.mappings.length, 3);
});
test('every nonempty unsupported domain independently blocks; no fabricated history completeness', () => {
  for (const domain of collections.slice(3).filter(d => d !== 'savings_goals_personal')) {
    const source = makeSource({ [domain]: [{ id: 'unsupported-1', userId: identity.userId, arbitraryRetainedHistory: [{ amount: 123 }] }] });
    const result = reject(source, /unrepresented|unimplemented|unestablished/);
    assert.ok(result.report.issues.some(i => i.domain === domain && i.document.endsWith('/unsupported-1')));
    assert.equal(result.report.sourceCounts[domain], 1);
  }
});
test('missing/duplicate domains, owner filters, cursor changes, response time and counts fail closed', () => {
  const mutations = [s => s.collections.pop(), s => { s.collections[1] = s.collections[0]; }, s => { s.scope.fullAccountExport = true; }, s => { s.collections[0].pages[0].request.structuredQuery.where.fieldFilter.value.stringValue = 'foreign'; }, s => { s.collections[0].pages[0].request.readTime = '2026-09-12T12:00:00Z'; }, s => { s.collections[0].pages[0].response[0].document.fields.userId.stringValue = 'foreign'; }, s => { s.collections[0].pages[0].response[0].document.updateTime = '2026-09-14T00:00:00Z'; }, s => { s.collections[0].pages[0].response[0].readTime = '2026-09-12T00:00:00Z'; }, s => { s.collections[0].pages[0].cursor = 'false-cursor'; }, s => { s.collections[0].pages[0].count = true; }, s => { s.totals.documents++; }, s => { s.collections[0].pages[0].responseSha256 = 'not-a-hash'; }, s => { s.quarantined.push({ document: 'fake', reason: 'fake' }); }, s => { s.receiptReferences = []; }];
  for (const mutation of mutations) { const source = makeSource(); mutation(source); reject(source); }
});
test('an exactly full page requires the final empty query; retained HTTP raw hashes are not false attestations', () => {
  const expenses = Array.from({ length: 100 }, (_, i) => ({ ...defaultExpense(), id: `e${String(i).padStart(3, '0')}`, receiptUrl: null }));
  const source = makeSource({ expenses }); assert.equal(source.collections[0].pages.length, 2);
  assert.equal(prepareRawMigration(options(source)).ready, true);
  const cut = structuredClone(source); cut.collections[0].pages.pop(); reject(cut, /incomplete_page_chain/);
  const wrong = structuredClone(source); wrong.collections[0].pages[1].request.structuredQuery.startAt.before = true; reject(wrong, /query_scope_or_cursor/);
  source.collections[0].pages[0].responseSha256 = '0'.repeat(64);
  const accepted = prepareRawMigration(options(source)); assert.equal(accepted.ready, true); assert.equal(accepted.report.scope.liveSourceReauthenticated, false);
});
test('strict unknown/group/refund/history/currency/precision rules do not silently drop records', () => {
  for (const mutation of [{ amount: -1 }, { amount: 0 }, { amount: 0.301 }, { unknown: 1 }, { history: [{ amount: 1 }] }, { groupId: 'g' }, { expenseType: 'group' }, { isGroupExpense: 0 }, { isGroupExpense: 'false' }, { currency: 'USD' }, { syncStatus: 'pending' }, { createdAt: '2026-09-13T12:00:00.000001Z' }]) reject(makeSource({ expenses: [{ ...defaultExpense(), ...mutation }] }));
  for (const type of [undefined, null, 'personal']) {
    const expense = defaultExpense(); if (type === undefined) delete expense.expenseType; else expense.expenseType = type;
    assert.equal(prepareRawMigration(options(makeSource({ expenses: [expense] }))).ready, true);
  }
  const raw = makeSource(); raw.collections[0].pages[0].response[0].document.fields.amount = { integerValue: '9007199254740993' }; reject(raw, /unsafe_integer/);
  const type = makeSource(); type.collections[0].pages[0].response[0].document.fields.notes = { referenceValue: 'projects/foreign' }; reject(type, /unrepresented_firestore_type/);
  const conflict = makeSource(); conflict.collections[0].pages[0].response[0].document.fields.id = typed('other'); reject(conflict, /conflicting_stored_id/);
});
test('typed timestamps normalize only losslessly; duplicate JSON keys and explicit timezone are mandatory', () => {
  const source = makeSource(); source.collections[0].pages[0].response[0].document.fields.createdAt = { timestampValue: '2026-09-13T12:00:00.000000Z' };
  assert.equal(prepareRawMigration(options(source)).snapshot.expenses[0].createdAt, instant);
  source.collections[0].pages[0].response[0].document.fields.createdAt.timestampValue = '2026-09-13T12:00:00.000001Z'; reject(source, /timestamp_precision/);
  const input = options(); input.sourceBytes = Buffer.from(input.sourceBytes.toString().replace('"format":', '"format":"duplicate","format":'));
  assert.equal(prepareRawMigration(input).ready, false); reject(makeSource(), /timezone/, { timeZone: '' });
});
test('receipt evidence must match exact source/account/time/object/bytes and every reference', () => {
  const mutations = [r => { r.sourceSha256 = '0'.repeat(64); }, r => { r.userId = 'foreign'; }, r => { r.receipts[0].object = 'receipts/foreign/a'; }, r => { r.receipts[0].after.generation = '2'; }, r => { r.receipts[0].sha256 = '0'.repeat(64); }, r => { r.receipts[0].originalBase64 = r.receipts[0].originalBase64.slice(4); }, r => { r.receipts[0].documents = ['foreign']; }, r => { r.receipts[0].documents.push(r.receipts[0].documents[0]); }, r => { r.receipts = []; }, r => { r.receipts[0].before.extra = true; }, r => { r.totals.references++; }];
  for (const mutate of mutations) assert.equal(prepareRawMigration(options(makeSource(), mutate)).ready, false);
  reject(makeSource(), /receipt_evidence_required/, { receiptBytes: undefined });
  const source = makeSource({ expenses: [{ ...defaultExpense(), receiptUrl: null }] }); assert.equal(prepareRawMigration({ ...options(source), receiptBytes: undefined }).ready, true);
});
test('shared receipt expansion enforces native attachment count and byte caps', () => {
  const source = makeSource({ expenses: Array.from({ length: 101 }, (_, i) => ({ ...defaultExpense(), id: `e${i}` })) }); reject(source, /native_receipt_capacity/);
  const large = Buffer.alloc(2 * 1024 * 1024, 1), five = makeSource({ expenses: Array.from({ length: 5 }, (_, i) => ({ ...defaultExpense(), id: `e${i}` })) }), sourceBytes = encode(five);
  const result = prepareRawMigration({ sourceBytes, receiptBytes: encode(makeReceipts(sourceBytes, large)), ...identity }); assert.equal(result.ready, false); assert.match(JSON.stringify(result.report.issues), /native_receipt_capacity/);
  const oversized = encode(makeReceipts(sourceBytes, Buffer.alloc(2 * 1024 * 1024 + 1))); assert.equal(prepareRawMigration({ sourceBytes, receiptBytes: oversized, ...identity }).ready, false);
});
test('financial duplicates and inconsistent income fields block; received amounts are never invented', () => {
  const get = c => makeSource().collections.find(d => d.collection === c).pages[0].response[0].document.fields;
  const unwrap = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue ?? (v.booleanValue !== undefined ? v.booleanValue : v.doubleValue ?? Number(v.integerValue))]));
  const income = unwrap(get('income_sources_personal')); income.netAmount = 1001; reject(makeSource({ income_sources_personal: [income] }), /invalid_integer/);
  const b = { id: 'b1', userId: identity.userId, category: 'Meals and entertainment', monthlyLimit: 100, period: { year: 2026, month: 9 }, createdAt: instant, updatedAt: instant };
  reject(makeSource({ budgets_personal: [b, { ...b, id: 'b2' }] }), /budget/);
});
test('private exclusive report/backup output; blockers and publication failures preserve inputs and old files', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'penny-raw-migrate-')));
  const sourceFile = join(dir, 'raw.json'), receiptFile = join(dir, 'receipts.json'), keyFile = join(dir, 'key'), output = join(dir, 'candidate.pennybackup'), reportFile = join(dir, 'report.json');
  try {
    const input = options(); for (const [path, bytes] of [[sourceFile, input.sourceBytes], [receiptFile, input.receiptBytes], [keyFile, recoveryKey]]) writeFileSync(path, bytes, { mode: 0o600 });
    const args = { sourceFile, receiptFile, keyFile, output, reportFile, ...identity };
    assert.equal(migrateRaw(args).backupWritten, true); const backup = readFileSync(output); assert.equal(openBackup(backup, recoveryKey).expenses.length, 1);
    const report = JSON.parse(readFileSync(reportFile)); assert.equal(report.backupSha256, digest(backup)); assert.equal(statSync(output).mode & 0o777, 0o600); assert.equal(statSync(reportFile).mode & 0o777, 0o600);
    assert.throws(() => migrateRaw({ ...args, reportFile: join(dir, 'second-report.json') })); assert.deepEqual(readFileSync(output), backup); assert.deepEqual(readFileSync(sourceFile), input.sourceBytes); assert.equal(readdirSync(dir).some(n => n.endsWith('.stage')), false);
    const blocked = options(makeSource({ groupMembers: [{ id: 'g', userId: identity.userId }] })); writeFileSync(sourceFile, blocked.sourceBytes); writeFileSync(receiptFile, blocked.receiptBytes);
    const b = migrateRaw({ ...args, output: join(dir, 'blocked.pennybackup'), reportFile: join(dir, 'blocked-report.json') }); assert.equal(b.ready, false); assert.equal(existsSync(join(dir, 'blocked.pennybackup')), false);
    assert.ok(JSON.parse(readFileSync(join(dir, 'blocked-report.json'))).issues.some(i => i.domain === 'groupMembers'));
    const link = join(dir, 'link'); symlinkSync(sourceFile, link); assert.throws(() => migrateRaw({ ...args, sourceFile: link }));
    chmodSync(sourceFile, 0o644); assert.throws(() => migrateRaw(args));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('CLI malformed input emits no private content and produces only a private blocker report', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'penny-raw-cli-')));
  try {
    const sourceFile = join(dir, 'bad'), reportFile = join(dir, 'report'); writeFileSync(sourceFile, '{"PRIVATE-SOURCE-TEXT":', { mode: 0o600 });
    const r = spawnSync(process.execPath, ['scripts/offline/migrate-raw-evidence.mjs', '--source', sourceFile, '--project', identity.project, '--user', identity.userId, '--timezone', identity.timeZone, '--report', reportFile], { encoding: 'utf8' });
    assert.equal(r.status, 2); assert.equal((r.stdout + r.stderr).includes('PRIVATE-SOURCE-TEXT'), false); assert.equal(JSON.parse(readFileSync(reportFile)).candidateReady, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
