'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency, formatPercentage } from '@/lib/utils/incomeCalculations';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

interface AllocationSummaryProps {
  totalIncome: number;
  totalExpenseBudgets: number;
  totalSavings: number;
  expensesByCategory?: Array<{ category: string; amount: number; emoji?: string }>;
  savingsByGoal?: Array<{ goalId: string; goalName: string; amount: number; emoji?: string }>;
}

export function AllocationSummary({
  totalIncome,
  totalExpenseBudgets,
  totalSavings,
  expensesByCategory = [],
  savingsByGoal = [],
}: AllocationSummaryProps) {
  const totalAllocated = totalExpenseBudgets + totalSavings;
  const unallocated = totalIncome - totalAllocated;
  const allocationPercentage = totalIncome > 0 ? (totalAllocated / totalIncome) * 100 : 0;
  const isOverAllocated = unallocated < 0;
  
  const expensePercentage = totalIncome > 0 ? (totalExpenseBudgets / totalIncome) * 100 : 0;
  const savingsPercentage = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;
  const unallocatedPercentage = totalIncome > 0 ? Math.abs((unallocated / totalIncome) * 100) : 0;

  // 50/30/20 rule check
  const isSavingsHealthy = savingsPercentage >= 20;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const areExpensesReasonable = expensePercentage <= 80;

  return (
    <div className="space-y-6">
      {/* Total Allocation Card */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Allocation Overview</CardTitle>
          <CardDescription>
            How your income of {formatCurrency(totalIncome, 'USD')} is allocated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visual Breakdown */}
          <div className="space-y-3">
            {/* Expenses Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Expense Budgets</span>
                <span className="text-muted-foreground">
                  {formatCurrency(totalExpenseBudgets, 'USD')} ({formatPercentage(expensePercentage)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={expensePercentage} className="flex-1 h-3 [&>div]:bg-blue-500" />
                <span className="text-sm font-medium w-16 text-right">
                  {formatPercentage(expensePercentage)}
                </span>
              </div>
            </div>

            {/* Savings Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Savings Goals</span>
                <span className="text-muted-foreground">
                  {formatCurrency(totalSavings, 'USD')} ({formatPercentage(savingsPercentage)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={savingsPercentage} className="flex-1 h-3 [&>div]:bg-green-500" />
                <span className="text-sm font-medium w-16 text-right">
                  {formatPercentage(savingsPercentage)}
                </span>
              </div>
            </div>

            {/* Unallocated/Over-allocated Bar */}
            {!isOverAllocated && unallocated > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Unallocated</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(unallocated, 'USD')} ({formatPercentage(unallocatedPercentage)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={unallocatedPercentage} className="flex-1 h-3 [&>div]:bg-gray-400" />
                  <span className="text-sm font-medium w-16 text-right">
                    {formatPercentage(unallocatedPercentage)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{formatPercentage(allocationPercentage)}</div>
              <div className="text-xs text-muted-foreground">Total Allocated</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{formatPercentage(savingsPercentage)}</div>
              <div className="text-xs text-muted-foreground">Savings Rate</div>
            </div>
          </div>

          {/* Alerts */}
          {isOverAllocated && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-semibold">Over-Allocated:</span> You&apos;ve allocated{' '}
                {formatCurrency(Math.abs(unallocated), 'USD')} more than your income. Please adjust your
                budgets.
              </AlertDescription>
            </Alert>
          )}

          {!isOverAllocated && unallocated > 0 && (
            <Alert>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                <span className="font-semibold">Unallocated Funds:</span> You have{' '}
                {formatCurrency(unallocated, 'USD')} ({formatPercentage(unallocatedPercentage)}) unallocated.
                Consider adding to savings or budgets.
              </AlertDescription>
            </Alert>
          )}

          {!isOverAllocated && unallocated === 0 && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-600">
                <span className="font-semibold">Perfect Allocation!</span> You&apos;ve allocated 100% of your
                income.
              </AlertDescription>
            </Alert>
          )}

          {!isSavingsHealthy && !isOverAllocated && (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                <span className="font-semibold">Savings Tip:</span> Your savings rate is{' '}
                {formatPercentage(savingsPercentage)}. Financial experts recommend saving at least 20% of your
                income.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detailed Breakdown Cards */}
      {(expensesByCategory.length > 0 || savingsByGoal.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Expense Categories */}
          {expensesByCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expense Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expensesByCategory
                    .filter((cat) => cat.amount > 0)
                    .sort((a, b) => b.amount - a.amount)
                    .map((category, index) => {
                      const percentage = (category.amount / totalIncome) * 100;
                      return (
                        <div key={index} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>
                              {category.emoji && <span className="mr-1">{category.emoji}</span>}
                              {category.category}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(category.amount, 'USD')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={percentage} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {formatPercentage(percentage)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Savings Goals */}
          {savingsByGoal.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Savings Goals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {savingsByGoal
                    .filter((goal) => goal.amount > 0)
                    .sort((a, b) => b.amount - a.amount)
                    .map((goal, index) => {
                      const percentage = (goal.amount / totalIncome) * 100;
                      return (
                        <div key={index} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>
                              {goal.emoji && <span className="mr-1">{goal.emoji}</span>}
                              {goal.goalName}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(goal.amount, 'USD')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={percentage} className="flex-1 h-2 [&>div]:bg-green-500" />
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {formatPercentage(percentage)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

