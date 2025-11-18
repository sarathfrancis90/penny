'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { GradientButton } from '@/components/ui/gradient-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GroupIncomeSource, IncomeCategory, IncomeFrequency } from '@/lib/types/income';
import { toast } from 'sonner';

interface GroupIncomeFormProps {
  groupId: string;
  initialData?: GroupIncomeSource;
  onSubmit: (data: Partial<GroupIncomeSource>) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function GroupIncomeForm({
  groupId,
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Save Income Source',
}: GroupIncomeFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    category: initialData?.category || IncomeCategory.SALARY,
    amount: initialData?.amount.toString() || '',
    frequency: initialData?.frequency || IncomeFrequency.MONTHLY,
    isRecurring: initialData?.isRecurring ?? true,
    recurringDate: initialData?.recurringDate?.toString() || '1', // Default to 1st of month
    taxable: initialData?.taxable ?? true,
    netAmount: initialData?.netAmount?.toString() || '',
    description: initialData?.description || '',
    currency: initialData?.currency || 'USD',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error('Please enter an income source name');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setIsSubmitting(true);

      const submitData: Record<string, unknown> = {
        groupId,
        name: formData.name.trim(),
        category: formData.category,
        amount: parseFloat(formData.amount),
        frequency: formData.frequency,
        isRecurring: formData.isRecurring,
        taxable: formData.taxable,
        currency: formData.currency,
        isActive: true,
        // Required field for creation
        ...(!initialData && {
          startDate: new Date(),
        }),
      };

      // Only add optional fields if they have values (Firestore doesn't accept undefined)
      if (formData.recurringDate && !isNaN(parseInt(formData.recurringDate))) {
        submitData.recurringDate = parseInt(formData.recurringDate);
      }
      
      if (formData.netAmount && !isNaN(parseFloat(formData.netAmount))) {
        submitData.netAmount = parseFloat(formData.netAmount);
      }
      
      if (formData.description.trim()) {
        submitData.description = formData.description.trim();
      }

      await onSubmit(submitData as Partial<GroupIncomeSource>);
      toast.success(
        initialData ? 'Group income updated successfully' : 'Group income created successfully'
      );
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save income source');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Income Source Name *</Label>
        <Input
          id="name"
          placeholder="e.g., Family Salary Pool, Rental Income"
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
            setFormData({ ...formData, category: value as IncomeCategory })
          }
        >
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={IncomeCategory.SALARY}>💼 Salary</SelectItem>
            <SelectItem value={IncomeCategory.FREELANCE}>💻 Freelance</SelectItem>
            <SelectItem value={IncomeCategory.BONUS}>🎁 Bonus</SelectItem>
            <SelectItem value={IncomeCategory.INVESTMENT}>📈 Investment</SelectItem>
            <SelectItem value={IncomeCategory.RENTAL}>🏠 Rental</SelectItem>
            <SelectItem value={IncomeCategory.SIDE_HUSTLE}>💼 Side Hustle</SelectItem>
            <SelectItem value={IncomeCategory.GIFT}>🎉 Gift</SelectItem>
            <SelectItem value={IncomeCategory.OTHER}>📦 Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Amount & Frequency */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              className="pl-7"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency *</Label>
          <Select
            value={formData.frequency}
            onValueChange={(value) =>
              setFormData({ ...formData, frequency: value as IncomeFrequency })
            }
          >
            <SelectTrigger id="frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={IncomeFrequency.ONCE}>One Time</SelectItem>
              <SelectItem value={IncomeFrequency.WEEKLY}>Weekly</SelectItem>
              <SelectItem value={IncomeFrequency.BIWEEKLY}>Bi-weekly</SelectItem>
              <SelectItem value={IncomeFrequency.MONTHLY}>Monthly</SelectItem>
              <SelectItem value={IncomeFrequency.YEARLY}>Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Recurring Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="isRecurring">Recurring Income</Label>
            <p className="text-sm text-muted-foreground">
              This income repeats regularly
            </p>
          </div>
          <Switch
            id="isRecurring"
            checked={formData.isRecurring}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, isRecurring: checked })
            }
          />
        </div>

        {formData.isRecurring && formData.frequency === IncomeFrequency.MONTHLY && (
          <div className="space-y-2">
            <Label htmlFor="recurringDate">Day of Month</Label>
            <Input
              id="recurringDate"
              type="number"
              min="1"
              max="31"
              placeholder="e.g., 1 for 1st of month"
              value={formData.recurringDate}
              onChange={(e) =>
                setFormData({ ...formData, recurringDate: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Which day of the month do you receive this income? (Defaults to 1st)
            </p>
          </div>
        )}
      </div>

      {/* Tax Information */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="taxable">Taxable Income</Label>
            <p className="text-sm text-muted-foreground">
              Is this income subject to taxes?
            </p>
          </div>
          <Switch
            id="taxable"
            checked={formData.taxable}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, taxable: checked })
            }
          />
        </div>

        {formData.taxable && (
          <div className="space-y-2">
            <Label htmlFor="netAmount">Net Amount (After Tax)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="netAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                className="pl-7"
                value={formData.netAmount}
                onChange={(e) =>
                  setFormData({ ...formData, netAmount: e.target.value })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Optional: Actual amount received after taxes
            </p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          placeholder="Add notes about this income source..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <GradientButton type="submit" disabled={isSubmitting} variant="primary" className="flex-1">
          {isSubmitting ? 'Saving...' : submitLabel}
        </GradientButton>
      </div>
    </form>
  );
}

