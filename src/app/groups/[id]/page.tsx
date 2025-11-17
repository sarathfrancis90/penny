"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { useGroups } from "@/hooks/useGroups";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useGroupExpenses } from "@/hooks/useGroupExpenses";
import { useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompactStatCard } from "@/components/mobile-first";
import { ExpenseListView } from "@/components/dashboard/expense-list-view";
import { useBudgetUsage } from "@/hooks/useBudgetUsage";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { getCurrentPeriod } from "@/lib/budgetCalculations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Loader2,
  Users,
  Settings,
  DollarSign,
  Calendar,
  ArrowLeft,
  TrendingUp,
  Crown,
  Shield,
  Eye,
  LogOut,
  MoreVertical,
  PiggyBank,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface GroupDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function GroupDetailPage({ params }: GroupDetailPageProps) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  
  useEffect(() => {
    console.log("🔍 [Group Detail Page] Mounted with groupId:", groupId);
    console.log("🔍 [Group Detail Page] Budget link would be:", `/budgets?tab=group&groupId=${groupId}`);
  }, [groupId]);
  const { members, myMembership, loading: membersLoading } = useGroupMembers(groupId);
  const { expenses, loading: expensesLoading } = useGroupExpenses(groupId);
  const { deleteExpense, updateExpense } = useExpenses(user?.uid);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  
  const currentPeriod = getCurrentPeriod();
  
  // Fetch budget usage for this group
  const { usage: budgetUsage, loading: budgetLoading } = useBudgetUsage(
    user?.uid,
    "group",
    groupId,
    currentPeriod.month,
    currentPeriod.year
  );

  const group = groups.find((g) => g.id === groupId);
  const loading = groupsLoading || membersLoading;

  // Calculate real-time stats from actual data
  const totalMembers = members.length;
  const totalExpenses = expenses.length;
  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      </AppLayout>
    );
  }

  if (!group) {
    return (
      <AppLayout>
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Card className="glass">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <h2 className="text-2xl font-bold mb-2">Group Not Found</h2>
              <p className="text-muted-foreground mb-6">
                This group doesn&apos;t exist or you don&apos;t have access to it.
              </p>
              <Button asChild>
                <Link href="/groups">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Groups
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4" />;
      case "admin":
        return <Shield className="h-4 w-4" />;
      case "member":
        return <Users className="h-4 w-4" />;
      case "viewer":
        return <Eye className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const canManageSettings = myMembership?.permissions.canManageSettings;
  const isOwner = myMembership?.role === "owner";

  const handleLeaveGroup = async () => {
    setLeaving(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/leave`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to leave group");
      }

      toast.success("You have left the group successfully!");
      
      // Small delay to show the toast before navigating
      setTimeout(() => {
        router.push("/groups");
      }, 1000);
    } catch (error) {
      console.error("Error leaving group:", error);
      toast.error(error instanceof Error ? error.message : "Failed to leave group");
    } finally {
      setLeaving(false);
      setLeaveDialogOpen(false);
    }
  };

  return (
    <AppLayout>
      {/* Mobile Header - Sticky */}
      <div className="md:hidden sticky top-[57px] z-40 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between p-4 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link href="/groups">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl shrink-0"
              style={{ backgroundColor: group.color || "#8B5CF6" }}
            >
              {group.icon || "👥"}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{group.name}</h1>
              {group.stats?.lastActivityAt && (
                <p className="text-xs text-muted-foreground truncate">
                  Active {formatDistanceToNow(group.stats.lastActivityAt.toDate(), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
          
          {/* Mobile Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {(isOwner || myMembership?.role === "admin") && (
                <DropdownMenuItem asChild>
                  <Link href={`/groups/${groupId}/members`}>
                    <Users className="mr-2 h-4 w-4" />
                    Manage Members
                  </Link>
                </DropdownMenuItem>
              )}
              {canManageSettings && (
                <DropdownMenuItem asChild>
                  <Link href={`/groups/${groupId}/settings`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
              )}
              {!isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setLeaveDialogOpen(true)}
                    className="text-red-500 focus:text-red-500"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Leave Group
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Mobile Role Badge */}
        <div className="px-4 pb-3">
          <Badge className="capitalize">
            {getRoleIcon(group.myRole)}
            <span className="ml-1">{group.myRole}</span>
          </Badge>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 pt-[140px] pb-4 md:pt-0 md:py-8 space-y-6 md:space-y-8">
        {/* Desktop Header */}
        <div className="hidden md:block">
          <Button variant="ghost" className="mb-6" asChild>
            <Link href="/groups">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Groups
            </Link>
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex gap-6">
              <div
                className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl shadow-2xl animate-in fade-in-50 zoom-in-95 duration-500"
                style={{ backgroundColor: group.color || "#8B5CF6" }}
              >
                {group.icon || "👥"}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-4xl font-bold gradient-text">{group.name}</h1>
                  <Badge className="capitalize">
                    {getRoleIcon(group.myRole)}
                    <span className="ml-1">{group.myRole}</span>
                  </Badge>
                </div>
                {group.description && (
                  <p className="text-muted-foreground text-lg mb-2">{group.description}</p>
                )}
                {group.stats?.lastActivityAt && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Last activity{" "}
                    {formatDistanceToNow(group.stats.lastActivityAt.toDate(), {
                      addSuffix: true,
                    })}
                  </p>
                )}
              </div>
            </div>
            
            {/* Desktop Actions */}
            <div className="flex gap-3">
              {(isOwner || myMembership?.role === "admin") && (
                <Button variant="outline" asChild>
                  <Link href={`/groups/${groupId}/members`}>
                    <Users className="mr-2 h-4 w-4" />
                    Manage Members
                  </Link>
                </Button>
              )}
              {canManageSettings && (
                <Button variant="outline" asChild>
                  <Link href={`/groups/${groupId}/settings`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </Button>
              )}
              {!isOwner && (
                <Button
                  variant="outline"
                  onClick={() => setLeaveDialogOpen(true)}
                  className="border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Leave Group
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats - Mobile: Compact, Desktop: Cards */}
        <div className="space-y-3 md:grid md:grid-cols-3 md:gap-6 md:space-y-0">
          <CompactStatCard
            icon={<Users className="h-5 w-5 md:h-6 md:w-6 text-violet-500" />}
            label="Total Members"
            value={totalMembers}
          />
          <CompactStatCard
            icon={<DollarSign className="h-5 w-5 md:h-6 md:w-6 text-fuchsia-500" />}
            label="Total Expenses"
            value={totalExpenses}
          />
          <CompactStatCard
            icon={<TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-violet-500" />}
            label="Total Amount"
            value={`$${totalAmount.toFixed(2)}`}
          />
        </div>

        {/* Group Budgets Section */}
        <Card className="glass border-2 border-violet-200/50 dark:border-violet-800/30">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-5 w-5 text-violet-500" />
                <CardTitle>Group Budgets</CardTitle>
              </div>
              {(isOwner || myMembership?.role === "admin") && (
                <Button 
                  size="sm" 
                  onClick={() => {
                    const url = `/budgets?tab=group&groupId=${groupId}`;
                    console.log("🔗 [Group Detail Page] Manage Budgets - Navigating to:", url);
                    router.push(url);
                  }}
                >
                  Manage Budgets
                </Button>
              )}
            </div>
            <CardDescription>
              {(isOwner || myMembership?.role === "admin")
                ? "Set monthly spending limits for each expense category"
                : "View monthly spending limits set by group admins"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {budgetLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              </div>
            ) : budgetUsage.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center mx-auto mb-4">
                  <PiggyBank className="h-8 w-8 text-violet-500" />
                </div>
                <p className="text-muted-foreground mb-2">No budgets set</p>
                {(isOwner || myMembership?.role === "admin") ? (
                  <p className="text-sm text-muted-foreground mb-4">
                    Set monthly budgets to track group spending
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Group admins haven&apos;t set any budgets yet
                  </p>
                )}
                {(isOwner || myMembership?.role === "admin") && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      const url = `/budgets?tab=group&groupId=${groupId}`;
                      console.log("🔗 [Group Detail Page] Navigating to:", url);
                      console.log("🔗 [Group Detail Page] GroupId:", groupId);
                      router.push(url);
                    }}
                  >
                    Create First Budget
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {budgetUsage.map((budget) => (
                  <BudgetCard
                    key={budget.category}
                    budget={budget}
                    onClick={() => router.push(`/budgets?tab=group&groupId=${groupId}`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses Section */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-fuchsia-500" />
              Group Expenses ({expenses.length})
            </CardTitle>
            <CardDescription>View, edit, and manage expenses for this group. Select multiple expenses to delete them in bulk.</CardDescription>
          </CardHeader>
          <CardContent>
            {expensesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-fuchsia-100 dark:bg-fuchsia-950 flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="h-8 w-8 text-fuchsia-500" />
                </div>
                <p className="text-muted-foreground mb-2">No expenses yet</p>
                <p className="text-sm text-muted-foreground">
                  Add expenses from the chat page and assign them to this group
                </p>
              </div>
            ) : (
              <ExpenseListView
                expenses={expenses}
                onDelete={deleteExpense}
                onUpdate={updateExpense}
              />
            )}
          </CardContent>
        </Card>

        {/* Leave Group Confirmation Dialog */}
        <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave Group?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to leave <strong>{group.name}</strong>?
                <br />
                <br />
                You won&apos;t be able to see group expenses or interact with members unless invited back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLeaveGroup}
                disabled={leaving}
                className="bg-red-500 hover:bg-red-600"
              >
                {leaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  "Leave Group"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

