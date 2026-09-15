// Read-only legacy model conversion. Financial caches are checked, not trusted.
import { parseAmount } from '../../packages/offline-contract/contract.mjs';

const ensure = (ok, code) => { if (!ok) throw new Error(code); };
const has = value => value !== undefined && value !== null;
const keys = (record, allowed) => {
  ensure(record && typeof record === 'object' && !Array.isArray(record), 'invalid_record');
  ensure(Object.keys(record).every(key => allowed.includes(key)), 'unrepresented_finance_field');
};
function money(value, zero = false) {
  ensure(typeof value === 'number' && Number.isFinite(value), 'invalid_finance_money');
  if (zero && value === 0) return 0;
  return parseAmount(value.toString());
}
function boolean(value, fallback) {
  if (value === undefined) return fallback;
  ensure(typeof value === 'boolean', 'invalid_finance_flag');
  return value;
}
function text(value) {
  if (!has(value)) return '';
  ensure(typeof value === 'string', 'invalid_finance_text');
  return value;
}
function currency(value) { ensure(!has(value) || value === 'CAD', 'unsupported_currency'); return 'CAD'; }
function month(period) {
  keys(period, ['year', 'month']);
  ensure(Number.isInteger(period.year) && period.year >= 1 && period.year <= 9999 && Number.isInteger(period.month) && period.month >= 1 && period.month <= 12, 'invalid_legacy_period');
  return `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}`;
}

export function convertLegacyFinance(records, context) {
  const { userId, timeZone, now, history, legacyUUID, civilDate } = context;
  const budgets = [], incomeSources = [], savingsGoals = [], savingsEntries = [], issues = [], provenance = [];
  const id = (domain, original) => legacyUUID(userId, JSON.stringify([domain, original]));
  const date = value => civilDate(value, timeZone);
  const optionalDate = value => has(value) ? date(value) : null;
  const base = (source, domain) => {
    ensure(typeof source.id === 'string' && source.id.length > 0 && source.id.length <= 200, 'invalid_source_id');
    ensure(source.userId === userId, 'ownership_mismatch');
    return { id: id(domain, source.id), createdAt: source.createdAt, updatedAt: source.updatedAt };
  };
  const recordProvenance = (domain, source, target) => provenance.push({ domain, sourceId: source.id, nativeId: target.id,
    originalDates: Object.fromEntries(['startDate', 'endDate', 'targetDate', 'achievedDate', 'date'].filter(key => has(source[key])).map(key => [key, source[key]])),
    originalDerived: Object.fromEntries(['progressPercentage', 'monthsToGoal', 'onTrack'].filter(key => has(source[key])).map(key => [key, source[key]])) });
  const convert = (domain, destination, fn) => {
    const seen = new Set();
    for (const source of records[domain]) {
      try {
        ensure(source && typeof source.id === 'string' && !seen.has(source.id), 'duplicate_or_invalid_source_id');
        seen.add(source.id);
        const target = fn(source); destination.push(target); recordProvenance(domain, source, target);
      } catch (error) { issues.push({ domain, sourceId: typeof source?.id === 'string' ? source.id : null, reason: error.message }); }
    }
  };
  convert('budgets', budgets, source => {
    keys(source, ['id', 'userId', 'category', 'monthlyLimit', 'period', 'settings', 'createdAt', 'updatedAt']);
    const settings = source.settings ?? {};
    keys(settings, ['rollover', 'alertThreshold', 'notificationsEnabled']);
    const threshold = settings.alertThreshold ?? 80;
    const alertThresholdBps = money(threshold, true);
    ensure(alertThresholdBps <= 10000, 'invalid_alert_threshold');
    return { ...base(source, 'budgets'), category: source.category, month: month(source.period), limitMinor: money(source.monthlyLimit, true),
      rollover: boolean(settings.rollover, false), alertThresholdBps, notificationsEnabled: boolean(settings.notificationsEnabled, true) };
  });
  convert('income', incomeSources, source => {
    keys(source, ['id', 'userId', 'name', 'category', 'amount', 'frequency', 'isRecurring', 'recurringDate', 'isActive', 'startDate', 'endDate', 'description', 'taxable', 'netAmount', 'currency', 'createdAt', 'updatedAt', 'lastReceivedAt']);
    return { ...base(source, 'income'), name: source.name, category: source.category, grossMinor: money(source.amount),
      netMinor: has(source.netAmount) ? money(source.netAmount, true) : null, currencyCode: currency(source.currency),
      taxable: boolean(source.taxable, true), isRecurring: boolean(source.isRecurring, false), isActive: boolean(source.isActive, true), description: text(source.description),
      schedule: { frequency: source.frequency, startDate: date(source.startDate), endDate: optionalDate(source.endDate), dayOfMonth: source.recurringDate ?? null },
      lastReceivedAt: source.lastReceivedAt ?? null };
  });

  const histories = new Map();
  if (has(history)) {
    keys(history, ['complete', 'records']);
    ensure(history.complete === true && Array.isArray(history.records) && history.records.length <= 10000, 'complete_savings_history_required');
    const seen = new Set(), goalIds = new Set(records.savings.map(goal => goal?.id));
    for (const source of history.records) {
      keys(source, ['id', 'userId', 'groupId', 'goalId', 'goalName', 'amount', 'date', 'period', 'contributionType', 'source', 'note', 'currency', 'createdAt']);
      ensure(typeof source.id === 'string' && source.id.length > 0 && source.id.length <= 200 && !seen.has(source.id), 'duplicate_or_invalid_contribution_id');
      seen.add(source.id);
      ensure((!has(source.userId) || source.userId === userId) && !has(source.groupId) && goalIds.has(source.goalId), 'contribution_ownership_mismatch');
      const contributionDate = date(source.date);
      ensure(month(source.period) === contributionDate.slice(0, 7), 'contribution_period_mismatch');
      const target = { id: id('savingsEntries', source.id), goalId: id('savings', source.goalId), goalName: source.goalName, date: contributionDate,
        amountMinor: money(source.amount), currencyCode: currency(source.currency), contributionType: source.contributionType,
        source: text(source.source), note: text(source.note), createdAt: source.createdAt, updatedAt: source.createdAt };
      const list = histories.get(source.goalId) ?? []; list.push(target); histories.set(source.goalId, list);
      recordProvenance('savingsEntries', source, target);
    }
  }
  const currentMonth = date(now).slice(0, 7);
  convert('savings', savingsGoals, source => {
    keys(source, ['id', 'userId', 'name', 'category', 'targetAmount', 'currentAmount', 'monthlyContribution', 'targetDate', 'startDate', 'achievedDate', 'status', 'isActive', 'priority', 'progressPercentage', 'monthsToGoal', 'onTrack', 'description', 'emoji', 'currency', 'createdAt', 'updatedAt', 'lastContributionAt']);
    const common = base(source, 'savings');
    ensure(history?.complete === true, 'complete_savings_history_required');
    const contributions = histories.get(source.id) ?? [];
    const current = money(source.currentAmount, true), target = money(source.targetAmount), monthly = money(source.monthlyContribution, true);
    const contributed = contributions.reduce((total, entry) => total + BigInt(entry.amountMinor), 0n);
    ensure(contributed <= BigInt(current), 'savings_balance_history_conflict');
    // Both historical writers used percent caches; one rounded to two decimals.
    // Compare their rounded value with exact integer cents, retaining the original.
    const roundedProgress = (BigInt(current) * 20000n + BigInt(target)) / (BigInt(target) * 2n);
    const expectedProgressBps = Number(roundedProgress > 10000n ? 10000n : roundedProgress);
    if (has(source.progressPercentage)) {
      ensure(typeof source.progressPercentage === 'number' && Number.isFinite(source.progressPercentage) && source.progressPercentage >= 0 && Math.round(source.progressPercentage * 100) === expectedProgressBps, 'cached_savings_progress_conflict');
    }
    const expectedMonths = monthly === 0 ? null : current >= target ? 0 : Number((BigInt(target - current) + BigInt(monthly) - 1n) / BigInt(monthly));
    if (has(source.monthsToGoal)) ensure(source.monthsToGoal === expectedMonths, 'cached_savings_months_conflict');
    const status = source.status ?? 'active', isActive = boolean(source.isActive, true);
    const thisMonth = contributions.filter(entry => entry.date.slice(0, 7) === currentMonth).reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
    const expectedOnTrack = isActive && status === 'active' && thisMonth * 10n >= BigInt(monthly) * 9n;
    if (has(source.onTrack)) ensure(source.onTrack === expectedOnTrack, 'cached_savings_track_conflict');
    const goal = { ...common, name: source.name, category: source.category, targetMinor: target, openingMinor: current - Number(contributed),
      monthlyContributionMinor: monthly, currencyCode: currency(source.currency), status, isActive, priority: source.priority ?? 'medium',
      description: text(source.description), emoji: text(source.emoji), startDate: date(source.startDate), targetDate: optionalDate(source.targetDate),
      achievedDate: optionalDate(source.achievedDate), lastContributionAt: source.lastContributionAt ?? null };
    savingsEntries.push(...contributions);
    return goal;
  });
  return { budgets, incomeSources, incomeEntries: [], savingsGoals, savingsEntries, recurringExpenses: [], issues, provenance };
}
