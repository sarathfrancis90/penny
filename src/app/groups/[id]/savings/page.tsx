'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GroupSavingsGoal, GoalStatus, SAVINGS_CATEGORY_LABELS, CreateGroupSavingsGoal } from '@/lib/types/savings';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { GroupSavingsGoalService } from '@/lib/services/savingsService';
import { GroupSavingsForm } from '@/components/savings/GroupSavingsForm';
import { Target, PlusCircle, Info, TrendingUp } from 'lucide-react';
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
      
      // Refresh the list
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
      console.error('Error creating group savings goal:', error);
      toast.error('Failed to create savings goal');
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
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{groupName} - Savings Goals</h1>
          <p className="text-muted-foreground mt-1">
            Track and achieve shared financial goals
          </p>
        </div>

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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Active Goals</h2>
            {isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Goal
              </Button>
            )}
          </div>

          {savingsGoals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Group Savings Goals</h3>
                <p className="text-muted-foreground text-center mb-4 max-w-md">
                  {isAdmin
                    ? 'Create savings goals to work towards shared financial objectives together.'
                    : 'Admins can create savings goals for the group.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {savingsGoals.map((goal) => (
                <Card key={goal.id}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {goal.emoji && <span className="text-2xl">{goal.emoji}</span>}
                      <div>
                        <CardTitle>{goal.name}</CardTitle>
                        <CardDescription>
                          {SAVINGS_CATEGORY_LABELS[goal.category]}
                        </CardDescription>
                      </div>
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
        </div>
      </div>

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
    </AppLayout>
  );
}

