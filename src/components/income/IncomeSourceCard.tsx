'use client';

import { useState } from 'react';
import { PersonalIncomeSource, IncomeCategory, IncomeFrequency } from '@/lib/types/income';
import { calculateMonthlyIncome, formatCurrency } from '@/lib/utils/incomeCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreVertical, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

interface IncomeSourceCardProps {
  income: PersonalIncomeSource;
  onEdit?: (income: PersonalIncomeSource) => void;
  onDelete?: (incomeId: string) => Promise<void>;
  onToggleActive?: (incomeId: string, isActive: boolean) => Promise<void>;
}

const CATEGORY_ICONS: Record<IncomeCategory, string> = {
  [IncomeCategory.SALARY]: '💼',
  [IncomeCategory.FREELANCE]: '💻',
  [IncomeCategory.BONUS]: '🎁',
  [IncomeCategory.INVESTMENT]: '📈',
  [IncomeCategory.RENTAL]: '🏠',
  [IncomeCategory.SIDE_HUSTLE]: '💡',
  [IncomeCategory.GIFT]: '🎉',
  [IncomeCategory.OTHER]: '📦',
};

const CATEGORY_LABELS: Record<IncomeCategory, string> = {
  [IncomeCategory.SALARY]: 'Salary',
  [IncomeCategory.FREELANCE]: 'Freelance',
  [IncomeCategory.BONUS]: 'Bonus',
  [IncomeCategory.INVESTMENT]: 'Investment',
  [IncomeCategory.RENTAL]: 'Rental',
  [IncomeCategory.SIDE_HUSTLE]: 'Side Hustle',
  [IncomeCategory.GIFT]: 'Gift',
  [IncomeCategory.OTHER]: 'Other',
};

const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  [IncomeFrequency.MONTHLY]: 'Monthly',
  [IncomeFrequency.BIWEEKLY]: 'Bi-weekly',
  [IncomeFrequency.WEEKLY]: 'Weekly',
  [IncomeFrequency.YEARLY]: 'Yearly',
  [IncomeFrequency.ONCE]: 'One-time',
};

export function IncomeSourceCard({
  income,
  onEdit,
  onDelete,
  onToggleActive,
}: IncomeSourceCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const monthlyAmount = calculateMonthlyIncome(income.amount, income.frequency);

  const handleDelete = async () => {
    if (!onDelete) return;

    try {
      setIsDeleting(true);
      await onDelete(income.id);
      toast.success('Income source deleted successfully');
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error('Failed to delete income source');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!onToggleActive) return;

    try {
      await onToggleActive(income.id, !income.isActive);
      toast.success(
        income.isActive
          ? 'Income source deactivated'
          : 'Income source activated'
      );
    } catch (error) {
      toast.error('Failed to update income source');
    }
  };

  return (
    <>
      <Card className={!income.isActive ? 'opacity-60' : ''}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {/* Icon */}
              <div className="text-2xl mt-1">
                {CATEGORY_ICONS[income.category]}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg truncate">
                    {income.name}
                  </h3>
                  {!income.isActive && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      Inactive
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>{CATEGORY_LABELS[income.category]}</span>
                  <span>•</span>
                  <span>{FREQUENCY_LABELS[income.frequency]}</span>
                  {income.isRecurring && (
                    <>
                      <span>•</span>
                      <span>Recurring</span>
                    </>
                  )}
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(income.amount, income.currency)}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      / {FREQUENCY_LABELS[income.frequency].toLowerCase()}
                    </span>
                  </div>

                  {income.frequency !== IncomeFrequency.MONTHLY && (
                    <div className="text-sm text-muted-foreground">
                      ≈ {formatCurrency(monthlyAmount, income.currency)} / month
                    </div>
                  )}

                  {income.netAmount && income.netAmount !== income.amount && (
                    <div className="text-sm text-muted-foreground">
                      Net: {formatCurrency(income.netAmount, income.currency)}
                    </div>
                  )}
                </div>

                {income.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {income.description}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(income)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onToggleActive && (
                  <DropdownMenuItem onClick={handleToggleActive}>
                    {income.isActive ? (
                      <>
                        <PowerOff className="h-4 w-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4 mr-2" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Income Source?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{income.name}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

