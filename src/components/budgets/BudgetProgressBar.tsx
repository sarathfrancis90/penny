"use client";

import { BudgetStatus } from "@/lib/types";
import { getStatusGradient } from "@/lib/budgetCalculations";
import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  percentageUsed: number;
  status: BudgetStatus;
  showPercentage?: boolean;
  height?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Progress bar component for visualizing budget usage
 */
export function BudgetProgressBar({
  percentageUsed,
  status,
  showPercentage = true,
  height = "md",
  className,
}: BudgetProgressBarProps) {
  // Cap percentage at 100% for display (actual value can be > 100)
  const displayPercentage = Math.min(percentageUsed, 100);
  
  // For over-budget, show full bar with pulsing animation
  const isOverBudget = percentageUsed > 100;

  const heightClasses = {
    sm: "h-2",
    md: "h-3",
    lg: "h-4",
  };

  const gradient = getStatusGradient(status);

  return (
    <div className={cn("space-y-1", className)}>
      {/* Progress Bar */}
      <div
        className={cn(
          "w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden",
          heightClasses[height]
        )}
      >
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out rounded-full",
            isOverBudget && "animate-pulse"
          )}
          style={{
            width: `${displayPercentage}%`,
            background: gradient,
          }}
          role="progressbar"
          aria-valuenow={percentageUsed}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Budget used: ${percentageUsed.toFixed(1)}%`}
        />
      </div>

      {/* Percentage Label */}
      {showPercentage && (
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>{percentageUsed.toFixed(1)}%</span>
          {isOverBudget && (
            <span className="text-red-600 dark:text-red-400 font-semibold">
              Over Budget
            </span>
          )}
        </div>
      )}
    </div>
  );
}

