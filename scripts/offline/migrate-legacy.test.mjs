import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openBackup, limits } from '../../packages/offline-contract/contract.mjs';
import { prepareLegacyMigration, legacyUUID } from './migrate-legacy.mjs';

const now = '2026-09-13T12:00:00.000Z';
const source = { id: 'legacy-expense', userId: 'test-account', vendor: 'Test cafe', amount: 12.34, category: 'Meals and entertainment', date: '2026-09-13', expenseType: 'personal', createdAt: now, updatedAt: now, description: 'Lunch' };
const exported = () => ({ exportVersion: 1, userId: 'test-account', timeZone: 'America/Toronto', pages: [{ requestCursor: null, response: { schemaVersion: 1, nextCursor: null, hasMore: false, serverWatermark: now, records: { expenses: [structuredClone(source)], budgets: [], income: [], savings: [] } } }] });

test('expense conversion preserves cents, separate source notes and deterministic identity', () => {
  const first = prepareLegacyMigration(exported(), { now });
  const second = prepareLegacyMigration(exported(), { now });
  assert.equal(first.ready, true);
  assert.equal(first.snapshot.expenses[0].amountMinor, 1234);
  assert.equal(first.snapshot.expenses[0].description, 'Lunch');
  assert.equal(first.snapshot.expenses[0].note, '');
  assert.equal(first.snapshot.schemaVersion, 3);
  assert.deepEqual(first.snapshot.expenses, second.snapshot.expenses);
  assert.equal(first.snapshot.vaultId, second.snapshot.vaultId);
  assert.notEqual(legacyUUID('a:b', 'c'), legacyUUID('a', 'b:c'));
});
test('instant expenses use explicit source timezone and preserve calendar day', () => {
  const input = exported();
  input.pages[0].response.records.expenses[0].date = '2026-09-13T01:00:00.000Z';
  assert.equal(prepareLegacyMigration(input, { now }).snapshot.expenses[0].expenseDate, '2026-09-12');
  delete input.timeZone;
  assert.throws(() => prepareLegacyMigration(input, { now }));
});
test('timezone conversion rejects years outside the supported Gregorian era instead of relabeling BCE as AD', () => {
  for (const [timeZone, date] of [['America/Toronto', '0001-01-01T00:00:00.000Z'], ['Pacific/Kiritimati', '9999-12-31T20:00:00.000Z']]) {
    const input = exported(); input.timeZone = timeZone; input.pages[0].response.records.expenses[0].date = date;
    const result = prepareLegacyMigration(input, { now });
    assert.equal(result.ready, false); assert.equal(result.snapshot, null); assert.equal(result.issues[0].domain, 'expenses');
  }
  const valid = exported(); valid.timeZone = 'Etc/UTC'; valid.pages[0].response.records.expenses[0].date = '0001-01-01T00:00:00.000Z';
  assert.equal(prepareLegacyMigration(valid, { now }).snapshot.expenses[0].expenseDate, '0001-01-01');
});
test('ownership, currency, precision, history and missing receipts never silently disappear', () => {
  for (const mutation of [{ userId: 'someone-else' }, { currency: 'USD' }, { amount: 0.1 + 0.2 }, { history: [{ amount: 11 }] }, { receiptUrl: 'https://example.invalid/receipt.jpg' }, { groupId: 'group' }, { taxPercentage: 13 }]) {
    const input = exported(); Object.assign(input.pages[0].response.records.expenses[0], mutation);
    const result = prepareLegacyMigration(input, { now });
    assert.equal(result.ready, false, JSON.stringify(mutation)); assert.equal(result.snapshot, null); assert.equal(result.issues.length, 1);
  }
});
test('legacy absent or null expense type defaults to personal only when group markers are absent', () => {
  for (const expenseType of [undefined, null, 'personal']) {
    const input = exported(); input.pages[0].response.records.expenses[0].expenseType = expenseType;
    assert.equal(prepareLegacyMigration(input, { now }).ready, true);
    input.pages[0].response.records.expenses[0].groupId = 'legacy-group';
    assert.equal(prepareLegacyMigration(input, { now }).ready, false);
  }
  const input = exported(); input.pages[0].response.records.expenses[0].expenseType = '';
  assert.equal(prepareLegacyMigration(input, { now }).ready, false);
});
test('invalid finance records block replacement', () => {
  const input = exported(); input.pages[0].response.records.budgets.push({ id: 'budget' });
  const result = prepareLegacyMigration(input, { now });
  assert.equal(result.ready, false); assert.equal(result.report.sourceCounts.budgets, 1);
});
test('truncated or repeated pagination and duplicate IDs cannot produce a backup', () => {
  const incomplete = exported(); incomplete.pages[0].response.hasMore = true; incomplete.pages[0].response.nextCursor = 'next';
  assert.throws(() => prepareLegacyMigration(incomplete, { now }));
  const broken = exported(); broken.pages[0].requestCursor = 'unexpected';
  assert.throws(() => prepareLegacyMigration(broken, { now }));
  const duplicate = exported(); duplicate.pages[0].response.records.expenses.push(structuredClone(source));
  assert.equal(prepareLegacyMigration(duplicate, { now }).ready, false);
});
test('preflight does not mutate the original export', () => {
  const input = exported(), before = structuredClone(input);
  prepareLegacyMigration(input, { now }); assert.deepEqual(input, before);
});

test('preflight refuses a valid plaintext snapshot that cannot fit the encrypted export envelope', () => {
  const input = exported();
  input.pages = Array.from({ length: 37 }, (_, page) => ({ requestCursor: page === 0 ? null : `cursor-${page}`,
    response: { schemaVersion: 1, nextCursor: page === 36 ? null : `cursor-${page + 1}`, hasMore: page !== 36, serverWatermark: now,
      records: { expenses: Array.from({ length: 100 }, (_, index) => ({ ...source, id: `capacity-${page * 100 + index}`, description: '', notes: '' })), budgets: [], income: [], savings: [] } } }));
  const baseline = prepareLegacyMigration(input, { now });
  assert.equal(baseline.ready, true);
  const target = Math.floor((limits.envelopeBytes - limits.envelopeReserve) / 4) * 3 + 1;
  assert.ok(target <= limits.plaintextBytes);
  let remaining = target - Buffer.byteLength(JSON.stringify(baseline.snapshot));
  for (const page of input.pages) for (const expense of page.response.records.expenses) {
    const count = Math.min(4000, remaining); expense.notes = 'x'.repeat(count); remaining -= count;
  }
  assert.equal(remaining, 0);
  const result = prepareLegacyMigration(input, { now });
  assert.equal(result.ready, false); assert.equal(result.snapshot, null);
  assert.ok(result.issues.some(issue => issue.domain === 'snapshot'));
});

test('CLI publishes only an encrypted owner-readable backup and never overwrites existing output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'penny-migration-test-'));
  try {
    const input = join(directory, 'export.json'), output = join(directory, 'result.pennybackup'), keyFile = join(directory, 'key.txt'), reportFile = join(directory, 'report.json');
    const key = JSON.parse(readFileSync(new URL('../../packages/offline-contract/fixtures/golden-vector.json', import.meta.url))).recoveryKey;
    writeFileSync(input, JSON.stringify(exported())); writeFileSync(keyFile, key, { mode: 0o600 });
    const args = [fileURLToPath(new URL('./migrate-legacy.mjs', import.meta.url)), input, '--output', output, '--key-file', keyFile, '--report-output', reportFile];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const saved = readFileSync(output);
    assert.equal(openBackup(saved, key).expenses[0].amountMinor, 1234);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(statSync(reportFile).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(reportFile)).provenance.mappings[0].sourceId, source.id);
    assert.equal(first.stdout.includes(source.id), false);
    assert.equal(first.stdout.includes('Test cafe'), false); assert.equal(first.stdout.includes(key), false);
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(second.status, 1); assert.deepEqual(readFileSync(output), saved);
    assert.deepEqual(JSON.parse(readFileSync(input)), exported());
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CLI malformed JSON errors do not echo private source text', () => {
  const directory = mkdtempSync(join(tmpdir(), 'penny-migration-test-'));
  try {
    const input = join(directory, 'broken.json'); writeFileSync(input, '{"private":"PRIVATE_SENTINEL",broken');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./migrate-legacy.mjs', import.meta.url)), input], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal((result.stdout + result.stderr).includes('PRIVATE_SENTINEL'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
