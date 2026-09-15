import { readFileSync, writeFileSync } from 'node:fs';
import { categories, sealForTest } from './contract.mjs';
import { financeKeys, financeLimits, incomeCategories, savingsCategories, upgradeFinanceSnapshot, expenseCSV } from './finance.mjs';
const root = new URL('./', import.meta.url);
const write = (path, value) => writeFileSync(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`);
const base = JSON.parse(readFileSync(new URL('fixtures/snapshot-v2.json', root)));
const key = JSON.parse(readFileSync(new URL('fixtures/golden-vector-v2.json', root))).recoveryKey;
const id = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const times = { createdAt: '2026-09-13T12:00:00.000Z', updatedAt: '2026-09-13T12:00:00.000Z' };
const monthly = { frequency: 'monthly', startDate: '2026-01-31', endDate: null, dayOfMonth: 31 };
const snapshot = upgradeFinanceSnapshot(base);
snapshot.snapshotId = id('a');
snapshot.expenses = [
  { ...snapshot.expenses[0], expenseDate: '2026-01-10', amountMinor: 6000, description: 'Original expense description', note: 'Original separate note' },
  { ...snapshot.expenses[0], id: id('b'), expenseDate: '2026-02-10', amountMinor: 7000 },
  { ...snapshot.expenses[0], id: id('c'), expenseDate: '2026-02-14', amountMinor: 2000, category: 'Office expenses', merchant: '=HYPERLINK("https://example.invalid")', description: 'Quoted "description"', note: '  +SUM(1,2)\nSecond line' },
];
snapshot.budgets = ['2026-01', '2026-02'].map((month, index) => ({ id: id(index ? 'e' : 'd'), category: 'Meals and entertainment', month, limitMinor: 10000, rollover: true, alertThresholdBps: 5000, notificationsEnabled: true, ...times }));
snapshot.incomeSources = [{ id: id('6'), name: 'Consulting', category: 'freelance', grossMinor: 100000, netMinor: 80000, currencyCode: 'CAD', taxable: true, isRecurring: true, isActive: true, description: 'Scheduled suggestion only', schedule: monthly, lastReceivedAt: '2026-02-28T12:00:00.000Z', ...times }];
snapshot.incomeEntries = [{ id: id('7'), sourceId: id('6'), receivedDate: '2026-02-28', amountMinor: 78000, currencyCode: 'CAD', note: 'Actual bank receipt', occurrenceDate: '2026-02-28', ...times }];
snapshot.savingsGoals = [{ id: id('8'), name: 'Emergency reserve', category: 'emergency_fund', targetMinor: 100000, openingMinor: 10000, monthlyContributionMinor: 5000, currencyCode: 'CAD', status: 'active', isActive: true, priority: 'high', description: 'Keep accessible', emoji: '🎯', startDate: '2026-01-01', targetDate: '2027-01-01', achievedDate: null, lastContributionAt: '2026-02-15T12:00:00.000Z', ...times }];
snapshot.savingsEntries = [{ id: id('9'), goalId: id('8'), goalName: 'Rainy day', date: '2026-02-15', amountMinor: 2000, currencyCode: 'CAD', contributionType: 'manual', source: 'Salary', note: 'Explicit contribution', ...times }];
snapshot.recurringExpenses = [{ id: id('f'), merchant: 'Office subscription', amountMinor: 1200, currencyCode: 'CAD', category: 'Office expenses', description: 'Monthly plan', note: '', isActive: true, schedule: monthly, ...times }];
write('fixtures/snapshot-v3.json', snapshot);
const nonce = Buffer.from('202122232425262728292a2b', 'hex');
write('fixtures/backup-v3.pennybackup', sealForTest(snapshot, key, nonce));
write('fixtures/golden-vector-v3.json', { purpose: 'Public deterministic test material only.', recoveryKey: key, nonceHex: nonce.toString('hex'), aadUtf8: 'PENNY-OFFLINE-BACKUP:1', plaintextUtf8: JSON.stringify(snapshot) });
writeFileSync(new URL('fixtures/expenses-v3.csv', root), expenseCSV(snapshot));
write('fixtures/finance-golden.json', {
  month: '2026-02', report: { month: '2026-02', currencyCode: 'CAD', expenseMinor: 9000, receivedMinor: 78000, netMinor: 69000, savingsContributionMinor: 2000, expenseCount: 2, incomeCount: 1, expenseByCategory: categories.map(category => ({ category, amountMinor: category === 'Meals and entertainment' ? 7000 : category === 'Office expenses' ? 2000 : 0 })), incomeByCategory: incomeCategories.map(category => ({ category, amountMinor: category === 'freelance' ? 78000 : 0 })) },
  budgetUsage: [{ id: id('e'), category: 'Meals and entertainment', month: '2026-02', limitMinor: 10000, carryMinor: 4000, availableMinor: 14000, spentMinor: 7000, remainingMinor: 7000, thresholdReached: true, overBudget: false }],
  savingsProgress: { goalId: id('8'), openingMinor: 10000, contributedMinor: 2000, currentMinor: 12000, targetMinor: 100000, remainingMinor: 88000, progressBps: 1200 },
  recurringDues: [{ occurrenceId: `${id('f')}/2026-02-28`, templateId: id('f'), date: '2026-02-28', amountMinor: 1200 }], incomeDues: [],
  recurrence: [
    { schedule: monthly, from: '2026-01-01', to: '2026-03-31', recurring: true, expected: ['2026-01-31', '2026-02-28', '2026-03-31'] },
    { schedule: { frequency: 'yearly', startDate: '2024-02-29', endDate: null, dayOfMonth: null }, from: '2025-01-01', to: '2025-12-31', recurring: true, expected: ['2025-02-28'] },
    { schedule: { frequency: 'biweekly', startDate: '2025-12-26', endDate: '2026-01-23', dayOfMonth: null }, from: '2025-12-01', to: '2026-02-01', recurring: true, expected: ['2025-12-26', '2026-01-09', '2026-01-23'] },
    { schedule: monthly, from: '2026-01-01', to: '2026-03-31', recurring: false, expected: ['2026-01-31'] },
    { schedule: { ...monthly, startDate: '1500-01-31' }, from: '1500-01-01', to: '1500-03-31', recurring: true, expected: ['1500-01-31', '1500-02-28', '1500-03-31'] },
    { schedule: { frequency: 'weekly', startDate: '2011-12-30', endDate: null, dayOfMonth: null }, from: '2011-12-30', to: '2012-01-06', recurring: true, expected: ['2011-12-30', '2012-01-06'] },
  ],
});
write('fixtures/conformance-v3.json', {
  mutations: [ ['budgets', 'limitMinor', -1], ['budgets', 'month', '2026-2'], ['budgets', 'alertThresholdBps', 10001], ['budgets', 'rollover', 1], ['incomeSources', 'netMinor', 100001], ['incomeSources', 'taxable', 'true'], ['incomeSources', 'category', 'unknown'], ['incomeSources', 'currencyCode', 'USD'], ['incomeEntries', 'sourceId', id('0')], ['incomeEntries', 'amountMinor', 1.5], ['savingsGoals', 'openingMinor', -1], ['savingsGoals', 'currentMinor', 12000], ['savingsGoals', 'targetMinor', 0], ['savingsGoals', 'status', 'complete'], ['savingsEntries', 'goalId', id('0')], ['savingsEntries', 'amountMinor', -2000], ['savingsEntries', 'currencyCode', 'USD'], ['recurringExpenses', 'isActive', 1], ['expenses', 'recurringTemplateId', id('f')], ['expenses', 'description', null] ].map(([domain, field, value]) => ({ domain, index: 0, field, value, valid: false })),
  snapshotFailures: ['duplicate_domain_id', 'duplicate_budget_category_month', 'duplicate_income_occurrence', 'duplicate_expense_occurrence', 'orphan_after_source_delete', 'orphan_after_goal_delete', 'orphan_after_template_delete', 'array_capacity', 'unknown_field', 'missing_array', 'aggregate_overflow', 'invalid_recurrence_date', 'range_over_366_days'],
  csvCases: [ ['=1+1', '"\'=1+1"'], ['  +SUM(1,2)', '"\'  +SUM(1,2)"'], ['@X', '"\'@X"'], ['-10', '"\'-10"'], ['\ttext', '"\'\ttext"'], ['normal "text"', '"normal ""text"""'], ['\ufeff=1+1', '"\'\ufeff=1+1"'], ['\u00a0=1+1', '"\'\u00a0=1+1"'], ['\u202f=1+1', '"\'\u202f=1+1"'], ['\ufeff\u00a0@SUM(1,2)', '"\'\ufeff\u00a0@SUM(1,2)"'] ].map(([input, expected]) => ({ input, expected })),
  keys: financeKeys, limits: financeLimits, incomeCategories, savingsCategories,
});

// Schema supplies shape and scalar constraints; native/reference validators also
// enforce relationships, chronology, category membership, sums and byte bounds.
const previous = JSON.parse(readFileSync(new URL('snapshot-v2.schema.json', root)));
const uuid = previous.$defs.expense.properties.id, timestamp = previous.$defs.expense.properties.createdAt;
const civilDate = previous.$defs.expense.properties.expenseDate, money = { type: 'integer', minimum: 1, maximum: 99999999999 }, zeroMoney = { ...money, minimum: 0 };
const text = { type: 'string', maxLength: 4000 }, name = { type: 'string', minLength: 1, maxLength: 200 }, bool = { type: 'boolean' };
const nullable = shape => ({ anyOf: [shape, { type: 'null' }] });
const shapes = {
  id: uuid, sourceId: uuid, goalId: uuid, name, merchant: name, goalName: name, currencyCode: { const: 'CAD' }, amountMinor: money, grossMinor: money, netMinor: nullable(zeroMoney), targetMinor: money, openingMinor: zeroMoney, monthlyContributionMinor: zeroMoney, limitMinor: zeroMoney,
  category: { type: 'string' }, description: text, note: text, source: text, emoji: { type: 'string', maxLength: 16 },
  createdAt: timestamp, updatedAt: timestamp, lastReceivedAt: nullable(timestamp), lastContributionAt: nullable(timestamp), date: civilDate, receivedDate: civilDate, expenseDate: civilDate, startDate: civilDate, endDate: nullable(civilDate), targetDate: nullable(civilDate), achievedDate: nullable(civilDate), occurrenceDate: nullable(civilDate), recurringOccurrenceDate: nullable(civilDate), recurringTemplateId: nullable(uuid),
  isActive: bool, isRecurring: bool, taxable: bool, rollover: bool, notificationsEnabled: bool, alertThresholdBps: { type: 'integer', minimum: 0, maximum: 10000 }, month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
  frequency: { enum: ['once', 'weekly', 'biweekly', 'monthly', 'yearly'] }, dayOfMonth: nullable({ type: 'integer', minimum: 1, maximum: 31 }), schedule: { $ref: '#/$defs/schedule' }, status: { enum: ['active', 'achieved', 'paused', 'cancelled'] }, priority: { enum: ['low', 'medium', 'high', 'critical'] }, contributionType: { enum: ['manual', 'auto', 'from_expense_savings'] },
};
const defs = { attachment: previous.$defs.attachment };
for (const [kind, keys] of Object.entries(financeKeys)) {
  const properties = Object.fromEntries(keys.map(key => [key, shapes[key]]));
  if (properties.category) properties.category = { enum: kind === 'incomeSource' ? incomeCategories : kind === 'savingsGoal' ? savingsCategories : categories };
  defs[kind] = { type: 'object', additionalProperties: false, required: keys, properties };
}
const properties = { ...previous.properties, schemaVersion: { const: 3 } };
for (const [domain, singular] of Object.entries({ budgets: 'budget', incomeSources: 'incomeSource', incomeEntries: 'incomeEntry', savingsGoals: 'savingsGoal', savingsEntries: 'savingsEntry', recurringExpenses: 'recurringExpense' })) properties[domain] = { type: 'array', maxItems: financeLimits[domain], items: { $ref: `#/$defs/${singular}` } };
write('snapshot-v3.schema.json', { ...previous, title: 'Penny Offline finance snapshot v3', description: 'Closed finance and receipt snapshot; see FINANCE_CONTRACT.md for semantic rules.', required: Object.keys(properties), properties, $defs: defs });
