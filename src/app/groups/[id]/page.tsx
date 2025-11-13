"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { useGroups } from "@/hooks/useGroups";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useGroupExpenses } from "@/hooks/useGroupExpenses";
import { InviteMemberDialog } from "@/components/groups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const { groups, loading: groupsLoading } = useGroups();
  const { members, myMembership, loading: membersLoading } = useGroupMembers(groupId);
  const { expenses, loading: expensesLoading } = useGroupExpenses(groupId);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const group = groups.find((g) => g.id === groupId);
  const loading = groupsLoading || membersLoading;

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

  const canManageMembers = myMembership?.permissions.canInviteMembers;
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

      alert("You have left the group successfully!");
      router.push("/groups");
    } catch (error) {
      console.error("Error leaving group:", error);
      alert(error instanceof Error ? error.message : "Failed to leave group");
    } finally {
      setLeaving(false);
      setLeaveDialogOpen(false);
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Back Button */}
        <Button variant="ghost" asChild>
          <Link href="/groups">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Groups
          </Link>
        </Button>

        {/* Group Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-2xl flex-shrink-0"
              style={{ backgroundColor: group.color || "#8B5CF6" }}
            >
              {group.icon || "👥"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold gradient-text">{group.name}</h1>
                <Badge className="capitalize">
                  {getRoleIcon(group.myRole)}
                  <span className="ml-1">{group.myRole}</span>
                </Badge>
              </div>
              {group.description && (
                <p className="text-muted-foreground text-lg">{group.description}</p>
              )}
              {group.stats?.lastActivityAt && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Last activity{" "}
                  {formatDistanceToNow(group.stats.lastActivityAt.toDate(), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass border-violet-200/50 dark:border-violet-800/30">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                Total Members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold gradient-text">
                {group.stats?.memberCount || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-fuchsia-200/50 dark:border-fuchsia-800/30">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-fuchsia-500" />
                Total Expenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold gradient-text">
                {group.stats?.expenseCount || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-violet-200/50 dark:border-violet-800/30">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                Total Amount
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold gradient-text">
                ${(group.stats?.totalAmount || 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Members Section */}
        <Card className="glass">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-violet-500" />
                  Members ({members.length})
                </CardTitle>
                <CardDescription>Manage group members and their roles</CardDescription>
              </div>
              {canManageMembers && (
                <InviteMemberDialog groupId={groupId} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No members found
              </p>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-violet-500/50 transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-semibold">
                        {member.userName?.[0] || member.userEmail[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{member.userName || member.userEmail}</p>
                        <p className="text-sm text-muted-foreground">{member.userEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                        {getRoleIcon(member.role)}
                        <span className="ml-1 capitalize">{member.role}</span>
                      </Badge>
                      {member.joinedAt && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          Joined {formatDistanceToNow(member.joinedAt.toDate(), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
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
            <CardDescription>View and manage expenses for this group</CardDescription>
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
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 hover:border-fuchsia-500/50 transition-all hover:shadow-md gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold truncate">{expense.vendor}</p>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {expense.category}
                        </Badge>
                      </div>
                      {expense.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{expense.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {expense.date.toDate().toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right sm:text-right shrink-0">
                      <p className="text-2xl sm:text-xl font-bold gradient-text whitespace-nowrap">
                        ${expense.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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

