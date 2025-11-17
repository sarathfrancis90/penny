'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  SavingsCategory,
  PersonalSavingsGoal,
  GoalPriority,
  SAVINGS_CATEGORY_LABELS,
  SAVINGS_CATEGORY_EMOJIS,
} from '@/lib/types/savings';
import { toast } from 'sonner';

interface SavingsGoalFormProps {
  initialData?: PersonalSavingsGoal;
  onSubmit: (data: any) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function SavingsGoalForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Save Goal',
}: SavingsGoalFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    category: initialData?.category || SavingsCategory.EMERGENCY_FUND,
    targetAmount: initialData?.targetAmount.toString() || '',
    currentAmount: initialData?.currentAmount.toString() || '0',
    monthlyContribution: initialData?.monthlyContribution.toString() || '',
    targetDate: initialData?.targetDate
      ? new Date(initialData.targetDate.seconds * 1000).toISOString().split('T')[0]
      : '',
    priority: initialData?.priority || ('medium' as GoalPriority),
    description: initialData?.description || '',
    emoji: initialData?.emoji || '',
    currency: initialData?.currency || 'USD',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate estimated completion time
  const calculateMonthsToGoal = () => {
    const target = parseFloat(formData.targetAmount);
    const current = parseFloat(formData.currentAmount);
    const monthly = parseFloat(formData.monthlyContribution);

    if (monthly <= 0 || target <= current) return null;

    const remaining = target - current;
    return Math.ceil(remaining / monthly);
  };

  const monthsToGoal = calculateMonthsToGoal();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error('Please enter a goal name');
      return;
    }

    if (!formData.targetAmount || parseFloat(formData.targetAmount) <= 0) {
      toast.error('Please enter a valid target amount');
      return;
    }

    if (!formData.monthlyContribution || parseFloat(formData.monthlyContribution) <= 0) {
      toast.error('Please enter a valid monthly contribution');
      return;
    }

    const current = parseFloat(formData.currentAmount) || 0;
    const target = parseFloat(formData.targetAmount);

    if (current > target) {
      toast.error('Current amount cannot be greater than target amount');
      return;
    }

    try {
      setIsSubmitting(true);

      const submitData = {
        name: formData.name.trim(),
        category: formData.category,
        targetAmount: parseFloat(formData.targetAmount),
        currentAmount: parseFloat(formData.currentAmount) || 0,
        monthlyContribution: parseFloat(formData.monthlyContribution),
        targetDate: formData.targetDate ? formData.targetDate : undefined,
        priority: formData.priority,
        description: formData.description.trim() || undefined,
        emoji: formData.emoji || SAVINGS_CATEGORY_EMOJIS[formData.category],
        currency: formData.currency,
      };

      await onSubmit(submitData);
      toast.success(
        initialData ? 'Savings goal updated successfully' : 'Savings goal created successfully'
      );
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Goal Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="e.g., Emergency Fund, Japan Trip, New Car"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select
          value={formData.category}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              category: value as SavingsCategory,
              emoji: SAVINGS_CATEGORY_EMOJIS[value as SavingsCategory],
            })
          }
        >
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SAVINGS_CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {SAVINGS_CATEGORY_EMOJIS[key as SavingsCategory]} {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Target Amount and Current Amount */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetAmount">
            Target Amount <span className="text-red-500">*</span>
          </Label>
          <Input
            id="targetAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="10000"
            value={formData.targetAmount}
            onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currentAmount">Current Amount</Label>
          <Input
            id="currentAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={formData.currentAmount}
            onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
          />
        </div>
      </div>

      {/* Monthly Contribution */}
      <div className="space-y-2">
        <Label htmlFor="monthlyContribution">
          Monthly Contribution <span className="text-red-500">*</span>
        </Label>
        <Input
          id="monthlyContribution"
          type="number"
          step="0.01"
          min="0"
          placeholder="500"
          value={formData.monthlyContribution}
          onChange={(e) =>
            setFormData({ ...formData, monthlyContribution: e.target.value })
          }
          required
        />
        {monthsToGoal && (
          <p className="text-sm text-muted-foreground">
            📅 Estimated completion: {monthsToGoal} month{monthsToGoal !== 1 ? 's' : ''} (
            {new Date(
              Date.now() + monthsToGoal * 30 * 24 * 60 * 60 * 1000
            ).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            )
          </p>
        )}
      </div>

      {/* Target Date and Priority */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetDate">Target Date (Optional)</Label>
          <Input
            id="targetDate"
            type="date"
            value={formData.targetDate}
            onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={formData.priority}
            onValueChange={(value) =>
              setFormData({ ...formData, priority: value as GoalPriority })
            }
          >
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">🟢 Low</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="critical">🔴 Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Emoji (Optional) */}
      <div className="space-y-2">
        <Label htmlFor="emoji">Custom Emoji (Optional)</Label>
        <Input
          id="emoji"
          type="text"
          placeholder="✈️"
          maxLength={2}
          value={formData.emoji}
          onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
        />
        <p className="text-sm text-muted-foreground">
          Customize the icon for this goal (defaults to category icon)
        </p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          placeholder="Add notes about this savings goal..."
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      {/* Progress Preview */}
      {formData.targetAmount && (
        <div className="p-4 rounded-lg bg-muted">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Progress Preview</span>
            <span className="text-sm font-bold">
              {(
                ((parseFloat(formData.currentAmount) || 0) /
                  parseFloat(formData.targetAmount)) *
                100
              ).toFixed(1)}
              %
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(
                  ((parseFloat(formData.currentAmount) || 0) /
                    parseFloat(formData.targetAmount)) *
                    100,
                  100
                )}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>${parseFloat(formData.currentAmount) || 0}</span>
            <span>${parseFloat(formData.targetAmount)}</span>
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

