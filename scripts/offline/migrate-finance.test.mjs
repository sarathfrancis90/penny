import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLegacyMigration } from './migrate-legacy.mjs';
import { monthlyReport, savingsProgress } from '../../packages/offline-contract/finance.mjs';

const now = '2026-09-13T12:00:00.000Z';
const meta = { userId: 'account', createdAt: now, updatedAt: now };
const expense = { ...meta, id: 'e1', vendor: 'Cafe', amount: 12.34, category: 'Meals and entertainment', date: '2026-09-12', description: 'Description: literal', notes: 'Notes: literal\n\nsecond line' };
const budget = { ...meta, id: 'b1', category: 'Meals and entertainment', monthlyLimit: 100, period: { month: 9, year: 2026 }, settings: { rollover: true, alertThreshold: 80.5, notificationsEnabled: false } };
const income = { ...meta, id: 'i1', name: 'Salary', category: 'salary', amount: 1000, netAmount: 800, currency: 'CAD', taxable: true,
  frequency: 'monthly', isRecurring: false, recurringDate: 31, isActive: true, startDate: '2026-01-31', endDate: '2026-12-31', description: 'Configured schedule', lastReceivedAt: now };
const goal = { ...meta, id: 's1', name: 'Rainy day', category: 'emergency_fund', targetAmount: 200, currentAmount: 100, monthlyContribution: 50,
  currency: 'CAD', startDate: '2026-01-01', targetDate: '2026-12-31', status: 'active', isActive: true, priority: 'high', description: 'Emergency reserve', emoji: '☂️',
  progressPercentage: 50, monthsToGoal: 2, onTrack: false, lastContributionAt: now };
const contribution = { id: 'c1', userId: 'account', goalId: 's1', goalName: 'Original goal name', amount: 25, date: '2026-09-01', period: { year: 2026, month: 9 },
  contributionType: 'manual', source: 'Pay cheque', note: 'First contribution', currency: 'CAD', createdAt: now };
const exported = () => ({ exportVersion: 2, userId: 'account', timeZone: 'America/Toronto', savingsHistory: { complete: true, records: [structuredClone(contribution)] },
  pages: [{ requestCursor: null, response: { schemaVersion: 1, nextCursor: null, hasMore: false, serverWatermark: now,
    records: { expenses: [structuredClone(expense)], budgets: [structuredClone(budget)], income: [structuredClone(income)], savings: [structuredClone(goal)] } } }] });

test('complete finance migration preserves settings, actual savings and independent note fields', () => {
  const input = exported(), before = structuredClone(input);
  const result = prepareLegacyMigration(input, { now });
  assert.equal(result.ready, true, JSON.stringify(result.issues));
  assert.deepEqual(input, before);
  const snapshot = result.snapshot;
  assert.equal(snapshot.expenses[0].description, expense.description); assert.equal(snapshot.expenses[0].note, expense.notes);
  assert.equal(snapshot.budgets[0].alertThresholdBps, 8050); assert.equal(snapshot.budgets[0].notificationsEnabled, false);
  assert.equal(snapshot.incomeSources[0].grossMinor, 100000); assert.equal(snapshot.incomeSources[0].netMinor, 80000);
  assert.equal(snapshot.incomeSources[0].isRecurring, false); assert.equal(snapshot.incomeSources[0].schedule.dayOfMonth, 31);
  assert.equal(snapshot.incomeEntries.length, 0); // lastReceivedAt cannot invent an actual amount.
  assert.equal(snapshot.savingsGoals[0].openingMinor, 7500); assert.equal(snapshot.savingsEntries[0].amountMinor, 2500);
  assert.equal(snapshot.savingsEntries[0].goalName, contribution.goalName);
  assert.equal(snapshot.savingsEntries[0].goalId, snapshot.savingsGoals[0].id);
  assert.equal(result.provenance.mappings.length, 5); assert.equal(result.provenance.parsedSourceJSONSHA256.length, 64);
  assert.deepEqual(prepareLegacyMigration(input, { now }).snapshot.savingsEntries, snapshot.savingsEntries);
  assert.equal(monthlyReport(snapshot, '2026-09').receivedMinor, 0);
  assert.equal(savingsProgress(snapshot, snapshot.savingsGoals[0].id).currentMinor, 10000);
});

test('incomplete or conflicting savings history blocks replacement, never double-counts current balance', () => {
  for (const mutate of [
    input => { delete input.savingsHistory; },
    input => { input.savingsHistory.records[0].amount = 101; },
    input => { input.pages[0].response.records.savings[0].progressPercentage = 80; },
    input => { input.pages[0].response.records.savings[0].monthsToGoal = 5; },
    input => { input.pages[0].response.records.savings[0].onTrack = true; },
  ]) {
    const input = exported(); mutate(input);
    const result = prepareLegacyMigration(input, { now });
    assert.equal(result.ready, false); assert.equal(result.snapshot, null);
  }
});

test('foreign, duplicate, negative, subcent and calendar-inconsistent contributions fail closed', () => {
  for (const mutate of [
    input => { input.savingsHistory.records[0].userId = 'foreign'; },
    input => { input.savingsHistory.records[0].goalId = 'missing'; },
    input => { input.savingsHistory.records[0].groupId = 'group'; },
    input => { input.savingsHistory.records[0].amount = -1; },
    input => { input.savingsHistory.records[0].amount = 0.301; },
    input => { input.savingsHistory.records[0].period.month = 8; },
    input => { input.savingsHistory.records.push(structuredClone(input.savingsHistory.records[0])); },
  ]) { const input = exported(); mutate(input); assert.throws(() => prepareLegacyMigration(input, { now })); }
});

test('invalid flags, unsupported fields and duplicate budget periods cannot become a replacement snapshot', () => {
  for (const mutate of [
    input => { input.pages[0].response.records.income[0].isRecurring = 'false'; },
    input => { input.pages[0].response.records.income[0].netAmount = 1001; },
    input => { input.pages[0].response.records.income[0].currency = 'USD'; },
    input => { input.pages[0].response.records.budgets[0].settings.futureOption = true; },
    input => { input.pages[0].response.records.budgets.push({ ...structuredClone(budget), id: 'b2' }); },
    input => { input.pages[0].response.records.savings[0].unknown = 'must retain'; },
  ]) { const input = exported(); mutate(input); const result = prepareLegacyMigration(input, { now }); assert.equal(result.ready, false); assert.equal(result.snapshot, null); }
});

test('income and savings instant dates cannot cross into a relabeled BCE calendar year', () => {
  for (const domain of ['income', 'savings']) {
    const input = exported(); input.pages[0].response.records[domain][0].startDate = '0001-01-01T00:00:00.000Z';
    const result = prepareLegacyMigration(input, { now });
    assert.equal(result.ready, false); assert.equal(result.snapshot, null);
  }
});
