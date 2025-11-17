'use client';

import { useState } from 'react';
import { PersonalSavingsGoal, GoalStatus, SAVINGS_CATEGORY_LABELS } from '@/lib/types/savings';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { formatGoalProgress } from '@/lib/utils/savingsCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
import { MoreVertical, Edit, Trash2, Pause, Play, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface SavingsGoalCardProps {
  goal: PersonalSavingsGoal;
  onEdit?: (goal: PersonalSavingsGoal) => void;
  onDelete?: (goalId: string) => Promise<void>;
  onPause?: (goalId: string) => Promise<void>;
  onResume?: (goalId: string) => Promise<void>;
}

export function SavingsGoalCard({
  goal,
  onEdit,
  onDelete,
  onPause,
  onResume,
}: SavingsGoalCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const progressText = formatGoalProgress(goal);
  const remaining = goal.targetAmount - goal.currentAmount;

  const handleDelete = async () => {
    if (!onDelete) return;

    try {
      setIsDeleting(true);
      await onDelete(goal.id);
      toast.success('Savings goal deleted successfully');
      setShowDeleteDialog(false);
    } catch {
      toast.error('Failed to delete savings goal');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePause = async () => {
    if (!onPause) return;

    try {
      setIsActionPending(true);
      await onPause(goal.id);
      toast.success('Savings goal paused');
    } catch {
      toast.error('Failed to pause savings goal');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleResume = async () => {
    if (!onResume) return;

    try {
      setIsActionPending(true);
      await onResume(goal.id);
      toast.success('Savings goal resumed');
    } catch {
      toast.error('Failed to resume savings goal');
    } finally {
      setIsActionPending(false);
    }
  };

  const getStatusColor = () => {
    switch (goal.status) {
      case GoalStatus.ACHIEVED:
        return 'bg-green-100 text-green-800 border-green-200';
      case GoalStatus.PAUSED:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case GoalStatus.CANCELLED:
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getPriorityIndicator = () => {
    switch (goal.priority) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
    }
  };

  return (
    <>
      <Card className={goal.status !== GoalStatus.ACTIVE ? 'opacity-75' : ''}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-1">
              {/* Icon */}
              <div className="text-3xl">{goal.emoji}</div>

              {/* Title and Status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg truncate">{goal.name}</h3>
                  {goal.status !== GoalStatus.ACTIVE && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor()}`}
                    >
                      {goal.status === GoalStatus.ACHIEVED && '✓ Achieved'}
                      {goal.status === GoalStatus.PAUSED && 'Paused'}
                      {goal.status === GoalStatus.CANCELLED && 'Cancelled'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{SAVINGS_CATEGORY_LABELS[goal.category]}</span>
                  <span>•</span>
                  <span>{getPriorityIndicator()} {goal.priority}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isActionPending}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(goal)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {goal.status === GoalStatus.ACTIVE && onPause && (
                  <DropdownMenuItem onClick={handlePause}>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </DropdownMenuItem>
                )}
                {goal.status === GoalStatus.PAUSED && onResume && (
                  <DropdownMenuItem onClick={handleResume}>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
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

          {/* Progress Section */}
          <div className="space-y-3">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold">
                  {goal.progressPercentage.toFixed(1)}%
                </span>
              </div>
              <Progress value={goal.progressPercentage} className="h-2" />
            </div>

            {/* Amounts */}
            <div className="flex justify-between items-end">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(goal.currentAmount, goal.currency)}
                </div>
                <div className="text-sm text-muted-foreground">
                  of {formatCurrency(goal.targetAmount, goal.currency)}
                </div>
              </div>

              {goal.status === GoalStatus.ACHIEVED ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-semibold">Goal Achieved!</span>
                </div>
              ) : (
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {formatCurrency(remaining, goal.currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">remaining</div>
                </div>
              )}
            </div>

            {/* Monthly Contribution */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-sm text-muted-foreground">Monthly Contribution</span>
              <span className="font-semibold">
                {formatCurrency(goal.monthlyContribution, goal.currency)}
              </span>
            </div>

            {/* Progress Text and Target Date */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{progressText}</span>
              {goal.targetDate && goal.status === GoalStatus.ACTIVE && (
                <span className="text-muted-foreground">
                  📅{' '}
                  {new Date(goal.targetDate.seconds * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>

            {/* On Track Indicator */}
            {goal.status === GoalStatus.ACTIVE && (
              <div
                className={`flex items-center gap-2 p-2 rounded text-sm ${
                  goal.onTrack
                    ? 'bg-green-50 text-green-700'
                    : 'bg-orange-50 text-orange-700'
                }`}
              >
                {goal.onTrack ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>On track for this month</span>
                  </>
                ) : (
                  <>
                    <span>⚠️</span>
                    <span>Behind on monthly contribution</span>
                  </>
                )}
              </div>
            )}

            {/* Description */}
            {goal.description && (
              <p className="text-sm text-muted-foreground pt-2 border-t">
                {goal.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Savings Goal?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{goal.name}&quot;? This action cannot
              be undone. You have {formatCurrency(goal.currentAmount, goal.currency)} saved
              for this goal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Goal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

