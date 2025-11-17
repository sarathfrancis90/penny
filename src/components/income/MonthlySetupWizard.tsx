'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency, formatPercentage } from '@/lib/utils/incomeCalculations';
import { PersonalIncomeSource } from '@/lib/types/income';
import { PersonalSavingsGoal } from '@/lib/types/savings';
import { Check, AlertCircle, ArrowLeft, ArrowRight, Calendar, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface MonthlySetupWizardProps {
  incomeSources: PersonalIncomeSource[];
  savingsGoals: PersonalSavingsGoal[];
  previousMonthIncome?: number;
  previousMonthBudgets?: Array<{ category: string; limit: number }>;
  previousMonthSavings?: Array<{ goalId: string; goalName: string; amount: number }>;
  onComplete: (data: MonthlySetupData) => Promise<void>;
  onSkip: () => void;
}

export interface MonthlySetupData {
  income: {
    sources: PersonalIncomeSource[];
    totalMonthly: number;
  };
  expenseBudgets: Array<{ category: string; limit: number }>;
  savingsGoals: Array<{ goalId: string; goalName: string; monthlyContribution: number }>;
  totalAllocated: number;
  unallocated: number;
  allocationPercentage: number;
  isOverAllocated: boolean;
}

const EXPENSE_CATEGORIES = [
  { id: 'groceries', label: '🛒 Groceries' },
  { id: 'dining', label: '🍽️ Dining Out' },
  { id: 'transport', label: '🚗 Transportation' },
  { id: 'utilities', label: '💡 Utilities' },
  { id: 'rent', label: '🏠 Rent/Mortgage' },
  { id: 'entertainment', label: '🎬 Entertainment' },
  { id: 'healthcare', label: '💊 Healthcare' },
  { id: 'shopping', label: '🛍️ Shopping' },
  { id: 'other', label: '📦 Other' },
];

export function MonthlySetupWizard({
  incomeSources,
  savingsGoals,
  previousMonthIncome,
  previousMonthBudgets,
  previousMonthSavings,
  onComplete,
  onSkip,
}: MonthlySetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Income Confirmation
  const [confirmedIncome, setConfirmedIncome] = useState<PersonalIncomeSource[]>([]);
  const [totalMonthlyIncome, setTotalMonthlyIncome] = useState(0);

  // Step 2: Expense Budgets
  const [expenseBudgets, setExpenseBudgets] = useState<Record<string, number>>({});

  // Step 3: Savings Goals
  const [savingsAllocations, setSavingsAllocations] = useState<Record<string, number>>({});

  // Initialize data from previous month or current sources
  useEffect(() => {
    setConfirmedIncome(incomeSources.filter((s) => s.isActive));
    
    const total = incomeSources
      .filter((s) => s.isActive)
      .reduce((sum, source) => {
        return sum + calculateMonthlyAmount(source.amount, source.frequency);
      }, 0);
    setTotalMonthlyIncome(total);

    // Initialize budgets from previous month
    if (previousMonthBudgets) {
      const budgetMap: Record<string, number> = {};
      previousMonthBudgets.forEach((b) => {
        budgetMap[b.category] = b.limit;
      });
      setExpenseBudgets(budgetMap);
    }

    // Initialize savings from previous month or goals
    if (previousMonthSavings) {
      const savingsMap: Record<string, number> = {};
      previousMonthSavings.forEach((s) => {
        savingsMap[s.goalId] = s.amount;
      });
      setSavingsAllocations(savingsMap);
    } else {
      const savingsMap: Record<string, number> = {};
      savingsGoals.filter((g) => g.isActive && g.status === 'active').forEach((goal) => {
        savingsMap[goal.id] = goal.monthlyContribution;
      });
      setSavingsAllocations(savingsMap);
    }
  }, [incomeSources, savingsGoals, previousMonthBudgets, previousMonthSavings]);

  const calculateMonthlyAmount = (amount: number, frequency: string): number => {
    switch (frequency) {
      case 'monthly':
        return amount;
      case 'biweekly':
        return amount * (26 / 12);
      case 'weekly':
        return amount * (52 / 12);
      case 'yearly':
        return amount / 12;
      default:
        return 0;
    }
  };

  // Calculations
  const totalExpenseBudgets = Object.values(expenseBudgets).reduce((sum, val) => sum + val, 0);
  const totalSavingsAllocated = Object.values(savingsAllocations).reduce((sum, val) => sum + val, 0);
  const totalAllocated = totalExpenseBudgets + totalSavingsAllocated;
  const unallocated = totalMonthlyIncome - totalAllocated;
  const allocationPercentage = totalMonthlyIncome > 0 ? (totalAllocated / totalMonthlyIncome) * 100 : 0;
  const isOverAllocated = unallocated < 0;

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const data: MonthlySetupData = {
        income: {
          sources: confirmedIncome,
          totalMonthly: totalMonthlyIncome,
        },
        expenseBudgets: EXPENSE_CATEGORIES.map((cat) => ({
          category: cat.id,
          limit: expenseBudgets[cat.id] || 0,
        })).filter((b) => b.limit > 0),
        savingsGoals: savingsGoals
          .filter((g) => g.isActive && savingsAllocations[g.id] > 0)
          .map((goal) => ({
            goalId: goal.id,
            goalName: goal.name,
            monthlyContribution: savingsAllocations[goal.id],
          })),
        totalAllocated,
        unallocated,
        allocationPercentage,
        isOverAllocated,
      };

      await onComplete(data);
      toast.success('Monthly setup completed successfully!');
    } catch (error) {
      toast.error('Failed to complete setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeGoals = savingsGoals.filter((g) => g.isActive && g.status === 'active');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm font-medium">
          <span>Step {currentStep} of 4</span>
          <span>{Math.round((currentStep / 4) * 100)}% Complete</span>
        </div>
        <Progress value={(currentStep / 4) * 100} className="h-2" />
        
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span className={currentStep === 1 ? 'font-semibold text-primary' : ''}>Confirm Income</span>
          <span className={currentStep === 2 ? 'font-semibold text-primary' : ''}>Expense Budgets</span>
          <span className={currentStep === 3 ? 'font-semibold text-primary' : ''}>Savings Goals</span>
          <span className={currentStep === 4 ? 'font-semibold text-primary' : ''}>Review & Confirm</span>
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Confirm Your Income for This Month
            </CardTitle>
            <CardDescription>
              Review and update your income sources for{' '}
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {confirmedIncome.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No active income sources found. Please add income sources before setting up your monthly budget.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-3">
                  {confirmedIncome.map((source) => (
                    <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{source.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(source.amount, source.currency)} / {source.frequency}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatCurrency(calculateMonthlyAmount(source.amount, source.frequency), source.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">per month</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>Total Monthly Income:</span>
                    <span className="text-2xl text-primary">
                      {formatCurrency(totalMonthlyIncome, 'USD')}
                    </span>
                  </div>
                </div>

                {previousMonthIncome && previousMonthIncome !== totalMonthlyIncome && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your income changed from {formatCurrency(previousMonthIncome, 'USD')} to{' '}
                      {formatCurrency(totalMonthlyIncome, 'USD')} (
                      {totalMonthlyIncome > previousMonthIncome ? '+' : ''}
                      {formatCurrency(totalMonthlyIncome - previousMonthIncome, 'USD')})
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Set Expense Budgets
            </CardTitle>
            <CardDescription>
              Allocate your income to different expense categories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              {EXPENSE_CATEGORIES.map((category) => (
                <div key={category.id} className="flex items-center gap-4">
                  <Label htmlFor={category.id} className="w-48">
                    {category.label}
                  </Label>
                  <div className="flex-1">
                    <Input
                      id={category.id}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={expenseBudgets[category.id] || ''}
                      onChange={(e) =>
                        setExpenseBudgets({
                          ...expenseBudgets,
                          [category.id]: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="w-24 text-right text-sm text-muted-foreground">
                    {expenseBudgets[category.id]
                      ? formatPercentage(
                          ((expenseBudgets[category.id] || 0) / totalMonthlyIncome) * 100
                        )
                      : '0%'}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Expense Budgets:</span>
                <span className="font-semibold">{formatCurrency(totalExpenseBudgets, 'USD')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>% of Income:</span>
                <span className="font-semibold">
                  {formatPercentage((totalExpenseBudgets / totalMonthlyIncome) * 100)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎯 Set Savings Goals
            </CardTitle>
            <CardDescription>
              Allocate monthly contributions to your savings goals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {activeGoals.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No active savings goals. You can skip this step or create goals first.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-4">
                  {activeGoals.map((goal) => (
                    <div key={goal.id} className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label htmlFor={`goal-${goal.id}`} className="flex items-center gap-2">
                          <span>{goal.emoji}</span>
                          <span>{goal.name}</span>
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Target: {formatCurrency(goal.targetAmount, goal.currency)} •{' '}
                          {goal.progressPercentage.toFixed(1)}% complete
                        </p>
                      </div>
                      <div className="w-40">
                        <Input
                          id={`goal-${goal.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={goal.monthlyContribution.toString()}
                          value={savingsAllocations[goal.id] || ''}
                          onChange={(e) =>
                            setSavingsAllocations({
                              ...savingsAllocations,
                              [goal.id]: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="w-24 text-right text-sm text-muted-foreground">
                        {savingsAllocations[goal.id]
                          ? formatPercentage(
                              ((savingsAllocations[goal.id] || 0) / totalMonthlyIncome) * 100
                            )
                          : '0%'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total Savings Allocated:</span>
                    <span className="font-semibold">{formatCurrency(totalSavingsAllocated, 'USD')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>% of Income:</span>
                    <span className="font-semibold">
                      {formatPercentage((totalSavingsAllocated / totalMonthlyIncome) * 100)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5" />
              Review & Confirm
            </CardTitle>
            <CardDescription>
              Review your monthly financial plan before confirming
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Income Summary */}
            <div>
              <h3 className="font-semibold mb-2">Income</h3>
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(totalMonthlyIncome, 'USD')}
                </div>
                <p className="text-sm text-green-600 dark:text-green-500">
                  From {confirmedIncome.length} source{confirmedIncome.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Allocation Breakdown */}
            <div>
              <h3 className="font-semibold mb-3">Allocation</h3>
              <div className="space-y-4">
                {/* Expense Budgets */}
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">Expense Budgets</span>
                    <span className="font-semibold">{formatCurrency(totalExpenseBudgets, 'USD')}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatPercentage((totalExpenseBudgets / totalMonthlyIncome) * 100)} of income
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {EXPENSE_CATEGORIES.filter((cat) => expenseBudgets[cat.id] > 0).map((cat) => (
                      <div key={cat.id} className="flex justify-between text-muted-foreground">
                        <span>{cat.label}</span>
                        <span>{formatCurrency(expenseBudgets[cat.id], 'USD')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Savings Goals */}
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">Savings Goals</span>
                    <span className="font-semibold">{formatCurrency(totalSavingsAllocated, 'USD')}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatPercentage((totalSavingsAllocated / totalMonthlyIncome) * 100)} of income
                  </div>
                  {activeGoals.filter((g) => savingsAllocations[g.id] > 0).length > 0 && (
                    <div className="mt-2 space-y-1 text-sm">
                      {activeGoals
                        .filter((g) => savingsAllocations[g.id] > 0)
                        .map((goal) => (
                          <div key={goal.id} className="flex justify-between text-muted-foreground">
                            <span>
                              {goal.emoji} {goal.name}
                            </span>
                            <span>{formatCurrency(savingsAllocations[goal.id], 'USD')}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Unallocated */}
                <div
                  className={`p-4 border rounded-lg ${
                    isOverAllocated
                      ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                      : unallocated > 0
                      ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                      : 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">
                      {isOverAllocated ? 'Over-Allocated' : 'Unallocated'}
                    </span>
                    <span className="font-bold text-lg">
                      {formatCurrency(Math.abs(unallocated), 'USD')}
                    </span>
                  </div>
                  <div className="text-sm mt-1">
                    {isOverAllocated && (
                      <span className="text-red-600 dark:text-red-400">
                        ⚠️ You&apos;ve allocated more than your income. Please adjust your budgets.
                      </span>
                    )}
                    {!isOverAllocated && unallocated > 0 && (
                      <span className="text-blue-600 dark:text-blue-400">
                        💡 You have {formatPercentage((unallocated / totalMonthlyIncome) * 100)} unallocated.
                        Consider adding to savings or budgets.
                      </span>
                    )}
                    {!isOverAllocated && unallocated === 0 && (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ Perfect! You&apos;ve allocated 100% of your income.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{formatPercentage(allocationPercentage)}</div>
                <div className="text-sm text-muted-foreground">Allocated</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">
                  {formatPercentage((totalSavingsAllocated / totalMonthlyIncome) * 100)}
                </div>
                <div className="text-sm text-muted-foreground">Savings Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4">
        <div>
          {currentStep === 1 && (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          )}
          {currentStep > 1 && (
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={currentStep === 1 && confirmedIncome.length === 0}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={isSubmitting || isOverAllocated} size="lg">
              {isSubmitting ? 'Completing...' : 'Complete Setup'}
              <Check className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

