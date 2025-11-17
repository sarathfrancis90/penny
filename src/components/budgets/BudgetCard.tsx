"use client";

import { BudgetUsage } from "@/lib/types";
import { formatCurrency, formatPercentage } from "@/lib/budgetCalculations";
import { BudgetProgressBar } from "./BudgetProgressBar";
import { BudgetStatusBadge } from "./BudgetStatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface BudgetCardProps {
  budget: BudgetUsage;
  onClick?: () => void;
  className?: string;
}

/**
 * Card component for displaying budget information
 */
export function BudgetCard({ budget, onClick, className }: BudgetCardProps) {
  const isClickable = !!onClick;
  const trendIsPositive =
    budget.trend?.comparedToPreviousMonth !== undefined &&
    budget.trend.comparedToPreviousMonth < 0; // Lower spending is positive

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-lg",
        isClickable && "cursor-pointer hover:border-violet-400",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">
            {budget.category}
          </CardTitle>
          <BudgetStatusBadge status={budget.status} size="sm" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Amount Display */}
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">
              {formatCurrency(budget.totalSpent)}
            </span>
            <span className="text-sm text-muted-foreground">
              of {formatCurrency(budget.budgetLimit)}
            </span>
          </div>
          <BudgetProgressBar
            percentageUsed={budget.percentageUsed}
            status={budget.status}
            showPercentage={false}
            height="md"
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* Remaining Amount */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign size={12} />
              <span>Remaining</span>
            </div>
            <p
              className={cn(
                "text-sm font-semibold",
                budget.remainingAmount >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {formatCurrency(Math.abs(budget.remainingAmount))}
              {budget.remainingAmount < 0 && " over"}
            </p>
          </div>

          {/* Percentage Used */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar size={12} />
              <span>Used</span>
            </div>
            <p className="text-sm font-semibold">
              {formatPercentage(budget.percentageUsed)}
            </p>
          </div>
        </div>

        {/* Trend (if available) */}
        {budget.trend && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">vs Last Month</span>
              <div
                className={cn(
                  "flex items-center gap-1 font-medium",
                  trendIsPositive
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {trendIsPositive ? (
                  <TrendingDown size={14} />
                ) : (
                  <TrendingUp size={14} />
                )}
                <span>
                  {Math.abs(budget.trend.comparedToPreviousMonth).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Projection */}
            {budget.trend.projectedEndOfMonthTotal > budget.budgetLimit && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                <span className="font-medium">Projected:</span>{" "}
                {formatCurrency(budget.trend.projectedEndOfMonthTotal)} (
                {budget.trend.daysUntilOverBudget !== undefined &&
                  `${budget.trend.daysUntilOverBudget} days to limit`}
                )
              </div>
            )}
          </div>
        )}

        {/* Expense Count */}
        <div className="text-xs text-muted-foreground text-center pt-1">
          {budget.expenseCount} {budget.expenseCount === 1 ? "expense" : "expenses"}
        </div>
      </CardContent>
    </Card>
  );
}

