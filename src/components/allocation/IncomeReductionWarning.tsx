'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/incomeCalculations';

interface IncomeReductionWarningProps {
  open: boolean;
  currentIncome: number;
  newIncome: number;
  totalAllocations: number;
  shortfall: number;
  incomeName: string;
  onCancel: () => void;
}

export function IncomeReductionWarning({
  open,
  currentIncome,
  newIncome,
  totalAllocations,
  shortfall,
  incomeName,
  onCancel,
}: IncomeReductionWarningProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Cannot Delete Income Source
          </AlertDialogTitle>
          <AlertDialogDescription>
            Deleting &quot;{incomeName}&quot; will cause your budgets and savings goals to exceed your remaining income.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Income:</span>
            <span className="font-semibold">{formatCurrency(currentIncome, 'USD')}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Income After Deletion:</span>
            <span className="text-red-600 font-semibold">{formatCurrency(newIncome, 'USD')}</span>
          </div>

          <Separator />

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Budgets & Savings:</span>
            <span>{formatCurrency(totalAllocations, 'USD')}</span>
          </div>

          <Separator className="my-2" />

          <div className="flex justify-between text-sm font-bold">
            <span className="text-red-600">Shortfall:</span>
            <span className="text-red-600">
              -{formatCurrency(shortfall, 'USD')}
            </span>
          </div>

          {/* Warning Box */}
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <p className="text-xs font-medium text-red-900 dark:text-red-100 mb-2">
              ⚠️ What you need to do:
            </p>
            <ul className="text-xs text-red-800 dark:text-red-200 space-y-1">
              <li>• Reduce your budgets by at least {formatCurrency(shortfall, 'USD')}</li>
              <li>• OR reduce your savings goals</li>
              <li>• OR keep this income source active</li>
            </ul>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onCancel} className="w-full">
            Got It
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

