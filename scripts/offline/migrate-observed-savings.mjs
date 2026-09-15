// Snapshot-at-readTime balance conversion only; never a contribution-history assertion.
import { parseAmount, validTimestamp } from '../../packages/offline-contract/contract.mjs';
import { financeLimits, validateSavingsGoal } from '../../packages/offline-contract/finance.mjs';
import { civilDate, legacyUUID } from './migrate-legacy.mjs';

const fields = 'id userId name category targetAmount currentAmount monthlyContribution targetDate startDate achievedDate status isActive priority progressPercentage monthsToGoal onTrack description emoji currency createdAt updatedAt lastContributionAt'.split(' ');
const ensure = (ok, reason) => { if (!ok) throw new Error(reason); };
function money(value, zero = false) {
  ensure(typeof value === 'number' && Number.isFinite(value), 'invalid_observed_savings_money');
  return zero && value === 0 ? 0 : parseAmount(value.toString());
}
export function convertObservedSavings(records, { userId, timeZone, readTime }) {
  ensure(Array.isArray(records) && records.length <= financeLimits.savingsGoals, 'savingsGoals_limit');
  const goals = [], issues = [], mappings = [], seen = new Set();
  for (const source of records) {
    try {
      ensure(source && typeof source === 'object' && !Array.isArray(source) && Object.keys(source).every(k => fields.includes(k)), 'unrepresented_observed_savings_field');
      ensure(source.userId === userId, 'observed_savings_owner');
      ensure(typeof source.id === 'string' && source.id.length > 0 && source.id.length <= 200 && !seen.has(source.id), 'duplicate_or_invalid_savings_id'); seen.add(source.id);
      ensure(source.currency === 'CAD', 'unsupported_currency');
      for (const key of ['progressPercentage', 'monthsToGoal']) if (source[key] !== undefined && !(key === 'monthsToGoal' && source[key] === null)) {
        ensure(typeof source[key] === 'number' && Number.isFinite(source[key]) && source[key] >= 0 && (key !== 'monthsToGoal' || Number.isSafeInteger(source[key])), 'invalid_savings_cache_type');
      }
      ensure(source.onTrack === undefined || typeof source.onTrack === 'boolean', 'invalid_savings_cache_type');
      for (const key of ['description', 'emoji']) ensure(source[key] === undefined || source[key] === null || typeof source[key] === 'string', 'invalid_savings_text');
      const optionalDate = v => v === undefined || v === null ? null : civilDate(v, timeZone);
      ensure(source.lastContributionAt === undefined || source.lastContributionAt === null || validTimestamp(source.lastContributionAt), 'invalid_timestamp');
      const goal = validateSavingsGoal({
        id: legacyUUID(userId, JSON.stringify(['savings', source.id])), name: source.name, category: source.category,
        targetMinor: money(source.targetAmount), openingMinor: money(source.currentAmount, true), monthlyContributionMinor: money(source.monthlyContribution, true), currencyCode: 'CAD',
        status: source.status, isActive: source.isActive, priority: source.priority, description: source.description ?? '', emoji: source.emoji ?? '',
        startDate: civilDate(source.startDate, timeZone), targetDate: optionalDate(source.targetDate), achievedDate: optionalDate(source.achievedDate),
        lastContributionAt: source.lastContributionAt ?? null, createdAt: source.createdAt, updatedAt: source.updatedAt,
      });
      goals.push(goal);
      mappings.push({ sourceId: source.id, nativeId: goal.id, observedCurrentMinor: goal.openingMinor, nativeOpeningMinor: goal.openingMinor, originalRecord: structuredClone(source) });
    } catch (error) { issues.push({ domain: 'savings_goals_personal', sourceId: typeof source?.id === 'string' ? source.id : null, reason: error.message }); }
  }
  return { goals, issues, report: { mode: 'recorded_balance_at_read_time', readTime, historyCompletenessEstablished: false, originalOpeningBalanceEstablished: false,
    contributionRowsImported: 0, derivedDisplayParityEstablished: false, mappings } };
}
