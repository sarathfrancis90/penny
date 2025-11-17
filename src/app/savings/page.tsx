'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SavingsGoalForm } from '@/components/savings/SavingsGoalForm';
import { SavingsGoalCard } from '@/components/savings/SavingsGoalCard';
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

  const handleCreate = async (data: {
    name: string;
    category: string;
    targetAmount: number;
    currentAmount: number;
    monthlyContribution: number;
    targetDate?: string;
    priority: string;
    description?: string;
    emoji?: string;
    currency: string;
  }) => {
    try {
      await createGoal(data as unknown as Partial<PersonalSavingsGoal>);
      setShowCreateDialog(false);
      toast.success('Savings goal created successfully');
    } catch {
      // Error already handled in hook
    }
  };

  const handleUpdate = async (data: {
    name: string;
    category: string;
    targetAmount: number;
    currentAmount: number;
    monthlyContribution: number;
    targetDate?: string;
    priority: string;
    description?: string;
    emoji?: string;
    currency: string;
  }) => {
    if (!editingGoal) return;
    try {
      await updateGoal(editingGoal.id, data as unknown as Partial<PersonalSavingsGoal>);
      setEditingGoal(null);
      toast.success('Savings goal updated successfully');
    } catch {
      // Error already handled in hook
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Savings Goals</h1>
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
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Saved</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency(totalSaved, 'USD')}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Target Amount</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency(totalTarget, 'USD')}
                  </p>
                </div>
                <Target className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
                  <p className="text-2xl font-bold mt-1">
                    {overallProgress.toFixed(1)}%
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold">
                    {Math.round(overallProgress)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Monthly Savings</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency(totalMonthlySavings, 'USD')}
                  </p>
                </div>
                <Award className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
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
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Target className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {activeTab === 'active' && 'No Active Goals'}
                    {activeTab === 'achieved' && 'No Achieved Goals Yet'}
                    {activeTab === 'paused' && 'No Paused Goals'}
                    {activeTab === 'cancelled' && 'No Cancelled Goals'}
                  </h3>
                  <p className="text-muted-foreground text-center mb-4 max-w-md">
                    {activeTab === 'active' &&
                      'Create your first savings goal to start tracking your financial progress.'}
                    {activeTab === 'achieved' &&
                      'Keep working on your active goals to celebrate your achievements!'}
                    {activeTab === 'paused' &&
                      'Resume any paused goals to get back on track.'}
                    {activeTab === 'cancelled' &&
                      'Cancelled goals are archived here for your records.'}
                  </p>
                  {activeTab === 'active' && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create Savings Goal
                    </Button>
                  )}
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
      </div>
    </AppLayout>
  );
}

