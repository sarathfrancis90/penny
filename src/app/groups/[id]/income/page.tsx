'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GroupIncomeSource, CreateGroupIncomeSource } from '@/lib/types/income';
import { formatCurrency, calculateMonthlyIncome } from '@/lib/utils/incomeCalculations';
import { GroupIncomeService } from '@/lib/services/incomeService';
import { GroupIncomeForm } from '@/components/income/GroupIncomeForm';
import { DollarSign, PlusCircle, Info, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GroupIncomePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const groupId = resolvedParams.id;
  const { user, loading: authLoading } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [incomeSources, setIncomeSources] = useState<GroupIncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<GroupIncomeSource | null>(null);

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

        // Fetch group income sources
        const q = query(
          collection(db, 'income_sources_group'),
          where('groupId', '==', groupId),
          where('isActive', '==', true)
        );
        const querySnapshot = await getDocs(q);
        const sources: GroupIncomeSource[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as GroupIncomeSource[];

        setIncomeSources(sources);
      } catch (error) {
        console.error('Error fetching group income:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, groupId]);

  const refreshIncomeSources = async () => {
    try {
      const q = query(
        collection(db, 'income_sources_group'),
        where('groupId', '==', groupId),
        where('isActive', '==', true)
      );
      const querySnapshot = await getDocs(q);
      const sources: GroupIncomeSource[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GroupIncomeSource[];
      setIncomeSources(sources);
    } catch (error) {
      console.error('Error refreshing income sources:', error);
    }
  };

  const handleCreateIncome = async (data: Partial<GroupIncomeSource>) => {
    if (!user?.uid) return;

    try {
      const dataWithAddedBy: CreateGroupIncomeSource = {
        ...data,
        addedBy: user.uid,
        splitType: 'equal', // Default split type for group income
      } as CreateGroupIncomeSource;

      await GroupIncomeService.create(dataWithAddedBy);
      setShowCreateDialog(false);
      toast.success('Group income source created successfully');
      await refreshIncomeSources();
    } catch (error) {
      console.error('Error creating group income:', error);
      toast.error('Failed to create income source');
    }
  };

  const handleUpdateIncome = async (data: Partial<GroupIncomeSource>) => {
    if (!editingIncome) return;

    try {
      await GroupIncomeService.update(editingIncome.id, data as any);
      setEditingIncome(null);
      toast.success('Income source updated successfully');
      await refreshIncomeSources();
    } catch (error) {
      console.error('Error updating group income:', error);
      toast.error('Failed to update income source');
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    if (!confirm('Are you sure you want to delete this income source?')) return;

    try {
      await GroupIncomeService.delete(incomeId);
      toast.success('Income source deleted successfully');
      await refreshIncomeSources();
    } catch (error) {
      console.error('Error deleting group income:', error);
      toast.error('Failed to delete income source');
    }
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading group income...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <p className="text-lg">Please sign in to view group income.</p>
        </div>
      </AppLayout>
    );
  }

  const totalMonthlyIncome = incomeSources.reduce((sum, source) => {
    return sum + calculateMonthlyIncome(source.amount, source.frequency);
  }, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{groupName} - Income</h1>
          <p className="text-muted-foreground mt-1">
            Manage group income sources
          </p>
        </div>

        {/* Info Alert */}
        {!isAdmin && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Only group admins and owners can manage income sources.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Debug: Show admin status (remove after testing) */}
        {isAdmin && (
          <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <Info className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              ✓ You are an admin - Edit/delete buttons should be visible on income cards
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Total Monthly Group Income</CardTitle>
            <CardDescription>Combined income from all active sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(totalMonthlyIncome, 'USD')}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              From {incomeSources.length} source{incomeSources.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Income Sources List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Income Sources</h2>
            {isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Income Source
              </Button>
            )}
          </div>

          {incomeSources.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Group Income Sources</h3>
                <p className="text-muted-foreground text-center mb-4 max-w-md">
                  {isAdmin
                    ? 'Add income sources to track your group\'s combined income.'
                    : 'Admins can add income sources for the group.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {incomeSources.map((source) => (
                <Card key={source.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle>{source.name}</CardTitle>
                        <CardDescription>
                          {source.category.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </CardDescription>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingIncome(source)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteIncome(source.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Amount:</span>
                        <span className="font-medium">
                          {formatCurrency(source.amount, source.currency)} / {source.frequency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Monthly Equivalent:</span>
                        <span className="font-semibold">
                          {formatCurrency(
                            calculateMonthlyIncome(source.amount, source.frequency),
                            source.currency
                          )}
                        </span>
                      </div>
                      {source.contributedBy && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Contributed By:</span>
                          <span className="text-sm">{source.contributedBy}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Income Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Group Income Source</DialogTitle>
            <DialogDescription>
              Add a new income source for {groupName}. All group admins can manage income sources.
            </DialogDescription>
          </DialogHeader>
          <GroupIncomeForm
            groupId={groupId}
            onSubmit={handleCreateIncome}
            onCancel={() => setShowCreateDialog(false)}
            submitLabel="Create Income Source"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Income Dialog */}
      <Dialog open={!!editingIncome} onOpenChange={(open) => !open && setEditingIncome(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Group Income Source</DialogTitle>
            <DialogDescription>
              Update the income source details for {groupName}.
            </DialogDescription>
          </DialogHeader>
          {editingIncome && (
            <GroupIncomeForm
              groupId={groupId}
              initialData={editingIncome}
              onSubmit={handleUpdateIncome}
              onCancel={() => setEditingIncome(null)}
              submitLabel="Update Income Source"
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

