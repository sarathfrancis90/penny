'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GroupSavingsGoal, SavingsCategory, GoalPriority, SAVINGS_CATEGORY_EMOJIS } from '@/lib/types/savings';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { toast } from 'sonner';
import { TrendingUp } from 'lucide-react';

interface GroupSavingsFormProps {
  groupId: string;
  initialData?: GroupSavingsGoal;
  onSubmit: (data: Partial<GroupSavingsGoal>) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function GroupSavingsForm({
  groupId,
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create Goal',
}: GroupSavingsFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    category: initialData?.category || SavingsCategory.TRAVEL,
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

      const submitData: Record<string, unknown> = {
        groupId,
        name: formData.name.trim(),
        category: formData.category,
        targetAmount: parseFloat(formData.targetAmount),
        currentAmount: parseFloat(formData.currentAmount) || 0,
        monthlyContribution: parseFloat(formData.monthlyContribution),
        priority: formData.priority,
        emoji: formData.emoji || SAVINGS_CATEGORY_EMOJIS[formData.category],
        currency: formData.currency,
        // Required fields for creation
        ...(!initialData && {
          startDate: new Date(),
          status: 'active',
          isActive: true,
        }),
      };

      // Only add optional fields if they have values (Firestore doesn't accept undefined)
      if (formData.targetDate) {
        submitData.targetDate = formData.targetDate;
      }
      
      if (formData.description.trim()) {
        submitData.description = formData.description.trim();
      }

      await onSubmit(submitData as Partial<GroupSavingsGoal>);
      toast.success(
        initialData ? 'Group savings goal updated successfully' : 'Group savings goal created successfully'
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
        <Label htmlFor="name">Goal Name *</Label>
        <Input
          id="name"
          placeholder="e.g., Family Vacation, Emergency Fund"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Category *</Label>
        <Select
          value={formData.category}
          onValueChange={(value) =>
            setFormData({ ...formData, category: value as SavingsCategory })
          }
        >
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SavingsCategory.EMERGENCY_FUND}>🚨 Emergency Fund</SelectItem>
            <SelectItem value={SavingsCategory.TRAVEL}>✈️ Travel</SelectItem>
            <SelectItem value={SavingsCategory.EDUCATION}>🎓 Education</SelectItem>
            <SelectItem value={SavingsCategory.HEALTH}>🏥 Health</SelectItem>
            <SelectItem value={SavingsCategory.HOUSE_DOWN_PAYMENT}>🏠 House Down Payment</SelectItem>
            <SelectItem value={SavingsCategory.CAR}>🚗 Car</SelectItem>
            <SelectItem value={SavingsCategory.WEDDING}>💒 Wedding</SelectItem>
            <SelectItem value={SavingsCategory.RETIREMENT}>🏖️ Retirement</SelectItem>
            <SelectItem value={SavingsCategory.INVESTMENT}>📈 Investment</SelectItem>
            <SelectItem value={SavingsCategory.CUSTOM}>📦 Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetAmount">Target Amount *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="targetAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="10000"
              className="pl-7"
              value={formData.targetAmount}
              onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="currentAmount">Current Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="currentAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              className="pl-7"
              value={formData.currentAmount}
              onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Monthly Contribution */}
      <div className="space-y-2">
        <Label htmlFor="monthlyContribution">Monthly Contribution *</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            id="monthlyContribution"
            type="number"
            step="0.01"
            min="0"
            placeholder="500"
            className="pl-7"
            value={formData.monthlyContribution}
            onChange={(e) => setFormData({ ...formData, monthlyContribution: e.target.value })}
            required
          />
        </div>
        {monthsToGoal && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-accent">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Estimated completion: <strong>{monthsToGoal} months</strong> (
              {new Date(
                new Date().setMonth(new Date().getMonth() + monthsToGoal)
              ).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              )
            </p>
          </div>
        )}
      </div>

      {/* Target Date */}
      <div className="space-y-2">
        <Label htmlFor="targetDate">Target Date (Optional)</Label>
        <Input
          id="targetDate"
          type="date"
          value={formData.targetDate}
          onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
        />
      </div>

      {/* Priority */}
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
            <SelectItem value="low">
              <div className="flex items-center gap-2">
                🟢 Low
              </div>
            </SelectItem>
            <SelectItem value="medium">
              <div className="flex items-center gap-2">
                🟡 Medium
              </div>
            </SelectItem>
            <SelectItem value="high">
              <div className="flex items-center gap-2">
                🟠 High
              </div>
            </SelectItem>
            <SelectItem value="critical">
              <div className="flex items-center gap-2">
                🔴 Critical
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom Emoji */}
      <div className="space-y-2">
        <Label htmlFor="emoji">Custom Emoji (Optional)</Label>
        <Input
          id="emoji"
          placeholder={SAVINGS_CATEGORY_EMOJIS[formData.category]}
          value={formData.emoji}
          onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
          maxLength={2}
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
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      {/* Progress Preview */}
      {formData.targetAmount && formData.currentAmount && (
        <div className="p-4 rounded-lg bg-accent space-y-2">
          <Label>Progress Preview</Label>
          <div className="flex items-center justify-between text-sm">
            <span>Current</span>
            <span className="font-bold">
              {formatCurrency(parseFloat(formData.currentAmount) || 0, 'USD')}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Target</span>
            <span className="font-bold">
              {formatCurrency(parseFloat(formData.targetAmount), 'USD')}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Remaining</span>
            <span className="font-bold">
              {formatCurrency(
                Math.max(0, parseFloat(formData.targetAmount) - (parseFloat(formData.currentAmount) || 0)),
                'USD'
              )}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(
                  100,
                  ((parseFloat(formData.currentAmount) || 0) / parseFloat(formData.targetAmount)) * 100
                )}%`,
              }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {((parseFloat(formData.currentAmount) || 0) / parseFloat(formData.targetAmount) * 100).toFixed(1)}% complete
          </p>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

