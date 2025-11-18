'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useIncome } from '@/hooks/useIncome';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { usePersonalBudgets } from '@/hooks/usePersonalBudgets';
import { useGroupBudgets } from '@/hooks/useGroupBudgets';
import { useBudgetUsage } from '@/hooks/useBudgetUsage';
import { AppLayout } from '@/components/app-layout';
import { PageContainer } from '@/components/ui/page-container';
import { ContextSelector, FinancialContext } from '@/components/finances/ContextSelector';
import { FinancialSectionCard } from '@/components/finances/FinancialSectionCard';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, calculateMonthlyIncome } from '@/lib/utils/incomeCalculations';
import { DollarSign, Target, CreditCard, RefreshCw } from 'lucide-react';
import { calculateProgressPercentage } from '@/lib/utils/savingsCalculations';
import { GoalStatus } from '@/lib/types/savings';

export default function FinancesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  
  // Context state (personal or group)
  const [context, setContext] = useState<FinancialContext>({
    type: 'personal'
  });

  // Personal data hooks
  const { 
    incomeSources: personalIncome
  } = useIncome();
  
  const { 
    savingsGoals: personalSavings
  } = useSavingsGoals();
  
  const { 
    budgets: personalBudgets
  } = usePersonalBudgets(user?.uid);
  
  const { 
    usage: personalBudgetUsage 
  } = useBudgetUsage(
    user?.uid,
    context.type,
    context.groupId
  );

  // Group data hooks
  const { 
    budgets: groupBudgets
  } = useGroupBudgets(context.groupId);

  // Deep linking support - read context from URL
  useEffect(() => {
    const contextType = searchParams.get('context');
    const groupId = searchParams.get('groupId');
    const groupName = searchParams.get('groupName');

    if (contextType === 'group' && groupId) {
      setContext({
        type: 'group',
        groupId,
        groupName: groupName || undefined
      });
    } else if (contextType === 'personal') {
      setContext({ type: 'personal' });
    }
  }, [searchParams]);

  // Update URL when context changes (for deep linking)
  const handleContextChange = (newContext: FinancialContext) => {
    setContext(newContext);
    
    // Update URL without page reload
    const params = new URLSearchParams();
    params.set('context', newContext.type);
    if (newContext.type === 'group' && newContext.groupId) {
      params.set('groupId', newContext.groupId);
      if (newContext.groupName) {
        params.set('groupName', newContext.groupName);
      }
    }
    router.push(`/finances?${params.toString()}`, { scroll: false });
  };

  // Calculate Income summary
  const activeIncome = personalIncome.filter(i => i.isActive);
  const totalMonthlyIncome = activeIncome.reduce(
    (sum, source) => sum + calculateMonthlyIncome(source.amount, source.frequency),
    0
  );
  const incomeSummary = `${formatCurrency(totalMonthlyIncome, 'USD')}/mo`;
  const incomeDetails = `${activeIncome.length} active source${activeIncome.length !== 1 ? 's' : ''}`;

  // Calculate Budget summary
  const currentBudgets = context.type === 'personal' ? personalBudgets : groupBudgets;
  const totalBudgetAllocated = currentBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  const totalBudgetUsed = personalBudgetUsage.reduce((sum, u) => sum + u.totalSpent, 0);
  const budgetSummary = `${formatCurrency(totalBudgetAllocated, 'USD')} allocated`;
  const budgetDetails = `${formatCurrency(totalBudgetUsed, 'USD')} spent • ${currentBudgets.length} categories`;

  // Calculate Savings summary
  const activeSavings = personalSavings.filter(g => g.status === GoalStatus.ACTIVE);
  const totalSaved = activeSavings.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = activeSavings.reduce((sum, g) => sum + g.targetAmount, 0);
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
  const savingsSummary = `${formatCurrency(totalSaved, 'USD')} saved`;
  const savingsDetails = `${overallProgress.toFixed(1)}% progress • ${activeSavings.length} active goals`;

  // Loading state
  if (authLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading...</p>
            </div>
          </div>
        </PageContainer>
      </AppLayout>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <AppLayout>
      <PageContainer className="pb-20">
        {/* Header with Context Selector - Sticky on mobile */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-4 px-4 py-4 border-b mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold gradient-text">
                Finances
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date().toLocaleDateString('en-US', { 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </p>
            </div>
            <ContextSelector 
              selected={context} 
              onSelect={handleContextChange} 
            />
          </div>
        </div>

        {/* Pull to Refresh Hint */}
        <div className="text-center text-xs text-muted-foreground mb-4 flex items-center justify-center gap-2">
          <RefreshCw className="h-3 w-3" />
          <span>Pull down to refresh</span>
        </div>

        {/* Financial Sections - Accordion Style */}
        <div className="space-y-4">
          {/* Income Section */}
          <FinancialSectionCard
            title="Income"
            icon={<DollarSign className="h-6 w-6" />}
            summary={incomeSummary}
            details={incomeDetails}
            onManage={() => router.push('/income')}
            manageLabel="Manage Income"
            isEmpty={activeIncome.length === 0}
            emptyState={
              <EmptyState
                icon={<DollarSign className="h-12 w-12" />}
                title="No Income Sources"
                description="Add your first income source to start tracking your earnings."
                action={
                  <button
                    onClick={() => router.push('/income')}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-lg font-medium transition-all"
                  >
                    Add Income Source
                  </button>
                }
              />
            }
          >
            {activeIncome.length > 0 && (
              <div className="space-y-2">
                {activeIncome.slice(0, 3).map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.frequency}
                      </p>
                    </div>
                    <p className="font-semibold ml-2">
                      {formatCurrency(source.amount, source.currency)}
                    </p>
                  </div>
                ))}
                {activeIncome.length > 3 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    +{activeIncome.length - 3} more
                  </p>
                )}
              </div>
            )}
          </FinancialSectionCard>

          {/* Budget Section */}
          <FinancialSectionCard
            title="Budget"
            icon={<CreditCard className="h-6 w-6" />}
            summary={budgetSummary}
            details={budgetDetails}
            onManage={() => router.push('/budgets')}
            manageLabel="Manage Budgets"
            isEmpty={currentBudgets.length === 0}
            emptyState={
              <EmptyState
                icon={<CreditCard className="h-12 w-12" />}
                title="No Budgets Set"
                description="Create budgets to track your spending and stay on target."
                action={
                  <button
                    onClick={() => router.push('/budgets')}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-lg font-medium transition-all"
                  >
                    Create Budget
                  </button>
                }
              />
            }
          >
            {currentBudgets.length > 0 && (
              <div className="space-y-2">
                {currentBudgets.slice(0, 3).map((budget) => {
                  const usage = personalBudgetUsage.find(u => u.category === budget.category);
                  const spent = usage?.totalSpent || 0;
                  const percentage = (spent / budget.monthlyLimit) * 100;

                  return (
                    <div
                      key={budget.id}
                      className="p-3 rounded-lg bg-accent/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{budget.category}</p>
                        <p className="text-sm font-semibold">
                          {formatCurrency(spent, 'USD')} / {formatCurrency(budget.monthlyLimit, 'USD')}
                        </p>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            percentage >= 100
                              ? 'bg-red-500'
                              : percentage >= 80
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {currentBudgets.length > 3 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    +{currentBudgets.length - 3} more
                  </p>
                )}
              </div>
            )}
          </FinancialSectionCard>

          {/* Savings Section */}
          <FinancialSectionCard
            title="Savings"
            icon={<Target className="h-6 w-6" />}
            summary={savingsSummary}
            details={savingsDetails}
            onManage={() => router.push('/savings')}
            manageLabel="Manage Savings"
            isEmpty={activeSavings.length === 0}
            emptyState={
              <EmptyState
                icon={<Target className="h-12 w-12" />}
                title="No Savings Goals"
                description="Create savings goals to work towards your financial dreams."
                action={
                  <button
                    onClick={() => router.push('/savings')}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-lg font-medium transition-all"
                  >
                    Create Goal
                  </button>
                }
              />
            }
          >
            {activeSavings.length > 0 && (
              <div className="space-y-2">
                {activeSavings.slice(0, 3).map((goal) => {
                  const progress = calculateProgressPercentage(goal.currentAmount, goal.targetAmount);

                  return (
                    <div
                      key={goal.id}
                      className="p-3 rounded-lg bg-accent/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium truncate flex-1">{goal.name}</p>
                        <p className="text-sm font-semibold ml-2">
                          {progress.toFixed(0)}%
                        </p>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(goal.currentAmount, 'USD')} / {formatCurrency(goal.targetAmount, 'USD')}
                      </p>
                    </div>
                  );
                })}
                {activeSavings.length > 3 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    +{activeSavings.length - 3} more
                  </p>
                )}
              </div>
            )}
          </FinancialSectionCard>
        </div>

        {/* Bottom spacing for mobile */}
        <div className="h-8" />
      </PageContainer>
    </AppLayout>
  );
}

