"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/budgetCalculations";

interface OverBudgetWarningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  budgetLimit: number;
  currentSpent: number;
  expenseAmount: number;
  overBudgetAmount: number;
  groupName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Warning modal shown when an expense will exceed a budget
 */
export function OverBudgetWarningModal({
  open,
  onOpenChange,
  category,
  budgetLimit,
  currentSpent,
  expenseAmount,
  overBudgetAmount,
  groupName,
  onConfirm,
  onCancel,
}: OverBudgetWarningModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <AlertDialogTitle className="text-xl">Budget Exceeded</AlertDialogTitle>
              <p className="text-sm text-muted-foreground">
                {groupName ? `Group: ${groupName}` : "Personal Budget"}
              </p>
            </div>
          </div>
          <AlertDialogDescription className="space-y-4">
            <p>
              This expense will exceed your <span className="font-semibold">{category}</span>{" "}
              budget by <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(overBudgetAmount)}
              </span>.
            </p>

            {/* Budget Breakdown */}
            <div className="p-4 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 rounded-lg border border-red-200 dark:border-red-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Budget Limit:</span>
                <span className="font-semibold">{formatCurrency(budgetLimit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Spent:</span>
                <span className="font-semibold">{formatCurrency(currentSpent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Expense:</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  +{formatCurrency(expenseAmount)}
                </span>
              </div>
              <div className="pt-2 border-t border-red-300 dark:border-red-700 flex justify-between">
                <span className="font-bold">Total After:</span>
                <span className="font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(currentSpent + expenseAmount)}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Consider reviewing your budget or postponing non-essential expenses to stay on track.
              </p>
            </div>

            <p className="text-sm">
              Do you still want to save this expense?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Save Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

