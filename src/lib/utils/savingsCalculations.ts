import {
  PersonalSavingsGoal,
  GroupSavingsGoal,
  SavingsContribution,
  GoalStatus,
  SavingsCategory,
} from '../types/savings';

/**
 * Calculate progress percentage for a savings goal
 */
export function calculateProgressPercentage(
  currentAmount: number,
  targetAmount: number
): number {
  if (targetAmount <= 0) return 0;
  const percentage = (currentAmount / targetAmount) * 100;
  return Math.min(Math.round(percentage * 100) / 100, 100); // Cap at 100%, 2 decimals
}

/**
 * Calculate months remaining to reach goal
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
 * Check if goal is on track based on contributions
 */
export function isGoalOnTrack(
  goal: PersonalSavingsGoal | GroupSavingsGoal,
  contributionsThisMonth: SavingsContribution[]
): boolean {
  if (!goal.isActive || goal.status !== GoalStatus.ACTIVE) {
    return false;
  }

  const totalContributed = contributionsThisMonth.reduce(
    (sum, contribution) => sum + contribution.amount,
    0
  );

  // On track if contributions are at least 90% of planned amount
  return totalContributed >= goal.monthlyContribution * 0.9;
}

/**
 * Calculate total contributions for a goal
 */
export function calculateTotalContributions(
  contributions: SavingsContribution[]
): number {
  return contributions.reduce((sum, contribution) => sum + contribution.amount, 0);
}

/**
 * Calculate contributions by category
 */
export function calculateContributionsByCategory(
  goals: (PersonalSavingsGoal | GroupSavingsGoal)[],
  contributions: SavingsContribution[]
): Record<SavingsCategory, number> {
  const byCategory: Partial<Record<SavingsCategory, number>> = {};

  goals.forEach((goal) => {
    const goalContributions = contributions.filter((c) => c.goalId === goal.id);
    const total = calculateTotalContributions(goalContributions);

    if (byCategory[goal.category]) {
      byCategory[goal.category]! += total;
    } else {
      byCategory[goal.category] = total;
    }
  });

  return byCategory as Record<SavingsCategory, number>;
}

/**
 * Calculate YTD savings by category
 */
export function calculateYTDByCategory(
  goals: (PersonalSavingsGoal | GroupSavingsGoal)[],
  contributions: SavingsContribution[],
  currentYear: number
): Record<SavingsCategory, number> {
  const ytdContributions = contributions.filter(
    (c) => c.period.year === currentYear
  );

  return calculateContributionsByCategory(goals, ytdContributions);
}

/**
 * Check if all savings goals are met for a month
 */
export function areAllGoalsMet(
  goals: (PersonalSavingsGoal | GroupSavingsGoal)[],
  contributions: SavingsContribution[],
  month: number,
  year: number
): boolean {
  const activeGoals = goals.filter(
    (g) => g.isActive && g.status === GoalStatus.ACTIVE
  );

  if (activeGoals.length === 0) return true;

  return activeGoals.every((goal) => {
    const monthContributions = contributions.filter(
      (c) =>
        c.goalId === goal.id &&
        c.period.month === month &&
        c.period.year === year
    );

    const totalContributed = calculateTotalContributions(monthContributions);
    return totalContributed >= goal.monthlyContribution;
  });
}

/**
 * Get goal completion status
 */
export function getGoalCompletionStatus(
  goal: PersonalSavingsGoal | GroupSavingsGoal
): {
  isComplete: boolean;
  percentageComplete: number;
  amountRemaining: number;
  monthsRemaining: number | null;
} {
  const percentageComplete = calculateProgressPercentage(
    goal.currentAmount,
    goal.targetAmount
  );
  const isComplete = goal.currentAmount >= goal.targetAmount;
  const amountRemaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const monthsRemaining = calculateMonthsToGoal(
    goal.currentAmount,
    goal.targetAmount,
    goal.monthlyContribution
  );

  return {
    isComplete,
    percentageComplete,
    amountRemaining,
    monthsRemaining,
  };
}

/**
 * Get savings recommendations based on income
 */
export function getSavingsRecommendations(
  totalIncome: number,
  currentSavingsAllocation: number
): {
  recommendedAmount: number;
  currentPercentage: number;
  recommendedPercentage: number;
  message: string;
} {
  const recommendedPercentage = 20; // 20% of income
  const recommendedAmount = totalIncome * 0.2;
  const currentPercentage =
    totalIncome > 0 ? (currentSavingsAllocation / totalIncome) * 100 : 0;

  let message: string;
  if (currentPercentage < 10) {
    message =
      'Your savings rate is low. Try to save at least 20% of your income.';
  } else if (currentPercentage < 20) {
    message =
      'Good start! Try to increase your savings to 20% for optimal financial health.';
  } else if (currentPercentage < 30) {
    message = 'Great! You are saving 20%+. Keep it up!';
  } else {
    message = 'Excellent! You are saving 30%+. You are on track for financial independence!';
  }

  return {
    recommendedAmount,
    currentPercentage: Math.round(currentPercentage * 100) / 100,
    recommendedPercentage,
    message,
  };
}

/**
 * Prioritize goals by urgency
 */
export function prioritizeGoals(
  goals: (PersonalSavingsGoal | GroupSavingsGoal)[]
): (PersonalSavingsGoal | GroupSavingsGoal)[] {
  return [...goals].sort((a, b) => {
    // First by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff =
      priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by progress (less progress first)
    const progressDiff = a.progressPercentage - b.progressPercentage;
    if (progressDiff !== 0) return progressDiff;

    // Finally by target date (closest first)
    if (a.targetDate && b.targetDate) {
      return a.targetDate.seconds - b.targetDate.seconds;
    }

    return 0;
  });
}

/**
 * Calculate savings velocity (rate of progress)
 */
export function calculateSavingsVelocity(
  goal: PersonalSavingsGoal | GroupSavingsGoal,
  recentContributions: SavingsContribution[]
): {
  averageMonthlyContribution: number;
  isAccelerating: boolean;
  projectedCompletionDate: Date | null;
} {
  if (recentContributions.length === 0) {
    return {
      averageMonthlyContribution: 0,
      isAccelerating: false,
      projectedCompletionDate: null,
    };
  }

  const totalContributed = calculateTotalContributions(recentContributions);
  const averageMonthlyContribution =
    totalContributed / recentContributions.length;

  // Check if accelerating (last 3 months vs previous 3 months)
  let isAccelerating = false;
  if (recentContributions.length >= 6) {
    const last3 = recentContributions.slice(0, 3);
    const previous3 = recentContributions.slice(3, 6);

    const last3Avg =
      calculateTotalContributions(last3) / last3.length;
    const previous3Avg =
      calculateTotalContributions(previous3) / previous3.length;

    isAccelerating = last3Avg > previous3Avg;
  }

  // Project completion date
  let projectedCompletionDate: Date | null = null;
  if (averageMonthlyContribution > 0) {
    const monthsRemaining = calculateMonthsToGoal(
      goal.currentAmount,
      goal.targetAmount,
      averageMonthlyContribution
    );

    if (monthsRemaining !== null) {
      projectedCompletionDate = new Date();
      projectedCompletionDate.setMonth(
        projectedCompletionDate.getMonth() + monthsRemaining
      );
    }
  }

  return {
    averageMonthlyContribution,
    isAccelerating,
    projectedCompletionDate,
  };
}

/**
 * Format goal progress for display
 */
export function formatGoalProgress(
  goal: PersonalSavingsGoal | GroupSavingsGoal
): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { percentageComplete, amountRemaining, monthsRemaining } =
    getGoalCompletionStatus(goal);

  if (percentageComplete >= 100) {
    return '🎉 Goal achieved!';
  }

  const parts: string[] = [];
  parts.push(`${percentageComplete.toFixed(1)}% complete`);

  if (monthsRemaining !== null) {
    if (monthsRemaining === 0) {
      parts.push('almost there!');
    } else if (monthsRemaining === 1) {
      parts.push('1 month to go');
    } else if (monthsRemaining <= 12) {
      parts.push(`${monthsRemaining} months to go`);
    } else {
      const years = Math.floor(monthsRemaining / 12);
      const months = monthsRemaining % 12;
      if (months === 0) {
        parts.push(`${years} year${years > 1 ? 's' : ''} to go`);
      } else {
        parts.push(`${years}y ${months}m to go`);
      }
    }
  }

  return parts.join(' • ');
}

