"use client";

import { use } from "react";
import { AppLayout } from "@/components/app-layout";
import { useGroups } from "@/hooks/useGroups";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { InviteMemberDialog } from "@/components/groups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Users, 
  Settings, 
  UserPlus, 
  DollarSign, 
  Calendar,
  ArrowLeft,
  TrendingUp,
  Crown,
  Shield,
  Eye,
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
  const { groups, loading: groupsLoading } = useGroups();
  const { members, myMembership, loading: membersLoading } = useGroupMembers(groupId);

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

          <div className="flex gap-2">
            {canManageSettings && (
              <Button variant="outline" asChild>
                <Link href={`/groups/${groupId}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
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

        {/* Expenses Section - TODO: Implement in next phase */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-fuchsia-500" />
              Group Expenses
            </CardTitle>
            <CardDescription>View and manage expenses for this group</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Group expense viewing coming soon...
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

