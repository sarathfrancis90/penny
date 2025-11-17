"use client";

import { useEffect, useMemo } from "react";
import { usePersonalBudgets } from "@/hooks/usePersonalBudgets";
import { useGroupBudgets } from "@/hooks/useGroupBudgets";
import { useBudgetUsage } from "@/hooks/useBudgetUsage";
import { getCurrentPeriod, calculateSimpleBudgetUsage, formatCurrency } from "@/lib/budgetCalculations";
import { BudgetProgressBar } from "./BudgetProgressBar";
import { BudgetStatusBadge } from "./BudgetStatusBadge";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface BudgetImpactPreviewProps {
  userId: string;
  category: string;
  amount: number;
  groupId?: string | null;
  onImpactCalculated?: (willExceedBudget: boolean) => void;
}

/**
 * Shows how a new expense will impact the relevant budget
 */
export function BudgetImpactPreview({
  userId,
  category,
  amount,
  groupId,
  onImpactCalculated,
}: BudgetImpactPreviewProps) {
  const currentPeriod = getCurrentPeriod();

  // Fetch the relevant budget
  const { budgets: personalBudgets } = usePersonalBudgets(
    groupId ? undefined : userId,
    category,
    currentPeriod.month,
    currentPeriod.year
  );

  const { budgets: groupBudgets } = useGroupBudgets(
    groupId || undefined,
    category,
    currentPeriod.month,
    currentPeriod.year
  );

  // Fetch current usage
  const { usage: personalUsage } = useBudgetUsage(
    groupId ? undefined : userId,
    "personal",
    undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const { usage: groupUsage } = useBudgetUsage(
    groupId ? userId : undefined,
    "group",
    groupId || undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const relevantBudget = groupId ? groupBudgets[0] : personalBudgets[0];
  const currentUsage = groupId
    ? groupUsage.find((u) => u.category === category)
    : personalUsage.find((u) => u.category === category);

  // Memoize calculations to ensure they update when amount changes
  const calculations = useMemo(() => {
    if (!relevantBudget || !currentUsage) {
      return null;
    }

    const afterExpense = {
      totalSpent: currentUsage.totalSpent + amount,
      percentageUsed:
        ((currentUsage.totalSpent + amount) / relevantBudget.monthlyLimit) * 100,
    };

    const newUsage = calculateSimpleBudgetUsage(
      relevantBudget.monthlyLimit,
      afterExpense.totalSpent
    );

    const newTotal = currentUsage.totalSpent + amount;
    const exceedsBudget = newTotal > relevantBudget.monthlyLimit;
    const statusChanged = newUsage.status !== currentUsage.status;

    return {
      afterExpense,
      newUsage,
      exceedsBudget,
      statusChanged,
    };
  }, [relevantBudget, currentUsage, amount]);

  // Update parent component when budget impact changes
  useEffect(() => {
    if (calculations) {
      onImpactCalculated?.(calculations.exceedsBudget);
    } else {
      onImpactCalculated?.(false);
    }
  }, [calculations, onImpactCalculated]);

  // If no budget exists for this category, don't show anything
  if (!relevantBudget || !currentUsage || !calculations) {
    return null;
  }

  const { afterExpense, newUsage, exceedsBudget, statusChanged } = calculations;

  return (
    <div
      className={cn(
        "p-4 rounded-lg border-2 space-y-3 animate-in slide-in-from-top-2 fade-in-50",
        exceedsBudget
          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          : statusChanged && newUsage.status === "critical"
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          : "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {exceedsBudget ? (
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          ) : (
            <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
          )}
          <div>
            <h4 className="text-sm font-semibold">Budget Impact</h4>
            <p className="text-xs text-muted-foreground">
              {groupId ? "Group" : "Personal"} • {category}
            </p>
          </div>
        </div>
        <BudgetStatusBadge status={newUsage.status} size="sm" />
      </div>

      {/* Current vs After */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Current</p>
          <p className="font-bold">{formatCurrency(currentUsage.totalSpent)}</p>
          <p className="text-xs text-muted-foreground">
            {currentUsage.percentageUsed.toFixed(0)}% used
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">After</p>
          <p className="font-bold flex items-center gap-1">
            {formatCurrency(afterExpense.totalSpent)}
            <span className="text-xs text-green-600 dark:text-green-400">
              +{formatCurrency(amount)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {afterExpense.percentageUsed.toFixed(0)}% used
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <BudgetProgressBar
        percentageUsed={afterExpense.percentageUsed}
        status={newUsage.status}
        height="md"
      />

      {/* Remaining Amount */}
      <div className="flex items-center justify-between text-xs pt-1">
        <span className="text-muted-foreground font-medium">
          Budget Limit: {formatCurrency(relevantBudget.monthlyLimit)}
        </span>
        <span
          className={cn(
            "font-bold",
            newUsage.remainingAmount >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {newUsage.remainingAmount >= 0
            ? `${formatCurrency(newUsage.remainingAmount)} left`
            : `${formatCurrency(Math.abs(newUsage.remainingAmount))} over`}
        </span>
      </div>

      {/* Warning Message */}
      {exceedsBudget && (
        <div className="flex items-start gap-2 pt-2 border-t border-red-200 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 font-medium">
            This expense will put you {formatCurrency(Math.abs(newUsage.remainingAmount))} over
            your {category} budget for this month.
          </p>
        </div>
      )}

      {/* Status Change Warning */}
      {statusChanged && !exceedsBudget && newUsage.status === "critical" && (
        <div className="flex items-start gap-2 pt-2 border-t border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            This expense will put your {category} budget into critical status (over 90% used).
          </p>
        </div>
      )}
    </div>
  );
}

