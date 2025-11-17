'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { cn } from '@/lib/utils';

interface AllocationPreviewProps {
  income: number;
  budgets: number;
  savings: number;
  newBudgetAmount?: number;
  newSavingsAmount?: number;
  showNewAmounts?: boolean;
}

export function AllocationPreview({
  income,
  budgets,
  savings,
  newBudgetAmount = 0,
  newSavingsAmount = 0,
  showNewAmounts = false,
}: AllocationPreviewProps) {
  const totalBudgets = budgets + (showNewAmounts ? newBudgetAmount : 0);
  const totalSavings = savings + (showNewAmounts ? newSavingsAmount : 0);
  const totalAllocated = totalBudgets + totalSavings;
  const unallocated = income - totalAllocated;
  const isOverAllocated = unallocated < 0;

  const budgetPercentage = income > 0 ? (totalBudgets / income) * 100 : 0;
  const savingsPercentage = income > 0 ? (totalSavings / income) * 100 : 0;
  const unallocatedPercentage = income > 0 ? Math.max(0, (unallocated / income) * 100) : 0;
  const overPercentage = income > 0 ? Math.max(0, (Math.abs(unallocated) / income) * 100) : 0;

  return (
    <Card className={cn(
      "border-2",
      isOverAllocated ? "border-red-200 dark:border-red-800" : "border-border"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Allocation Preview</span>
          {isOverAllocated && (
            <span className="text-xs text-red-600 font-normal">
              Over by {formatCurrency(Math.abs(unallocated), 'USD')}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Income */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Monthly Income:</span>
          <span className="font-semibold">{formatCurrency(income, 'USD')}</span>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-2">
          <div className="relative h-8 rounded-full overflow-hidden bg-muted">
            {/* Budgets */}
            {budgetPercentage > 0 && (
              <div
                className="absolute h-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
              />
            )}
            {/* Savings */}
            {savingsPercentage > 0 && (
              <div
                className="absolute h-full bg-green-500 transition-all"
                style={{
                  left: `${Math.min(budgetPercentage, 100)}%`,
                  width: `${Math.min(savingsPercentage, 100 - budgetPercentage)}%`,
                }}
              />
            )}
            {/* Over-allocation */}
            {isOverAllocated && (
              <div
                className="absolute h-full bg-red-500 opacity-50 transition-all"
                style={{
                  left: `${Math.min(budgetPercentage + savingsPercentage, 100)}%`,
                  width: `${Math.min(overPercentage, 100 - budgetPercentage - savingsPercentage)}%`,
                }}
              />
            )}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span className="text-muted-foreground">Budgets</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span className="text-muted-foreground">Savings</span>
            </div>
            {!isOverAllocated && unallocatedPercentage > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-muted" />
                <span className="text-muted-foreground">Available</span>
              </div>
            )}
            {isOverAllocated && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <span className="text-muted-foreground">Over</span>
              </div>
            )}
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Budgets:</span>
            <span className={cn(
              showNewAmounts && newBudgetAmount > 0 && "font-semibold text-primary"
            )}>
              {formatCurrency(totalBudgets, 'USD')}
              {showNewAmounts && newBudgetAmount > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  (+{formatCurrency(newBudgetAmount, 'USD')})
                </span>
              )}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Savings:</span>
            <span className={cn(
              showNewAmounts && newSavingsAmount > 0 && "font-semibold text-primary"
            )}>
              {formatCurrency(totalSavings, 'USD')}
              {showNewAmounts && newSavingsAmount > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  (+{formatCurrency(newSavingsAmount, 'USD')})
                </span>
              )}
            </span>
          </div>

          <div className="flex justify-between text-sm font-medium pt-2 border-t">
            <span className={isOverAllocated ? "text-red-600" : ""}>
              {isOverAllocated ? "Over-Allocated:" : "Available:"}
            </span>
            <span className={isOverAllocated ? "text-red-600" : "text-green-600"}>
              {formatCurrency(Math.abs(unallocated), 'USD')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

