'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIncome } from '@/hooks/useIncome';
import { useIncomeAllocation } from '@/hooks/useIncomeAllocation';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncomeSourceForm } from '@/components/income/IncomeSourceForm';
import { IncomeSourceCard } from '@/components/income/IncomeSourceCard';
import { IncomeReductionWarning } from '@/components/allocation/IncomeReductionWarning';
import { PersonalIncomeSource } from '@/lib/types/income';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { PlusCircle, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function IncomePage() {
  const { user, loading: authLoading } = useAuth();
  const {
    incomeSources,
    activeIncomeSources,
    totalMonthlyIncome,
    loading,
    createIncome,
    updateIncome,
    deleteIncome,
  } = useIncome();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<PersonalIncomeSource | null>(null);
  const [activeTab, setActiveTab] = useState('active');

  // Income deletion validation
  const allocation = useIncomeAllocation(user?.uid);
  const [showIncomeWarning, setShowIncomeWarning] = useState(false);
  const [pendingDeleteIncome, setPendingDeleteIncome] = useState<PersonalIncomeSource | null>(null);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading income sources...</p>
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
            <p className="text-lg">Please sign in to manage your income.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const handleCreate = async (data: Partial<PersonalIncomeSource>) => {
    try {
      await createIncome(data);
      setShowCreateDialog(false);
      toast.success('Income source created successfully');
    } catch {
      // Error already handled in hook
    }
  };

  const handleUpdate = async (data: Partial<PersonalIncomeSource>) => {
    if (!editingIncome) return;
    try {
      await updateIncome(editingIncome.id, data);
      setEditingIncome(null);
      toast.success('Income source updated successfully');
    } catch {
      // Error already handled in hook
    }
  };

  const handleToggleActive = async (incomeId: string, isActive: boolean) => {
    await updateIncome(incomeId, { isActive });
  };

  const calculateMonthlyAmount = (income: PersonalIncomeSource): number => {
    switch (income.frequency) {
      case 'monthly':
        return income.amount;
      case 'biweekly':
        return income.amount * (26 / 12);
      case 'weekly':
        return income.amount * (52 / 12);
      case 'yearly':
        return income.amount / 12;
      case 'once':
        return 0; // One-time income doesn't affect monthly budget
      default:
        return 0;
    }
  };

  const handleDelete = async (incomeId: string) => {
    const incomeToDelete = incomeSources.find((s) => s.id === incomeId);
    if (!incomeToDelete) return;

    const monthlyAmount = calculateMonthlyAmount(incomeToDelete);
    const newIncome = allocation.totalMonthlyIncome - monthlyAmount;
    const currentAllocations = allocation.totalBudgets + allocation.totalSavings;

    // Check if deleting would cause over-allocation
    if (newIncome < currentAllocations) {
      setPendingDeleteIncome(incomeToDelete);
      setShowIncomeWarning(true);
      return;
    }

    // Safe to delete
    try {
      await deleteIncome(incomeId);
      // Toast is shown by IncomeSourceCard component
    } catch {
      // Error already handled
    }
  };

  const displayedSources =
    activeTab === 'active'
      ? activeIncomeSources
      : incomeSources.filter((s) => !s.isActive);

  // Calculate stats
  const totalAnnualIncome = totalMonthlyIncome * 12;
  const activeSourcesCount = activeIncomeSources.length;
  const totalSourcesCount = incomeSources.length;

  return (
    <AppLayout>
      <PageContainer>
        {/* Header */}
        <PageHeader
          title="Income Management"
          subtitle="Track all your income sources and plan your budget"
          action={
            <Button onClick={() => setShowCreateDialog(true)} size="lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              Add Income Source
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Monthly Income"
            value={formatCurrency(totalMonthlyIncome, 'USD')}
            subtitle={`From ${activeSourcesCount} active source${activeSourcesCount !== 1 ? 's' : ''}`}
            icon={<DollarSign className="h-4 w-4" />}
          />
          
          <StatCard
            title="Annual Income"
            value={formatCurrency(totalAnnualIncome, 'USD')}
            subtitle="Projected for the year"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          
          <StatCard
            title="Income Sources"
            value={totalSourcesCount}
            subtitle={`${activeSourcesCount} active, ${totalSourcesCount - activeSourcesCount} inactive`}
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>

        {/* Income Sources List */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">
              Active ({activeSourcesCount})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({totalSourcesCount - activeSourcesCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-6">
            {activeSourcesCount === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={<DollarSign className="h-12 w-12" />}
                    title="No Active Income Sources"
                    description="Add your first income source to start tracking your earnings and planning your budget."
                    action={
                      <Button onClick={() => setShowCreateDialog(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Income Source
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeIncomeSources.map((income) => (
                  <IncomeSourceCard
                    key={income.id}
                    income={income}
                    onEdit={setEditingIncome}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="inactive" className="space-y-4 mt-6">
            {displayedSources.length === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={<DollarSign className="h-12 w-12" />}
                    title="No Inactive Income Sources"
                    description="All your income sources are currently active."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {displayedSources.map((income) => (
                  <IncomeSourceCard
                    key={income.id}
                    income={income}
                    onEdit={setEditingIncome}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
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
              <DialogTitle>Add Income Source</DialogTitle>
            </DialogHeader>
            <IncomeSourceForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateDialog(false)}
              submitLabel="Create Income Source"
            />
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingIncome} onOpenChange={(open) => !open && setEditingIncome(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Income Source</DialogTitle>
            </DialogHeader>
            {editingIncome && (
              <IncomeSourceForm
                initialData={editingIncome}
                onSubmit={handleUpdate}
                onCancel={() => setEditingIncome(null)}
                submitLabel="Update Income Source"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Income Reduction Warning Dialog */}
        {pendingDeleteIncome && (
          <IncomeReductionWarning
            open={showIncomeWarning}
            currentIncome={allocation.totalMonthlyIncome}
            newIncome={allocation.totalMonthlyIncome - calculateMonthlyAmount(pendingDeleteIncome)}
            totalAllocations={allocation.totalBudgets + allocation.totalSavings}
            shortfall={
              (allocation.totalBudgets + allocation.totalSavings) -
              (allocation.totalMonthlyIncome - calculateMonthlyAmount(pendingDeleteIncome))
            }
            incomeName={pendingDeleteIncome.name}
            onCancel={() => {
              setShowIncomeWarning(false);
              setPendingDeleteIncome(null);
            }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

