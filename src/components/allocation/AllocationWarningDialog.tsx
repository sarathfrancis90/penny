'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/incomeCalculations';

interface AllocationWarningDialogProps {
  open: boolean;
  income: number;
  currentBudgets: number;
  currentSavings: number;
  newAmount: number;
  type: 'budget' | 'savings';
  itemName?: string;
  overAllocation: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AllocationWarningDialog({
  open,
  income,
  currentBudgets,
  currentSavings,
  newAmount,
  type,
  itemName,
  overAllocation,
  onConfirm,
  onCancel,
}: AllocationWarningDialogProps) {
  const newTotal = currentBudgets + currentSavings + newAmount;
  const newBudgets = type === 'budget' ? currentBudgets + newAmount : currentBudgets;
  const newSavings = type === 'savings' ? currentSavings + newAmount : currentSavings;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Over-Allocation Warning
          </AlertDialogTitle>
          <AlertDialogDescription>
            {itemName 
              ? `Adding "${itemName}" will cause you to exceed your monthly income.`
              : `This ${type} will cause you to exceed your monthly income.`
            }
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monthly Income:</span>
            <span className="font-semibold">{formatCurrency(income, 'USD')}</span>
          </div>

          <Separator />

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Budgets:</span>
            <span>{formatCurrency(currentBudgets, 'USD')}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Savings:</span>
            <span>{formatCurrency(currentSavings, 'USD')}</span>
          </div>

          {newAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                New {type === 'budget' ? 'Budget' : 'Savings Goal'}:
              </span>
              <span className="font-semibold text-primary">
                +{formatCurrency(newAmount, 'USD')}
              </span>
            </div>
          )}

          <Separator className="my-2" />

          <div className="flex justify-between text-sm font-medium">
            <span>New Total Allocated:</span>
            <span className="text-red-600">
              {formatCurrency(newTotal, 'USD')}
            </span>
          </div>

          <div className="flex justify-between text-sm font-bold">
            <span className="text-red-600">Over-Allocation:</span>
            <span className="text-red-600">
              -{formatCurrency(overAllocation, 'USD')}
            </span>
          </div>

          {/* Breakdown */}
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-2">
              💡 What this means:
            </p>
            <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
              <li>• You&apos;re allocating more than you earn</li>
              <li>• This may lead to overspending</li>
              <li>• Consider reducing other budgets or increasing income</li>
            </ul>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Proceed Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

