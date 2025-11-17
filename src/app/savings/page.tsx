'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useIncomeAllocation } from '@/hooks/useIncomeAllocation';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageContainer } from '@/components/ui/page-container';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SavingsGoalForm } from '@/components/savings/SavingsGoalForm';
import { SavingsGoalCard } from '@/components/savings/SavingsGoalCard';
import { AllocationWarningDialog } from '@/components/allocation/AllocationWarningDialog';
import { AllocationStatusBadge } from '@/components/allocation/AllocationStatusBadge';
import { PersonalSavingsGoal, GoalStatus } from '@/lib/types/savings';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { Target, PlusCircle, TrendingUp, Award } from 'lucide-react';
import { toast } from 'sonner';

export default function SavingsPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    savingsGoals,
    activeGoals,
    achievedGoals,
    totalMonthlySavings,
    totalSaved,
    totalTarget,
    overallProgress,
    loading,
    createGoal,
    updateGoal,
    deleteGoal,
    pauseGoal,
    resumeGoal,
  } = useSavingsGoals();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<PersonalSavingsGoal | null>(null);
  const [activeTab, setActiveTab] = useState<string>('active');

  // Allocation validation
  const allocation = useIncomeAllocation(user?.uid);
  const [showAllocationWarning, setShowAllocationWarning] = useState(false);
  const [pendingGoalData, setPendingGoalData] = useState<{
    goalData: Partial<PersonalSavingsGoal>;
    goalName: string;
    monthlyContribution: number;
    isEdit: boolean;
  } | null>(null);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading savings goals...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <p className="text-lg">Please sign in to manage your savings goals.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const handleCreate = async (data: Partial<PersonalSavingsGoal>) => {
    const monthlyContribution = data.monthlyContribution || 0;
    
    // Validate allocation before creating
    const validation = allocation.validateAllocation(0, monthlyContribution);
    if (!validation.isValid) {
      // Show warning dialog
      setPendingGoalData({
        goalData: data,
        goalName: data.name || 'New Goal',
        monthlyContribution,
        isEdit: false,
      });
      setShowAllocationWarning(true);
      return;
    }

    // Proceed with creation
    await proceedWithGoalCreation(data);
  };

  const proceedWithGoalCreation = async (data: Partial<PersonalSavingsGoal>) => {
    try {
      await createGoal(data);
      setShowCreateDialog(false);
      setShowAllocationWarning(false);
      setPendingGoalData(null);
      toast.success('Savings goal created successfully');
    } catch {
      // Error already handled in hook
    }
  };

  const handleUpdate = async (data: Partial<PersonalSavingsGoal>) => {
    if (!editingGoal) return;
    
    const newMonthlyContribution = data.monthlyContribution || 0;
    const oldMonthlyContribution = editingGoal.monthlyContribution || 0;
    const difference = newMonthlyContribution - oldMonthlyContribution;

    // Validate allocation if increasing the monthly contribution
    if (difference > 0) {
      const validation = allocation.validateAllocation(0, difference);
      if (!validation.isValid) {
        // Show warning dialog
        setPendingGoalData({
          goalData: data,
          goalName: data.name || editingGoal.name,
          monthlyContribution: newMonthlyContribution,
          isEdit: true,
        });
        setShowAllocationWarning(true);
        return;
      }
    }

    // Proceed with update
    await proceedWithGoalUpdate(editingGoal.id, data);
  };

  const proceedWithGoalUpdate = async (goalId: string, data: Partial<PersonalSavingsGoal>) => {
    try {
      await updateGoal(goalId, data);
      setEditingGoal(null);
      setShowAllocationWarning(false);
      setPendingGoalData(null);
      toast.success('Savings goal updated successfully');
    } catch {
      // Error already handled in hook
    }
  };

  const handleConfirmOverAllocation = () => {
    if (pendingGoalData) {
      if (pendingGoalData.isEdit && editingGoal) {
        proceedWithGoalUpdate(editingGoal.id, pendingGoalData.goalData);
      } else {
        proceedWithGoalCreation(pendingGoalData.goalData);
      }
    }
  };

  // Filter goals by status
  const pausedGoals = savingsGoals.filter((g) => g.status === GoalStatus.PAUSED);
  const cancelledGoals = savingsGoals.filter((g) => g.status === GoalStatus.CANCELLED);

  const getDisplayedGoals = () => {
    switch (activeTab) {
      case 'active':
        return activeGoals;
      case 'achieved':
        return achievedGoals;
      case 'paused':
        return pausedGoals;
      case 'cancelled':
        return cancelledGoals;
      default:
        return activeGoals;
    }
  };

  const displayedGoals = getDisplayedGoals();

  return (
    <AppLayout>
      <PageContainer>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold gradient-text">Savings Goals</h1>
              {!allocation.loading && (
                <AllocationStatusBadge
                  unallocated={allocation.unallocated}
                  isOverAllocated={allocation.isOverAllocated}
                  totalIncome={allocation.totalMonthlyIncome}
                />
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Track your progress and achieve your financial dreams
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} size="lg">
            <PlusCircle className="mr-2 h-5 w-5" />
            Create Goal
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Saved"
            value={formatCurrency(totalSaved, 'USD')}
            icon={<TrendingUp className="h-4 w-4" />}
            valueClassName="text-green-600 dark:text-green-400"
          />

          <StatCard
            title="Target Amount"
            value={formatCurrency(totalTarget, 'USD')}
            icon={<Target className="h-4 w-4" />}
          />

          <StatCard
            title="Overall Progress"
            value={`${overallProgress.toFixed(1)}%`}
            subtitle={`${achievedGoals.length} goals achieved`}
            icon={<Award className="h-4 w-4" />}
          />

          <StatCard
            title="Monthly Savings"
            value={formatCurrency(totalMonthlySavings, 'USD')}
            subtitle={`From ${activeGoals.length} active goals`}
            icon={<Award className="h-4 w-4" />}
          />
        </div>

        {/* Savings Goals List */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({activeGoals.length})</TabsTrigger>
            <TabsTrigger value="achieved">Achieved ({achievedGoals.length})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({pausedGoals.length})</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled ({cancelledGoals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4 mt-6">
            {displayedGoals.length === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={<Target className="h-12 w-12" />}
                    title={
                      activeTab === 'active' ? 'No Active Goals' :
                      activeTab === 'achieved' ? 'No Achieved Goals Yet' :
                      activeTab === 'paused' ? 'No Paused Goals' :
                      'No Cancelled Goals'
                    }
                    description={
                      activeTab === 'active' ? 'Create your first savings goal to start tracking your financial progress.' :
                      activeTab === 'achieved' ? 'Keep working on your active goals to celebrate your achievements!' :
                      activeTab === 'paused' ? 'Resume any paused goals to get back on track.' :
                      'Cancelled goals are archived here for your records.'
                    }
                    action={
                      activeTab === 'active' && (
                        <Button onClick={() => setShowCreateDialog(true)}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Create Savings Goal
                        </Button>
                      )
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {displayedGoals.map((goal) => (
                  <SavingsGoalCard
                    key={goal.id}
                    goal={goal}
                    onEdit={setEditingGoal}
                    onDelete={deleteGoal}
                    onPause={pauseGoal}
                    onResume={resumeGoal}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Savings Goal</DialogTitle>
            </DialogHeader>
            <SavingsGoalForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateDialog(false)}
              submitLabel="Create Goal"
            />
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingGoal} onOpenChange={(open) => !open && setEditingGoal(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Savings Goal</DialogTitle>
            </DialogHeader>
            {editingGoal && (
              <SavingsGoalForm
                initialData={editingGoal}
                onSubmit={handleUpdate}
                onCancel={() => setEditingGoal(null)}
                submitLabel="Update Goal"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Allocation Warning Dialog */}
        <AllocationWarningDialog
          open={showAllocationWarning}
          income={allocation.totalMonthlyIncome}
          currentBudgets={allocation.totalBudgets}
          currentSavings={allocation.totalSavings}
          newAmount={pendingGoalData?.monthlyContribution || 0}
          type="savings"
          itemName={pendingGoalData?.goalName}
          overAllocation={
            allocation.validateAllocation(0, pendingGoalData?.monthlyContribution || 0).overAllocation
          }
          onConfirm={handleConfirmOverAllocation}
          onCancel={() => {
            setShowAllocationWarning(false);
            setPendingGoalData(null);
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}

