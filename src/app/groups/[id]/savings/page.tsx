'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { AppLayout } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GroupSavingsGoal, GoalStatus, SAVINGS_CATEGORY_LABELS, CreateGroupSavingsGoal, UpdateGroupSavingsGoal } from '@/lib/types/savings';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { GroupSavingsGoalService } from '@/lib/services/savingsService';
import { GroupSavingsForm } from '@/components/savings/GroupSavingsForm';
import { Target, PlusCircle, Info, TrendingUp, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GroupSavingsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const groupId = resolvedParams.id;
  const { user, loading: authLoading } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [savingsGoals, setSavingsGoals] = useState<GroupSavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GroupSavingsGoal | null>(null);
  
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !groupId) return;

      try {
        setLoading(true);

        // Fetch group details
        const groupDoc = await getDoc(doc(db, 'groups', groupId));
        if (groupDoc.exists()) {
          setGroupName(groupDoc.data().name);
        }

        // Check if user is admin
        const membershipDoc = await getDoc(doc(db, 'groupMembers', `${groupId}_${user.uid}`));
        if (membershipDoc.exists()) {
          const role = membershipDoc.data().role;
          setIsAdmin(role === 'admin' || role === 'owner');
        }

        // Fetch group savings goals
        const q = query(
          collection(db, 'savings_goals_group'),
          where('groupId', '==', groupId),
          where('isActive', '==', true),
          where('status', '==', GoalStatus.ACTIVE)
        );
        const querySnapshot = await getDocs(q);
        const goals: GroupSavingsGoal[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as GroupSavingsGoal[];

        setSavingsGoals(goals);
      } catch (error) {
        console.error('Error fetching group savings goals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, groupId]);

  const refreshSavingsGoals = async () => {
    try {
      const q = query(
        collection(db, 'savings_goals_group'),
        where('groupId', '==', groupId),
        where('isActive', '==', true),
        where('status', '==', GoalStatus.ACTIVE)
      );
      const querySnapshot = await getDocs(q);
      const goals: GroupSavingsGoal[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GroupSavingsGoal[];
      setSavingsGoals(goals);
    } catch (error) {
      console.error('Error refreshing savings goals:', error);
    }
  };

  const handleCreateGoal = async (data: Partial<GroupSavingsGoal>) => {
    if (!user?.uid) return;

    try {
      const dataWithCreatedBy: CreateGroupSavingsGoal = {
        ...data,
        createdBy: user.uid,
        contributionType: 'equal', // Default contribution type for group savings
      } as CreateGroupSavingsGoal;

      await GroupSavingsGoalService.create(dataWithCreatedBy);
      setShowCreateDialog(false);
      toast.success('Group savings goal created successfully');
      await refreshSavingsGoals();
    } catch (error) {
      console.error('Error creating group savings goal:', error);
      toast.error('Failed to create savings goal');
    }
  };

  const handleUpdateGoal = async (data: Partial<GroupSavingsGoal>) => {
    if (!editingGoal) return;

    try {
      await GroupSavingsGoalService.update(editingGoal.id, data as UpdateGroupSavingsGoal);
      setEditingGoal(null);
      toast.success('Savings goal updated successfully');
      await refreshSavingsGoals();
    } catch (error) {
      console.error('Error updating group savings goal:', error);
      toast.error('Failed to update savings goal');
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    const confirmed = await confirm({
      title: 'Delete Savings Goal',
      description: 'Are you sure you want to delete this savings goal? All progress will be lost and this action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await GroupSavingsGoalService.delete(goalId);
      toast.success('Savings goal deleted successfully');
      await refreshSavingsGoals();
    } catch (error) {
      console.error('Error deleting group savings goal:', error);
      toast.error('Failed to delete savings goal');
    }
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading group savings goals...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <p className="text-lg">Please sign in to view group savings goals.</p>
        </div>
      </AppLayout>
    );
  }

  const totalSaved = savingsGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const totalTarget = savingsGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalMonthlyContribution = savingsGoals.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  return (
    <AppLayout>
      <PageContainer>
        {/* Header */}
        <PageHeader
          title={`${groupName} - Savings Goals`}
          subtitle="Track and achieve shared financial goals"
          backHref={`/groups/${groupId}`}
          action={
            isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Goal
              </Button>
            )
          }
        />

        {/* Info Alert */}
        {!isAdmin && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Only group admins and owners can manage savings goals. All members can contribute.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Saved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalSaved, 'USD')}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Target Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalTarget, 'USD')}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallProgress.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monthly Contribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalMonthlyContribution, 'USD')}</div>
            </CardContent>
          </Card>
        </div>

        {/* Savings Goals List */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Savings Goals ({savingsGoals.length})
            </CardTitle>
            <CardDescription>
              Track progress towards your group&apos;s financial goals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {savingsGoals.length === 0 ? (
              <EmptyState
                icon={<Target className="h-12 w-12" />}
                title="No Group Savings Goals"
                description={
                  isAdmin
                    ? "Create savings goals to work towards shared financial objectives together."
                    : 'Admins can create savings goals for the group.'
                }
                action={
                  isAdmin && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create Goal
                    </Button>
                  )
                }
              />
            ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {savingsGoals.map((goal) => (
                <Card key={goal.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        {goal.emoji && <span className="text-2xl">{goal.emoji}</span>}
                        <div>
                          <CardTitle>{goal.name}</CardTitle>
                          <CardDescription>
                            {SAVINGS_CATEGORY_LABELS[goal.category]}
                          </CardDescription>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingGoal(goal)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteGoal(goal.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-semibold">{goal.progressPercentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={goal.progressPercentage} className="h-2" />
                    </div>

                    {/* Amounts */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current:</span>
                        <span className="font-medium">{formatCurrency(goal.currentAmount, goal.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target:</span>
                        <span className="font-medium">{formatCurrency(goal.targetAmount, goal.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className="font-medium">
                          {formatCurrency(goal.targetAmount - goal.currentAmount, goal.currency)}
                        </span>
                      </div>
                    </div>

                    {/* Monthly Contribution */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-muted-foreground">Monthly:</span>
                        </div>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(goal.monthlyContribution, goal.currency)}
                        </span>
                      </div>
                    </div>

                    {/* Contribution Type */}
                    <div className="text-xs text-muted-foreground">
                      Split: {goal.contributionType.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </CardContent>
        </Card>
      </PageContainer>

      {/* Create Goal Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Group Savings Goal</DialogTitle>
            <DialogDescription>
              Create a new savings goal for {groupName}. All group members can contribute to this goal.
            </DialogDescription>
          </DialogHeader>
          <GroupSavingsForm
            groupId={groupId}
            onSubmit={handleCreateGoal}
            onCancel={() => setShowCreateDialog(false)}
            submitLabel="Create Goal"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Goal Dialog */}
      <Dialog open={!!editingGoal} onOpenChange={(open) => !open && setEditingGoal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Group Savings Goal</DialogTitle>
            <DialogDescription>
              Update the savings goal details for {groupName}.
            </DialogDescription>
          </DialogHeader>
          {editingGoal && (
            <GroupSavingsForm
              groupId={groupId}
              initialData={editingGoal}
              onSubmit={handleUpdateGoal}
              onCancel={() => setEditingGoal(null)}
              submitLabel="Update Goal"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </AppLayout>
  );
}

