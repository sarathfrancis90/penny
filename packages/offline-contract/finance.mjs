import { randomUUID } from 'node:crypto';
import { categories, limits, exactKeys, requireThat as check, validUnicode, validDate, validTimestamp, validateExpense, validateSnapshot, requireExportCapacity } from './contract.mjs';

export const financeLimits = Object.freeze({ budgets: 1200, incomeSources: 1000, incomeEntries: 10000, savingsGoals: 1000, savingsEntries: 10000, recurringExpenses: 1000 });
export const incomeCategories = ['salary', 'freelance', 'bonus', 'investment', 'rental', 'side_hustle', 'gift', 'other'];
export const savingsCategories = ['emergency_fund', 'travel', 'education', 'health', 'house_down_payment', 'car', 'wedding', 'retirement', 'investment', 'custom'];
export const financeKeys = {
  expense: 'id merchant amountMinor currencyCode expenseDate category note createdAt updatedAt description recurringTemplateId recurringOccurrenceDate'.split(' '),
  budget: 'id category month limitMinor rollover alertThresholdBps notificationsEnabled createdAt updatedAt'.split(' '),
  schedule: 'frequency startDate endDate dayOfMonth'.split(' '),
  incomeSource: 'id name category grossMinor netMinor currencyCode taxable isRecurring isActive description schedule lastReceivedAt createdAt updatedAt'.split(' '),
  incomeEntry: 'id sourceId receivedDate amountMinor currencyCode note occurrenceDate createdAt updatedAt'.split(' '),
  savingsGoal: 'id name category targetMinor openingMinor monthlyContributionMinor currencyCode status isActive priority description emoji startDate targetDate achievedDate lastContributionAt createdAt updatedAt'.split(' '),
  savingsEntry: 'id goalId goalName date amountMinor currencyCode contributionType source note createdAt updatedAt'.split(' '),
  recurringExpense: 'id merchant amountMinor currencyCode category description note isActive schedule createdAt updatedAt'.split(' '),
};
const uuid = value => check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'invalid_uuid');
const bool = value => check(typeof value === 'boolean', 'invalid_boolean');
const integer = (value, min, max) => check(Number.isSafeInteger(value) && value >= min && value <= max, 'invalid_integer');
const money = (value, zero = false) => integer(value, zero ? 0 : 1, limits.amountMinor);
const currency = value => check(value === 'CAD', 'unsupported_currency');
function text(value, name = false, maximum = 4000) {
  check(validUnicode(value) && [...value].length <= (name ? 200 : maximum) && (!name || (value === value.trim() && value.length > 0)), 'invalid_text');
}
function date(value) { check(validDate(value), 'invalid_date'); }
function nullableDate(value) { if (value !== null) date(value); }
function nullableTime(value) { check(value === null || validTimestamp(value), 'invalid_timestamp'); }
function meta(value) { uuid(value.id); check(validTimestamp(value.createdAt) && validTimestamp(value.updatedAt) && value.updatedAt >= value.createdAt, 'invalid_timestamp'); }
function sum(values) {
  return values.reduce((total, value) => { const next = total + value; integer(next, 0, limits.totalMinor); return next; }, 0);
}
export function validMonth(value) { return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && validDate(`${value}-01`); }
export function validateSchedule(value) {
  exactKeys(value, financeKeys.schedule);
  check(['once', 'weekly', 'biweekly', 'monthly', 'yearly'].includes(value.frequency), 'invalid_frequency');
  date(value.startDate); nullableDate(value.endDate); check(value.endDate === null || value.endDate >= value.startDate, 'invalid_date_order');
  if (value.dayOfMonth !== null) { integer(value.dayOfMonth, 1, 31); check(['monthly', 'yearly'].includes(value.frequency), 'invalid_schedule_day'); }
  return value;
}
export function validateFinanceExpense(value) {
  exactKeys(value, financeKeys.expense);
  const { description, recurringTemplateId, recurringOccurrenceDate, ...base } = value;
  validateExpense(base); text(description);
  check((recurringTemplateId === null) === (recurringOccurrenceDate === null), 'incomplete_occurrence');
  if (recurringTemplateId !== null) { uuid(recurringTemplateId); date(recurringOccurrenceDate); }
  return value;
}
export function validateBudget(value) {
  exactKeys(value, financeKeys.budget); meta(value); check(categories.includes(value.category), 'invalid_category');
  check(validMonth(value.month), 'invalid_month'); money(value.limitMinor, true); bool(value.rollover); bool(value.notificationsEnabled); integer(value.alertThresholdBps, 0, 10000);
  return value;
}
export function validateIncomeSource(value) {
  exactKeys(value, financeKeys.incomeSource); meta(value); text(value.name, true); check(incomeCategories.includes(value.category), 'invalid_category');
  money(value.grossMinor); if (value.netMinor !== null) integer(value.netMinor, 0, value.grossMinor);
  currency(value.currencyCode); bool(value.taxable); bool(value.isRecurring); bool(value.isActive); text(value.description); validateSchedule(value.schedule); nullableTime(value.lastReceivedAt);
  return value;
}
export function validateIncomeEntry(value) {
  exactKeys(value, financeKeys.incomeEntry); meta(value); uuid(value.sourceId); date(value.receivedDate); money(value.amountMinor); currency(value.currencyCode); text(value.note); nullableDate(value.occurrenceDate);
  return value;
}
export function validateSavingsGoal(value) {
  exactKeys(value, financeKeys.savingsGoal); meta(value); text(value.name, true); check(savingsCategories.includes(value.category), 'invalid_category');
  money(value.targetMinor); money(value.openingMinor, true); money(value.monthlyContributionMinor, true); currency(value.currencyCode);
  check(['active', 'achieved', 'paused', 'cancelled'].includes(value.status), 'invalid_status'); bool(value.isActive); check(['low', 'medium', 'high', 'critical'].includes(value.priority), 'invalid_priority');
  text(value.description); text(value.emoji, false, 16); date(value.startDate); nullableDate(value.targetDate); nullableDate(value.achievedDate); nullableTime(value.lastContributionAt);
  check((value.targetDate === null || value.targetDate >= value.startDate) && (value.achievedDate === null || value.achievedDate >= value.startDate), 'invalid_date_order');
  return value;
}
export function validateSavingsEntry(value) {
  exactKeys(value, financeKeys.savingsEntry); meta(value); uuid(value.goalId); text(value.goalName, true); date(value.date); money(value.amountMinor); currency(value.currencyCode);
  check(['manual', 'auto', 'from_expense_savings'].includes(value.contributionType), 'invalid_contribution_type'); text(value.source); text(value.note);
  return value;
}
export function validateRecurringExpense(value) {
  exactKeys(value, financeKeys.recurringExpense); meta(value); text(value.merchant, true); money(value.amountMinor); currency(value.currencyCode); check(categories.includes(value.category), 'invalid_category'); text(value.description); text(value.note); bool(value.isActive); validateSchedule(value.schedule);
  return value;
}
export function occurrenceKey(id, civilDate) { uuid(id); date(civilDate); return `${id}/${civilDate}`; }
export function validateFinanceDomains(value) {
  const validators = { budgets: validateBudget, incomeSources: validateIncomeSource, incomeEntries: validateIncomeEntry, savingsGoals: validateSavingsGoal, savingsEntries: validateSavingsEntry, recurringExpenses: validateRecurringExpense };
  const ids = {};
  for (const [domain, validate] of Object.entries(validators)) {
    check(Array.isArray(value[domain]) && value[domain].length <= financeLimits[domain], `${domain}_limit`);
    ids[domain] = new Set();
    for (const record of value[domain]) { validate(record); check(!ids[domain].has(record.id), 'duplicate_finance_id'); ids[domain].add(record.id); }
  }
  const budgetPeriods = new Set(), incomeOccurrences = new Set(), expenseOccurrences = new Set();
  for (const budget of value.budgets) { const key = `${budget.category}/${budget.month}`; check(!budgetPeriods.has(key), 'duplicate_budget_period'); budgetPeriods.add(key); }
  for (const entry of value.incomeEntries) {
    check(ids.incomeSources.has(entry.sourceId), 'orphan_income');
    if (entry.occurrenceDate !== null) { const key = occurrenceKey(entry.sourceId, entry.occurrenceDate); check(!incomeOccurrences.has(key), 'duplicate_income_occurrence'); incomeOccurrences.add(key); }
  }
  for (const entry of value.savingsEntries) check(ids.savingsGoals.has(entry.goalId), 'orphan_savings');
  for (const expense of value.expenses) if (expense.recurringTemplateId !== null) {
    check(ids.recurringExpenses.has(expense.recurringTemplateId), 'orphan_recurring_expense');
    const key = occurrenceKey(expense.recurringTemplateId, expense.recurringOccurrenceDate);
    check(!expenseOccurrences.has(key), 'duplicate_expense_occurrence'); expenseOccurrences.add(key);
  }
  sum(value.incomeEntries.map(entry => entry.amountMinor));
  sum([...value.savingsGoals.map(goal => goal.openingMinor), ...value.savingsEntries.map(entry => entry.amountMinor)]);
  return value;
}
export function upgradeFinanceSnapshot(value) {
  validateSnapshot(value);
  if (value.schemaVersion === 3) return structuredClone(value);
  const candidate = { ...structuredClone(value), schemaVersion: 3, expenses: value.expenses.map(expense => ({ ...expense, description: '', recurringTemplateId: null, recurringOccurrenceDate: null })), ...Object.fromEntries(Object.keys(financeLimits).map(domain => [domain, []])) };
  validateSnapshot(candidate); requireExportCapacity(Buffer.byteLength(JSON.stringify(candidate))); return candidate;
}

const ordinal = value => new Date(`${value}T00:00:00.000Z`).getTime() / 86400000;
const civil = day => new Date(day * 86400000).toISOString().slice(0, 10);
function daysInMonth(year, month) { return [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]; }
function occurrenceRange(from, to) { date(from); date(to); check(ordinal(to) >= ordinal(from) && ordinal(to) - ordinal(from) <= 366, 'occurrence_range_limit'); }
export function occurrences(schedule, from, to, recurring = true) {
  validateSchedule(schedule); occurrenceRange(from, to); bool(recurring);
  const first = ordinal(from), last = ordinal(to), anchor = ordinal(schedule.startDate);
  check(last >= first && last - first <= 366, 'occurrence_range_limit');
  const frequency = recurring ? schedule.frequency : 'once';
  const [, startMonth, startDay] = schedule.startDate.split('-').map(Number);
  const result = [];
  for (let day = first; day <= last; day++) {
    const candidate = civil(day);
    if (candidate < schedule.startDate || (schedule.endDate !== null && candidate > schedule.endDate)) continue;
    const [year, month, monthDay] = candidate.split('-').map(Number);
    const matches = frequency === 'once' ? day === anchor
      : frequency === 'weekly' ? (day - anchor) % 7 === 0
      : frequency === 'biweekly' ? (day - anchor) % 14 === 0
      : monthDay === Math.min(schedule.dayOfMonth ?? startDay, daysInMonth(year, month)) && (frequency === 'monthly' || month === startMonth);
    if (matches) result.push(candidate);
  }
  return result;
}
export function recurringDues(snapshot, from, to) {
  validateSnapshot(snapshot); check(snapshot.schemaVersion === 3, 'finance_schema_required');
  occurrenceRange(from, to);
  const posted = new Set(snapshot.expenses.filter(value => value.recurringTemplateId !== null).map(value => occurrenceKey(value.recurringTemplateId, value.recurringOccurrenceDate)));
  return snapshot.recurringExpenses.filter(value => value.isActive).flatMap(value => occurrences(value.schedule, from, to).map(date => ({ occurrenceId: occurrenceKey(value.id, date), templateId: value.id, date, amountMinor: value.amountMinor }))).filter(value => !posted.has(value.occurrenceId)).sort((a, b) => a.date.localeCompare(b.date) || a.templateId.localeCompare(b.templateId));
}
export function incomeDues(snapshot, from, to) {
  validateSnapshot(snapshot); check(snapshot.schemaVersion === 3, 'finance_schema_required');
  occurrenceRange(from, to);
  const posted = new Set(snapshot.incomeEntries.filter(value => value.occurrenceDate !== null).map(value => occurrenceKey(value.sourceId, value.occurrenceDate)));
  return snapshot.incomeSources.filter(value => value.isActive).flatMap(value => occurrences(value.schedule, from, to, value.isRecurring).map(date => ({ occurrenceId: occurrenceKey(value.id, date), sourceId: value.id, date, grossMinor: value.grossMinor, netMinor: value.netMinor }))).filter(value => !posted.has(value.occurrenceId)).sort((a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId));
}
function accepted(candidate) { validateSnapshot(candidate); requireExportCapacity(Buffer.byteLength(JSON.stringify(candidate))); return candidate; }
export function postRecurringExpense(snapshot, templateId, dueDate, { id = randomUUID(), now = new Date().toISOString() } = {}) {
  validateSnapshot(snapshot); check(snapshot.schemaVersion === 3, 'finance_schema_required'); occurrenceKey(templateId, dueDate);
  const existing = snapshot.expenses.find(value => value.recurringTemplateId === templateId && value.recurringOccurrenceDate === dueDate);
  if (existing) return { snapshot: structuredClone(snapshot), record: structuredClone(existing), created: false };
  const template = snapshot.recurringExpenses.find(value => value.id === templateId);
  check(template?.isActive && occurrences(template.schedule, dueDate, dueDate).includes(dueDate), 'invalid_occurrence');
  const record = { id, merchant: template.merchant, amountMinor: template.amountMinor, currencyCode: 'CAD', expenseDate: dueDate, category: template.category, note: template.note, description: template.description, recurringTemplateId: templateId, recurringOccurrenceDate: dueDate, createdAt: now, updatedAt: now };
  return { snapshot: accepted({ ...structuredClone(snapshot), expenses: [...structuredClone(snapshot.expenses), record] }), record, created: true };
}
export function postIncomeOccurrence(snapshot, sourceId, dueDate, { id = randomUUID(), now = new Date().toISOString(), receivedDate, amountMinor, note = '' } = {}) {
  validateSnapshot(snapshot); check(snapshot.schemaVersion === 3, 'finance_schema_required'); occurrenceKey(sourceId, dueDate);
  const existing = snapshot.incomeEntries.find(value => value.sourceId === sourceId && value.occurrenceDate === dueDate);
  if (existing) return { snapshot: structuredClone(snapshot), record: structuredClone(existing), created: false };
  const source = snapshot.incomeSources.find(value => value.id === sourceId);
  check(source?.isActive && occurrences(source.schedule, dueDate, dueDate, source.isRecurring).includes(dueDate), 'invalid_occurrence');
  const record = { id, sourceId, receivedDate, amountMinor, currencyCode: 'CAD', note, occurrenceDate: dueDate, createdAt: now, updatedAt: now };
  return { snapshot: accepted({ ...structuredClone(snapshot), incomeEntries: [...structuredClone(snapshot.incomeEntries), record] }), record, created: true };
}

export function monthlyReport(snapshot, month) {
  const value = upgradeFinanceSnapshot(snapshot); check(validMonth(month), 'invalid_month');
  const expenses = value.expenses.filter(entry => entry.expenseDate.startsWith(month));
  const income = value.incomeEntries.filter(entry => entry.receivedDate.startsWith(month));
  const savings = value.savingsEntries.filter(entry => entry.date.startsWith(month));
  const expenseMinor = sum(expenses.map(entry => entry.amountMinor)), receivedMinor = sum(income.map(entry => entry.amountMinor));
  const sources = new Map(value.incomeSources.map(source => [source.id, source.category]));
  return { month, currencyCode: 'CAD', expenseMinor, receivedMinor, netMinor: receivedMinor - expenseMinor, savingsContributionMinor: sum(savings.map(entry => entry.amountMinor)), expenseCount: expenses.length, incomeCount: income.length, expenseByCategory: categories.map(category => ({ category, amountMinor: sum(expenses.filter(entry => entry.category === category).map(entry => entry.amountMinor)) })), incomeByCategory: incomeCategories.map(category => ({ category, amountMinor: sum(income.filter(entry => sources.get(entry.sourceId) === category).map(entry => entry.amountMinor)) })) };
}
function previousMonth(month) { const [year, number] = month.split('-').map(Number); return number > 1 ? `${String(year).padStart(4, '0')}-${String(number - 1).padStart(2, '0')}` : year > 1 ? `${String(year - 1).padStart(4, '0')}-12` : null; }
export function budgetUsage(snapshot, month) {
  const value = upgradeFinanceSnapshot(snapshot); check(validMonth(month), 'invalid_month');
  const previous = new Map(), result = [];
  for (const budget of [...value.budgets].filter(entry => entry.month <= month).sort((a, b) => a.month.localeCompare(b.month) || a.category.localeCompare(b.category))) {
    const prior = previous.get(budget.category);
    const carryMinor = budget.rollover && prior?.month === previousMonth(budget.month) ? Math.max(0, prior.remainingMinor) : 0;
    const availableMinor = sum([budget.limitMinor, carryMinor]);
    const spentMinor = sum(value.expenses.filter(entry => entry.category === budget.category && entry.expenseDate.startsWith(budget.month)).map(entry => entry.amountMinor));
    const thresholdReached = spentMinor > 0 && BigInt(spentMinor) * 10000n >= BigInt(availableMinor) * BigInt(budget.alertThresholdBps);
    const row = { id: budget.id, category: budget.category, month: budget.month, limitMinor: budget.limitMinor, carryMinor, availableMinor, spentMinor, remainingMinor: availableMinor - spentMinor, thresholdReached, overBudget: spentMinor > availableMinor };
    previous.set(budget.category, row); if (budget.month === month) result.push(row);
  }
  return result.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category));
}
export function savingsProgress(snapshot, goalId) {
  const value = upgradeFinanceSnapshot(snapshot), goal = value.savingsGoals.find(entry => entry.id === goalId);
  check(goal, 'missing_goal');
  const contributedMinor = sum(value.savingsEntries.filter(entry => entry.goalId === goalId).map(entry => entry.amountMinor));
  const currentMinor = sum([goal.openingMinor, contributedMinor]);
  return { goalId, openingMinor: goal.openingMinor, contributedMinor, currentMinor, targetMinor: goal.targetMinor, remainingMinor: Math.max(0, goal.targetMinor - currentMinor), progressBps: Number((BigInt(currentMinor) * 10000n / BigInt(goal.targetMinor)) > 10000n ? 10000n : BigInt(currentMinor) * 10000n / BigInt(goal.targetMinor)) };
}
export function csvCell(value) {
  let text = String(value);
  if (/^[\t\r\n]/.test(text) || /^[\s]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function expenseCSV(snapshot) {
  const value = upgradeFinanceSnapshot(snapshot);
  const rows = [['id', 'date', 'merchant', 'amount', 'currency', 'category', 'description', 'note'], ...[...value.expenses].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.id.localeCompare(b.id)).map(entry => [entry.id, entry.expenseDate, entry.merchant, `${Math.floor(entry.amountMinor / 100)}.${String(entry.amountMinor % 100).padStart(2, '0')}`, entry.currencyCode, entry.category, entry.description, entry.note])];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
