import {
  PersonalIncomeSource,
  GroupIncomeSource,
  IncomeFrequency,
  MonthlyIncomeRecord,
} from '../types/income';
import { PersonalSavingsGoal, GroupSavingsGoal } from '../types/savings';

/**
 * Calculate monthly income from various frequencies
 */
export function calculateMonthlyIncome(
  amount: number,
  frequency: IncomeFrequency
): number {
  switch (frequency) {
    case IncomeFrequency.MONTHLY:
      return amount;
    case IncomeFrequency.BIWEEKLY:
      return (amount * 26) / 12; // 26 pay periods per year
    case IncomeFrequency.WEEKLY:
      return (amount * 52) / 12; // 52 weeks per year
    case IncomeFrequency.YEARLY:
      return amount / 12;
    case IncomeFrequency.ONCE:
      return 0; // One-time income not counted in monthly
    default:
      return amount;
  }
}

/**
 * Calculate total monthly income from all sources
 */
export function calculateTotalMonthlyIncome(
  sources: (PersonalIncomeSource | GroupIncomeSource)[]
): number {
  return sources
    .filter((source) => source.isActive)
    .reduce((total, source) => {
      return total + calculateMonthlyIncome(source.amount, source.frequency);
    }, 0);
}

/**
 * Calculate total monthly savings allocation
 */
export function calculateTotalMonthlySavings(
  goals: (PersonalSavingsGoal | GroupSavingsGoal)[]
): number {
  return goals
    .filter((goal) => goal.isActive && goal.status === 'active')
    .reduce((total, goal) => total + goal.monthlyContribution, 0);
}

/**
 * Calculate budget allocation percentage
 */
export function calculateAllocationPercentage(
  totalIncome: number,
  totalExpenses: number,
  totalSavings: number
): number {
  if (totalIncome === 0) return 0;
  const totalAllocated = totalExpenses + totalSavings;
  return Math.round((totalAllocated / totalIncome) * 100 * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate savings rate percentage
 */
export function calculateSavingsRate(
  totalIncome: number,
  totalSavings: number
): number {
  if (totalIncome === 0) return 0;
  return Math.round((totalSavings / totalIncome) * 100 * 100) / 100;
}

/**
 * Calculate unallocated income
 */
export function calculateUnallocatedIncome(
  totalIncome: number,
  totalExpenses: number,
  totalSavings: number
): number {
  return totalIncome - totalExpenses - totalSavings;
}

/**
 * Check if budget is over-allocated
 */
export function isOverAllocated(
  totalIncome: number,
  totalExpenses: number,
  totalSavings: number
): boolean {
  return totalExpenses + totalSavings > totalIncome;
}

/**
 * Calculate over-allocation amount
 */
export function calculateOverAllocationAmount(
  totalIncome: number,
  totalExpenses: number,
  totalSavings: number
): number {
  const allocated = totalExpenses + totalSavings;
  return allocated > totalIncome ? allocated - totalIncome : 0;
}

/**
 * Check if following 50/30/20 rule
 * @returns Object with needs%, wants%, savings% and whether it's within guidelines
 */
export function check503020Rule(
  totalIncome: number,
  needsExpenses: number,
  wantsExpenses: number,
  savings: number
): {
  needsPercentage: number;
  wantsPercentage: number;
  savingsPercentage: number;
  isWithinGuidelines: boolean;
  recommendations: string[];
} {
  if (totalIncome === 0) {
    return {
      needsPercentage: 0,
      wantsPercentage: 0,
      savingsPercentage: 0,
      isWithinGuidelines: false,
      recommendations: ['Add income to get budget recommendations'],
    };
  }

  const needsPercentage = (needsExpenses / totalIncome) * 100;
  const wantsPercentage = (wantsExpenses / totalIncome) * 100;
  const savingsPercentage = (savings / totalIncome) * 100;

  const recommendations: string[] = [];
  let isWithinGuidelines = true;

  // Check needs (should be ~50%)
  if (needsPercentage > 60) {
    isWithinGuidelines = false;
    recommendations.push(
      `Needs are ${needsPercentage.toFixed(0)}% (aim for 50%). Consider reducing essential expenses.`
    );
  }

  // Check wants (should be ~30%)
  if (wantsPercentage > 40) {
    isWithinGuidelines = false;
    recommendations.push(
      `Wants are ${wantsPercentage.toFixed(0)}% (aim for 30%). Consider reducing discretionary spending.`
    );
  }

  // Check savings (should be ~20%)
  if (savingsPercentage < 15) {
    isWithinGuidelines = false;
    recommendations.push(
      `Savings are ${savingsPercentage.toFixed(0)}% (aim for 20%). Try to save more.`
    );
  }

  if (isWithinGuidelines) {
    recommendations.push('Great! Your budget follows the 50/30/20 rule.');
  }

  return {
    needsPercentage: Math.round(needsPercentage * 100) / 100,
    wantsPercentage: Math.round(wantsPercentage * 100) / 100,
    savingsPercentage: Math.round(savingsPercentage * 100) / 100,
    isWithinGuidelines,
    recommendations,
  };
}

/**
 * Calculate months to reach savings goal
 */
export function calculateMonthsToGoal(
  currentAmount: number,
  targetAmount: number,
  monthlyContribution: number
): number | null {
  if (monthlyContribution <= 0) return null;
  if (currentAmount >= targetAmount) return 0;

  const remaining = targetAmount - currentAmount;
  return Math.ceil(remaining / monthlyContribution);
}

/**
 * Calculate if savings goal is on track
 */
export function isSavingsGoalOnTrack(
  goal: PersonalSavingsGoal | GroupSavingsGoal,
  actualContributionsThisMonth: number
): boolean {
  // If no contributions yet this month, assume on track if goal is active
  if (actualContributionsThisMonth === 0 && goal.isActive) {
    return true; // Give benefit of doubt at start of month
  }

  // Check if actual contributions meet the planned amount
  return actualContributionsThisMonth >= goal.monthlyContribution * 0.9; // 90% threshold
}

/**
 * Calculate year-to-date income
 */
export function calculateYTDIncome(
  monthlyRecords: MonthlyIncomeRecord[],
  currentYear: number
): number {
  return monthlyRecords
    .filter((record) => record.period.year === currentYear)
    .reduce((total, record) => total + record.totalIncome, 0);
}

/**
 * Calculate year-to-date savings
 */
export function calculateYTDSavings(
  monthlyRecords: MonthlyIncomeRecord[],
  currentYear: number
): number {
  return monthlyRecords
    .filter((record) => record.period.year === currentYear)
    .reduce((total, record) => total + record.totalSavingsAllocated, 0);
}

/**
 * Format currency
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  decimals: number = 0
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

