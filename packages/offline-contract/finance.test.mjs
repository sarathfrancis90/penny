import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSnapshot, openBackup, sealForTest, upgradeSnapshot } from './contract.mjs';
import { financeLimits, upgradeFinanceSnapshot, occurrences, recurringDues, incomeDues, postRecurringExpense, postIncomeOccurrence, monthlyReport, budgetUsage, savingsProgress, csvCell, expenseCSV } from './finance.mjs';
const raw = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const read = name => JSON.parse(raw(name));
const golden = read('snapshot-v3.json'), expected = read('finance-golden.json'), corpus = read('conformance-v3.json'), vector = read('golden-vector-v3.json');
const clone = () => structuredClone(golden);
const encode = value => Buffer.from(JSON.stringify(value));
const id = '01010101-0101-4101-8101-010101010101';
test('v3 encryption golden contains complete finance and receipt domains', () => {
  assert.deepEqual(validateSnapshot(golden), golden);
  assert.deepEqual(openBackup(raw('backup-v3.pennybackup'), vector.recoveryKey), golden);
  assert.deepEqual(sealForTest(golden, vector.recoveryKey, Buffer.from(vector.nonceHex, 'hex')), read('backup-v3.pennybackup'));
  assert.equal(JSON.stringify(golden), vector.plaintextUtf8);
});
test('old native snapshots upgrade without changing old values or attachments', () => {
  for (const version of [1, 2]) {
    const old = read(`snapshot-v${version}.json`), before = encode(old), upgraded = upgradeFinanceSnapshot(old);
    assert.equal(upgraded.schemaVersion, 3); assert.deepEqual(encode(old), before);
    for (const domain of Object.keys(financeLimits)) assert.deepEqual(upgraded[domain], []);
    assert.deepEqual(upgraded.attachments, old.attachments);
    assert.deepEqual(upgraded.expenses.map(({ description, recurringTemplateId, recurringOccurrenceDate, ...expense }) => {
      assert.equal(description, ''); assert.equal(recurringTemplateId, null); assert.equal(recurringOccurrenceDate, null); return expense;
    }), old.expenses);
    for (const field of ['vaultId', 'snapshotId', 'createdAt']) assert.equal(upgraded[field], old[field]);
  }
  assert.throws(() => upgradeSnapshot(golden), /cannot_downgrade/);
  assert.throws(() => upgradeFinanceSnapshot({ ...read('snapshot-v2.json'), unknownHistory: [] }));
});
test('finance invalid field corpus and closed domain keys reject before adoption', () => {
  for (const { domain, index, field, value } of corpus.mutations) {
    const snapshot = clone(); snapshot[domain][index][field] = value;
    assert.throws(() => validateSnapshot(snapshot), `${domain}.${field}`);
  }
  const missing = clone(); delete missing.budgets; assert.throws(() => validateSnapshot(missing));
  assert.throws(() => validateSnapshot({ ...golden, schemaVersion: 4 }));
  for (const [domain, maximum] of Object.entries(financeLimits)) {
    const snapshot = clone(); snapshot[domain] = Array(maximum + 1).fill(snapshot[domain][0]); assert.throws(() => validateSnapshot(snapshot), domain);
  }
});
test('referenced source goal and template cannot be deleted; occurrence IDs are unique', () => {
  for (const domain of ['incomeSources', 'savingsGoals']) { const snapshot = clone(); snapshot[domain] = []; assert.throws(() => validateSnapshot(snapshot)); }
  let snapshot = clone(); snapshot.budgets.push({ ...snapshot.budgets[0], id }); assert.throws(() => validateSnapshot(snapshot), /duplicate_budget_period/);
  snapshot = clone(); snapshot.incomeEntries.push({ ...snapshot.incomeEntries[0], id }); assert.throws(() => validateSnapshot(snapshot), /duplicate_income_occurrence/);
  const posted = postRecurringExpense(golden, golden.recurringExpenses[0].id, '2026-02-28', { id, now: golden.createdAt });
  snapshot = structuredClone(posted.snapshot); snapshot.recurringExpenses = []; assert.throws(() => validateSnapshot(snapshot), /orphan_recurring/);
  snapshot = structuredClone(posted.snapshot); snapshot.expenses.push({ ...posted.record, id: '02020202-0202-4202-8202-020202020202' }); assert.throws(() => validateSnapshot(snapshot), /duplicate_expense_occurrence/);
});
test('recurrence civil corpus covers month-end clamping leap years and historical dates', () => {
  for (const { schedule, from, to, recurring, expected } of read('finance-golden.json').recurrence) assert.deepEqual(occurrences(schedule, from, to, recurring), expected);
  assert.throws(() => occurrences(golden.recurringExpenses[0].schedule, '2026-01-01', '2028-01-01'), /range_limit/);
  assert.throws(() => occurrences({ ...golden.recurringExpenses[0].schedule, startDate: '1500-02-29' }, '1500-01-01', '1500-03-31'));
  assert.deepEqual(occurrences({ frequency: 'monthly', startDate: '9999-12-31', endDate: null, dayOfMonth: 31 }, '9999-12-01', '9999-12-31'), ['9999-12-31']);
});
test('dues are proposals and income last-received metadata never creates cash', () => {
  assert.deepEqual(recurringDues(golden, '2026-02-01', '2026-02-28'), expected.recurringDues);
  assert.deepEqual(incomeDues(golden, '2026-02-01', '2026-02-28'), expected.incomeDues);
  const snapshot = clone(); snapshot.incomeEntries = [];
  assert.equal(monthlyReport(snapshot, '2026-02').receivedMinor, 0);
  assert.equal(incomeDues(snapshot, '2026-02-01', '2026-02-28').length, 1);
  snapshot.incomeSources[0].isActive = false; snapshot.recurringExpenses[0].isActive = false;
  assert.deepEqual(incomeDues(snapshot, '2026-02-01', '2026-02-28'), []); assert.deepEqual(recurringDues(snapshot, '2026-02-01', '2026-02-28'), []);
  assert.throws(() => incomeDues(snapshot, 'bad', '2026-02-28')); assert.throws(() => recurringDues(snapshot, '2026-01-01', '2028-01-01'));
});
test('explicit recurrence posting is idempotent and preserves prior state on invalid posting', () => {
  const before = encode(golden), templateId = golden.recurringExpenses[0].id;
  const first = postRecurringExpense(golden, templateId, '2026-02-28', { id, now: golden.createdAt });
  assert.equal(first.created, true); assert.equal(first.snapshot.expenses.length, golden.expenses.length + 1);
  const retry = postRecurringExpense(first.snapshot, templateId, '2026-02-28');
  assert.equal(retry.created, false); assert.deepEqual(retry.snapshot, first.snapshot); assert.equal(retry.record.id, id);
  assert.throws(() => postRecurringExpense(golden, templateId, '2026-02-27'));
  assert.deepEqual(encode(golden), before);
  const income = clone(); income.incomeEntries = [];
  assert.throws(() => postIncomeOccurrence(income, income.incomeSources[0].id, '2026-02-28', { receivedDate: '2026-02-28' }));
  const received = postIncomeOccurrence(income, income.incomeSources[0].id, '2026-02-28', { id, now: golden.createdAt, receivedDate: '2026-03-01', amountMinor: 76543 });
  assert.equal(monthlyReport(received.snapshot, '2026-02').receivedMinor, 0); assert.equal(monthlyReport(received.snapshot, '2026-03').receivedMinor, 76543);
  assert.equal(postIncomeOccurrence(received.snapshot, income.incomeSources[0].id, '2026-02-28').created, false);
});
test('monthly financial totals and category breakdowns match hand-calculated fixture', () => { assert.deepEqual(monthlyReport(golden, expected.month), expected.report); });
test('budget rollover carries only unused positive balance across contiguous months', () => {
  assert.deepEqual(budgetUsage(golden, expected.month), expected.budgetUsage);
  const gap = clone(); gap.budgets[0].month = '2025-12'; assert.equal(budgetUsage(gap, expected.month)[0].carryMinor, 0);
  const overspent = clone(); overspent.budgets[0].limitMinor = 1000; assert.equal(budgetUsage(overspent, expected.month)[0].carryMinor, 0);
  const disabled = clone(); disabled.budgets[1].rollover = false; assert.equal(budgetUsage(disabled, expected.month)[0].availableMinor, 10000);
  disabled.budgets[1].limitMinor = 0; const zero = budgetUsage(disabled, expected.month)[0]; assert.equal(zero.overBudget, true); assert.equal(zero.thresholdReached, true); assert.equal(zero.remainingMinor, -7000);
});
test('savings uses opening plus actual ledger without adding monthly plans', () => {
  assert.deepEqual(savingsProgress(golden, expected.savingsProgress.goalId), expected.savingsProgress);
  const none = clone(); none.savingsEntries = []; assert.equal(savingsProgress(none, none.savingsGoals[0].id).currentMinor, 10000);
  none.savingsGoals[0].targetMinor = 1; assert.equal(savingsProgress(none, none.savingsGoals[0].id).progressBps, 10000);
});
test('savings aggregate includes opening balances and rejects the first cent above cap', () => {
  const snapshot = clone();
  snapshot.savingsEntries = Array.from({ length: 10000 }, (_, index) => ({ ...golden.savingsEntries[0], id: `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`, amountMinor: 99999999999 }));
  assert.throws(() => validateSnapshot(snapshot), /invalid_integer/);
  snapshot.savingsGoals[0].openingMinor = 9999;
  validateSnapshot(snapshot);
  assert.equal(savingsProgress(snapshot, snapshot.savingsGoals[0].id).currentMinor, 999999999999999);
});
test('CSV neutralizes formulas after leading whitespace and preserves quoting and lines', () => {
  for (const { input, expected } of corpus.csvCases) assert.equal(csvCell(input), expected);
  const csv = expenseCSV(golden); assert.equal(csv, raw('expenses-v3.csv').toString());
  assert.ok(csv.includes('"\'=HYPERLINK(')); assert.ok(csv.includes('"\'  +SUM(1,2)\nSecond line"')); assert.ok(csv.endsWith('\r\n'));
});
