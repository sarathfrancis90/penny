"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter, useSearchParams } from "next/navigation";
import { usePersonalBudgets } from "@/hooks/usePersonalBudgets";
import { useGroupBudgets } from "@/hooks/useGroupBudgets";
import { useGroups } from "@/hooks/useGroups";
import { useBudgetManagement } from "@/hooks/useBudgetManagement";
import { useBudgetUsage } from "@/hooks/useBudgetUsage";
import { getCurrentPeriod } from "@/lib/budgetCalculations";
import { expenseCategories } from "@/lib/categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { Loader2, PlusCircle, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function BudgetsPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPeriod = getCurrentPeriod();

  const [selectedTab, setSelectedTab] = useState<"personal" | "group">("personal");
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);

  // Handle tab and groupId query parameters
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    const groupIdParam = searchParams?.get("groupId");
    
    console.log("🔍 [Budgets Page] Query params:", { tabParam, groupIdParam });
    
    if (tabParam === "group") {
      console.log("✅ [Budgets Page] Setting tab to group");
      setSelectedTab("group");
    }
    
    if (groupIdParam) {
      console.log("✅ [Budgets Page] Setting groupId:", groupIdParam);
      setSelectedGroupId(groupIdParam);
      setSelectedTab("group"); // Also switch to group tab
    }
  }, [searchParams]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [rollover, setRollover] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("80");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [alertMembers, setAlertMembers] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);

  const { groups } = useGroups();
  const firstGroupId = groups[0]?.id;
  const displayGroupId = selectedGroupId || firstGroupId;

  const { budgets: personalBudgets, loading: personalLoading } = usePersonalBudgets(
    user?.uid,
    undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const { budgets: groupBudgets, loading: groupLoading } = useGroupBudgets(
    displayGroupId,
    undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const { usage: personalUsage } = useBudgetUsage(
    user?.uid,
    "personal",
    undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const { usage: groupUsage } = useBudgetUsage(
    user?.uid,
    "group",
    displayGroupId,
    currentPeriod.month,
    currentPeriod.year
  );

  const {
    loading: managementLoading,
    createPersonalBudget,
    updatePersonalBudget,
    deletePersonalBudget,
    createGroupBudget,
    updateGroupBudget,
    deleteGroupBudget,
  } = useBudgetManagement(user?.uid);

  const currentBudgets = selectedTab === "personal" ? personalBudgets : groupBudgets;
  const currentUsage = selectedTab === "personal" ? personalUsage : groupUsage;
  const isLoading = selectedTab === "personal" ? personalLoading : groupLoading;

  // Get used categories to filter available options
  const usedCategories = useMemo(
    () => currentBudgets.map((b) => b.category),
    [currentBudgets]
  );

  const availableCategories = useMemo(
    () => expenseCategories.filter((cat) => !usedCategories.includes(cat)),
    [usedCategories]
  );

  // Check if user is admin of selected group
  const isGroupAdmin = useMemo(() => {
    if (!displayGroupId || !groups) return false;
    const group = groups.find((g) => g.id === displayGroupId);
    return group?.myRole === "admin" || group?.myRole === "owner";
  }, [displayGroupId, groups]);

  const resetForm = () => {
    setCategory("");
    setMonthlyLimit("");
    setRollover(false);
    setAlertThreshold("80");
    setNotificationsEnabled(true);
    setAlertMembers(true);
    setRequireApproval(false);
  };

  const handleCreate = async () => {
    if (!category || !monthlyLimit) {
      toast.error("Please fill in all required fields");
      return;
    }

    const limit = parseFloat(monthlyLimit);
    if (isNaN(limit) || limit <= 0) {
      toast.error("Monthly limit must be a positive number");
      return;
    }

    if (selectedTab === "personal") {
      const result = await createPersonalBudget(
        category,
        limit,
        currentPeriod,
        {
          rollover,
          alertThreshold: parseInt(alertThreshold),
          notificationsEnabled,
        }
      );

      if (result) {
        toast.success("Personal budget created successfully!");
        setShowCreateDialog(false);
        resetForm();
      } else {
        toast.error("Failed to create budget");
      }
    } else {
      if (!displayGroupId) {
        toast.error("Please select a group");
        return;
      }

      const result = await createGroupBudget(
        displayGroupId,
        category,
        limit,
        currentPeriod,
        {
          alertMembers,
          requireApprovalWhenOver: requireApproval,
          alertThreshold: parseInt(alertThreshold),
        }
      );

      if (result) {
        toast.success("Group budget created successfully!");
        setShowCreateDialog(false);
        resetForm();
      } else {
        toast.error("Failed to create group budget");
      }
    }
  };

  const handleEdit = (budgetId: string) => {
    const budget = currentBudgets.find((b) => b.id === budgetId);
    if (!budget) return;

    setEditingBudgetId(budgetId);
    setCategory(budget.category);
    setMonthlyLimit(budget.monthlyLimit.toString());

    if (selectedTab === "personal") {
      const personalBudget = budget as typeof personalBudgets[0];
      setRollover(personalBudget.settings?.rollover || false);
      setAlertThreshold(personalBudget.settings?.alertThreshold?.toString() || "80");
      setNotificationsEnabled(personalBudget.settings?.notificationsEnabled || true);
    } else if (selectedTab === "group") {
      const groupBudget = budget as typeof groupBudgets[0];
      setAlertMembers(groupBudget.settings?.alertMembers || true);
      setRequireApproval(groupBudget.settings?.requireApprovalWhenOver || false);
      setAlertThreshold(groupBudget.settings?.alertThreshold?.toString() || "80");
    }

    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!editingBudgetId || !monthlyLimit) {
      toast.error("Invalid budget data");
      return;
    }

    const limit = parseFloat(monthlyLimit);
    if (isNaN(limit) || limit <= 0) {
      toast.error("Monthly limit must be a positive number");
      return;
    }

    if (selectedTab === "personal") {
      const result = await updatePersonalBudget(editingBudgetId, {
        monthlyLimit: limit,
        settings: {
          rollover,
          alertThreshold: parseInt(alertThreshold),
          notificationsEnabled,
        },
      });

      if (result) {
        toast.success("Budget updated successfully!");
        setShowEditDialog(false);
        resetForm();
        setEditingBudgetId(null);
      } else {
        toast.error("Failed to update budget");
      }
    } else {
      const result = await updateGroupBudget(editingBudgetId, {
        monthlyLimit: limit,
        settings: {
          alertMembers,
          requireApprovalWhenOver: requireApproval,
          alertThreshold: parseInt(alertThreshold),
        },
      });

      if (result) {
        toast.success("Group budget updated successfully!");
        setShowEditDialog(false);
        resetForm();
        setEditingBudgetId(null);
      } else {
        toast.error("Failed to update group budget");
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingBudgetId) return;

    const success =
      selectedTab === "personal"
        ? await deletePersonalBudget(deletingBudgetId)
        : await deleteGroupBudget(deletingBudgetId);

    if (success) {
      toast.success("Budget deleted successfully!");
      setShowDeleteDialog(false);
      setDeletingBudgetId(null);
    } else {
      toast.error("Failed to delete budget");
    }
  };

  useEffect(() => {
    console.log("🔍 [Budgets Page] Component mounted");
    console.log("🔍 [Budgets Page] User:", user?.email);
    console.log("🔍 [Budgets Page] Auth loading:", authLoading);
    console.log("🔍 [Budgets Page] Search params:", searchParams?.toString());
  }, []);

  // Show loading while auth is initializing
  if (authLoading) {
    console.log("⏳ [Budgets Page] Waiting for auth to load...");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-violet-600 mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Only redirect if auth is done loading AND user is not authenticated
  if (!user) {
    console.log("❌ [Budgets Page] No user after loading, redirecting to login");
    router.push("/login");
    return null;
  }
  
  console.log("✅ [Budgets Page] User authenticated:", user.email);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Budget Management</h1>
            <p className="text-muted-foreground">
              {new Date(currentPeriod.year, currentPeriod.month - 1).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle>Your Budgets</CardTitle>
              <Button
                onClick={() => {
                  resetForm();
                  setShowCreateDialog(true);
                }}
                disabled={
                  (selectedTab === "group" && !isGroupAdmin) ||
                  availableCategories.length === 0
                }
              >
                <PlusCircle size={16} className="mr-2" />
                Create Budget
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs
              value={selectedTab}
              onValueChange={(v) => setSelectedTab(v as "personal" | "group")}
            >
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="group" disabled={groups.length === 0}>
                  Group {groups.length > 0 && `(${groups.length})`}
                </TabsTrigger>
              </TabsList>

              {/* Personal Budgets */}
              <TabsContent value="personal">
                {personalLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                  </div>
                ) : currentUsage.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">
                      No personal budgets set for this month
                    </p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      Create Your First Budget
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentUsage.map((usage) => (
                      <div key={usage.category} className="relative group">
                        <BudgetCard budget={usage} />
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={() => {
                              const budget = currentBudgets.find(
                                (b) => b.category === usage.category
                              );
                              if (budget) handleEdit(budget.id);
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            onClick={() => {
                              const budget = currentBudgets.find(
                                (b) => b.category === usage.category
                              );
                              if (budget) {
                                setDeletingBudgetId(budget.id);
                                setShowDeleteDialog(true);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Group Budgets */}
              <TabsContent value="group">
                {/* Group Selector */}
                {groups.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 border-b">
                    {groups.map((group) => (
                      <Button
                        key={group.id}
                        size="sm"
                        variant={displayGroupId === group.id ? "default" : "outline"}
                        onClick={() => setSelectedGroupId(group.id)}
                        className="flex-shrink-0"
                      >
                        {group.icon} {group.name}
                      </Button>
                    ))}
                  </div>
                )}

                {!isGroupAdmin && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                    Only group admins can manage group budgets
                  </div>
                )}

                {groupLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                  </div>
                ) : currentUsage.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">
                      No group budgets set for this month
                    </p>
                    {isGroupAdmin && (
                      <Button onClick={() => setShowCreateDialog(true)}>
                        Create Group Budget
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentUsage.map((usage) => (
                      <div key={usage.category} className="relative group">
                        <BudgetCard budget={usage} />
                        {isGroupAdmin && (
                          <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8"
                              onClick={() => {
                                const budget = currentBudgets.find(
                                  (b) => b.category === usage.category
                                );
                                if (budget) handleEdit(budget.id);
                              }}
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              className="h-8 w-8"
                              onClick={() => {
                                const budget = currentBudgets.find(
                                  (b) => b.category === usage.category
                                );
                                if (budget) {
                                  setDeletingBudgetId(budget.id);
                                  setShowDeleteDialog(true);
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Create Budget Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Create {selectedTab === "personal" ? "Personal" : "Group"} Budget
            </DialogTitle>
            <DialogDescription>
              Set a monthly budget limit for a category
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyLimit">Monthly Limit (CAD)</Label>
              <Input
                id="monthlyLimit"
                type="number"
                step="0.01"
                min="0"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                placeholder="1000.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alertThreshold">Alert Threshold (%)</Label>
              <Input
                id="alertThreshold"
                type="number"
                min="1"
                max="100"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You will be notified when spending reaches this percentage
              </p>
            </div>

            {selectedTab === "personal" ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Rollover Unused Budget</Label>
                    <p className="text-xs text-muted-foreground">
                      Carry over unused budget to next month
                    </p>
                  </div>
                  <Switch checked={rollover} onCheckedChange={setRollover} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive alerts when threshold is reached
                    </p>
                  </div>
                  <Switch
                    checked={notificationsEnabled}
                    onCheckedChange={setNotificationsEnabled}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Alert All Members</Label>
                    <p className="text-xs text-muted-foreground">
                      Notify all group members when threshold is reached
                    </p>
                  </div>
                  <Switch checked={alertMembers} onCheckedChange={setAlertMembers} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Approval When Over</Label>
                    <p className="text-xs text-muted-foreground">
                      Expenses require admin approval if budget is exceeded
                    </p>
                  </div>
                  <Switch
                    checked={requireApproval}
                    onCheckedChange={setRequireApproval}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={managementLoading}>
              {managementLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Budget Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Budget</DialogTitle>
            <DialogDescription>Update budget settings for {category}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-monthlyLimit">Monthly Limit (CAD)</Label>
              <Input
                id="edit-monthlyLimit"
                type="number"
                step="0.01"
                min="0"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-alertThreshold">Alert Threshold (%)</Label>
              <Input
                id="edit-alertThreshold"
                type="number"
                min="1"
                max="100"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
              />
            </div>

            {selectedTab === "personal" ? (
              <>
                <div className="flex items-center justify-between">
                  <Label>Rollover Unused Budget</Label>
                  <Switch checked={rollover} onCheckedChange={setRollover} />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Enable Notifications</Label>
                  <Switch
                    checked={notificationsEnabled}
                    onCheckedChange={setNotificationsEnabled}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label>Alert All Members</Label>
                  <Switch checked={alertMembers} onCheckedChange={setAlertMembers} />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Require Approval When Over</Label>
                  <Switch
                    checked={requireApproval}
                    onCheckedChange={setRequireApproval}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={managementLoading}>
              {managementLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this budget? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {managementLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function BudgetsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-violet-600 mx-auto" />
          <p className="text-muted-foreground">Loading budgets...</p>
        </div>
      </div>
    }>
      <BudgetsPageContent />
    </Suspense>
  );
}

