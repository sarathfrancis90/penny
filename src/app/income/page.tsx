'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIncome } from '@/hooks/useIncome';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncomeSourceForm } from '@/components/income/IncomeSourceForm';
import { IncomeSourceCard } from '@/components/income/IncomeSourceCard';
import { PersonalIncomeSource } from '@/lib/types/income';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { PlusCircle, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function IncomePage() {
  const { user, authLoading } = useAuth();
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

  const handleCreate = async (data: any) => {
    try {
      await createIncome(data);
      setShowCreateDialog(false);
      toast.success('Income source created successfully');
    } catch (error) {
      // Error already handled in hook
    }
  };

  const handleUpdate = async (data: any) => {
    if (!editingIncome) return;
    try {
      await updateIncome(editingIncome.id, data);
      setEditingIncome(null);
      toast.success('Income source updated successfully');
    } catch (error) {
      // Error already handled in hook
    }
  };

  const handleToggleActive = async (incomeId: string, isActive: boolean) => {
    await updateIncome(incomeId, { isActive });
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Income Management</h1>
            <p className="text-muted-foreground mt-1">
              Track all your income sources and plan your budget
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} size="lg">
            <PlusCircle className="mr-2 h-5 w-5" />
            Add Income Source
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Income</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalMonthlyIncome, 'USD')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From {activeSourcesCount} active source{activeSourcesCount !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Annual Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalAnnualIncome, 'USD')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Projected for the year
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Income Sources</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSourcesCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeSourcesCount} active, {totalSourcesCount - activeSourcesCount} inactive
              </p>
            </CardContent>
          </Card>
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
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Active Income Sources</h3>
                  <p className="text-muted-foreground text-center mb-4 max-w-md">
                    Add your first income source to start tracking your earnings and planning
                    your budget.
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Income Source
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeIncomeSources.map((income) => (
                  <IncomeSourceCard
                    key={income.id}
                    income={income}
                    onEdit={setEditingIncome}
                    onDelete={deleteIncome}
                    onToggleActive={handleToggleActive}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="inactive" className="space-y-4 mt-6">
            {displayedSources.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground">No inactive income sources</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {displayedSources.map((income) => (
                  <IncomeSourceCard
                    key={income.id}
                    income={income}
                    onEdit={setEditingIncome}
                    onDelete={deleteIncome}
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
      </div>
    </AppLayout>
  );
}

