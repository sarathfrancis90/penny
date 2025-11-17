import { NotificationService } from './notificationService';
import { NotificationType } from '../types/notifications';
import { PersonalSavingsGoal, GroupSavingsGoal } from '../types/savings';
import { MonthlyIncomeRecord } from '../types/income';

/**
 * Notification service for Income & Savings milestones
 */
export class IncomeSavingsNotificationService {
  /**
   * Notify when a savings goal is achieved
   */
  static async notifySavingsGoalAchieved(
    userId: string,
    goal: PersonalSavingsGoal | GroupSavingsGoal,
    isGroup: boolean = false
  ) {
    const title = `🎉 Goal Achieved: ${goal.name}!`;
    const body = `Congratulations! You've reached your ${goal.emoji || ''} ${goal.name} goal of $${goal.targetAmount.toLocaleString()}!`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'savings',
      title,
      body,
      priority: 'high',
      metadata: {
        goalId: goal.id,
        goalName: goal.name,
        targetAmount: goal.targetAmount,
        isGroup,
      },
    });
  }

  /**
   * Notify when a savings goal reaches 50%, 75%, 90%
   */
  static async notifySavingsGoalMilestone(
    userId: string,
    goal: PersonalSavingsGoal | GroupSavingsGoal,
    percentage: number,
    isGroup: boolean = false
  ) {
    const title = `${goal.emoji || '🎯'} ${percentage}% Progress: ${goal.name}`;
    const body = `You're ${percentage}% of the way to your ${goal.name} goal! Keep up the great work!`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'savings',
      title,
      body,
      priority: 'medium',
      metadata: {
        goalId: goal.id,
        goalName: goal.name,
        percentage,
        currentAmount: goal.currentAmount,
        targetAmount: goal.targetAmount,
        isGroup,
      },
    });
  }

  /**
   * Notify when monthly setup is completed
   */
  static async notifyMonthlySetupComplete(
    userId: string,
    setupData: {
      totalIncome: number;
      totalExpenseBudgets: number;
      totalSavings: number;
      savingsRate: number;
    }
  ) {
    const title = '✅ Monthly Budget Set Up Complete';
    const body = `Your budget for ${new Date().toLocaleDateString('en-US', { month: 'long' })} is ready! Income: $${setupData.totalIncome.toLocaleString()}, Savings rate: ${setupData.savingsRate.toFixed(1)}%`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'budget',
      title,
      body,
      priority: 'medium',
      metadata: setupData,
    });
  }

  /**
   * Notify when savings rate exceeds threshold (20%, 30%, 40%)
   */
  static async notifyHighSavingsRate(
    userId: string,
    savingsRate: number,
    totalSaved: number
  ) {
    const title = '🌟 Excellent Savings Rate!';
    const body = `Amazing! You're saving ${savingsRate.toFixed(1)}% of your income. You've saved $${totalSaved.toLocaleString()} this month!`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'savings',
      title,
      body,
      priority: 'medium',
      metadata: {
        savingsRate,
        totalSaved,
      },
    });
  }

  /**
   * Notify when monthly income changes significantly (>10%)
   */
  static async notifyIncomeChange(
    userId: string,
    previousIncome: number,
    currentIncome: number
  ) {
    const change = currentIncome - previousIncome;
    const changePercentage = (Math.abs(change) / previousIncome) * 100;
    const isIncrease = change > 0;

    const title = isIncrease
      ? '📈 Income Increased!'
      : '📉 Income Decreased';
    
    const body = isIncrease
      ? `Your income increased by $${change.toLocaleString()} (${changePercentage.toFixed(1)}%) this month. Consider updating your budgets and savings goals.`
      : `Your income decreased by $${Math.abs(change).toLocaleString()} (${changePercentage.toFixed(1)}%) this month. Review your budgets to adjust.`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'income',
      title,
      body,
      priority: isIncrease ? 'medium' : 'high',
      metadata: {
        previousIncome,
        currentIncome,
        change,
        changePercentage,
      },
    });
  }

  /**
   * Notify when unallocated income is detected
   */
  static async notifyUnallocatedIncome(
    userId: string,
    unallocatedAmount: number,
    totalIncome: number
  ) {
    const percentage = (unallocatedAmount / totalIncome) * 100;
    
    if (percentage < 5) return; // Don't notify for small amounts

    const title = '💡 Unallocated Income Detected';
    const body = `You have $${unallocatedAmount.toLocaleString()} (${percentage.toFixed(1)}%) unallocated. Consider adding it to savings or adjusting your budgets.`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'budget',
      title,
      body,
      priority: 'medium',
      metadata: {
        unallocatedAmount,
        totalIncome,
        percentage,
      },
    });
  }

  /**
   * Notify when all savings goals for the month are met
   */
  static async notifyAllSavingsGoalsMet(
    userId: string,
    goalsCount: number,
    totalSaved: number
  ) {
    const title = '🎯 All Savings Goals Met!';
    const body = `Excellent work! You've met all ${goalsCount} savings goals this month, saving $${totalSaved.toLocaleString()} total!`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'savings',
      title,
      body,
      priority: 'high',
      metadata: {
        goalsCount,
        totalSaved,
      },
    });
  }

  /**
   * Notify when monthly setup is due
   */
  static async notifyMonthlySetupDue(userId: string) {
    const month = new Date().toLocaleDateString('en-US', { month: 'long' });
    const title = '📅 Time to Set Up Your Budget';
    const body = `It's a new month! Complete your budget setup for ${month} to stay on track with your financial goals.`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'budget',
      title,
      body,
      priority: 'high',
      metadata: {
        month,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Notify when financial health score improves significantly
   */
  static async notifyFinancialHealthImprovement(
    userId: string,
    previousScore: number,
    currentScore: number
  ) {
    const improvement = currentScore - previousScore;
    
    if (improvement < 10) return; // Only notify for significant improvements

    const title = '⭐ Financial Health Improved!';
    const body = `Great progress! Your financial health score improved from ${previousScore} to ${currentScore} (+${improvement} points)!`;

    await NotificationService.create({
      userId,
      type: NotificationType.MILESTONE,
      category: 'system',
      title,
      body,
      priority: 'medium',
      metadata: {
        previousScore,
        currentScore,
        improvement,
      },
    });
  }
}

