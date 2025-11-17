"use client";

import { AppLayout } from "@/components/app-layout";
import { useGroups } from "@/hooks/useGroups";
import { useGroupStats } from "@/hooks/useGroupStats";
import { CreateGroupDialog } from "@/components/groups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, DollarSign, Calendar, TrendingUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default function GroupsPage() {
  const { groups, loading, error } = useGroups();
  const groupStats = useGroupStats(); // Real-time stats for all groups

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">Your Groups</h1>
            <p className="text-muted-foreground">
              Manage shared expenses with friends, family, and colleagues
            </p>
          </div>
          <CreateGroupDialog />
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-4 rounded-md">
            {error}
          </div>
        )}

        {/* Groups List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-violet-500" />
            My Groups ({groups.length})
          </h2>

          {groups.length === 0 ? (
            <Card className="glass">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center mb-4 animate-pulse">
                  <Users className="h-10 w-10 text-violet-500" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Groups Yet</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Create your first group to start tracking shared expenses with others.
                </p>
                <CreateGroupDialog />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="group block transition-transform hover:scale-[1.02]"
                >
                  <Card className="glass h-full border-2 hover:border-violet-500/50 transition-all duration-300">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-lg"
                          style={{
                            backgroundColor: group.color || "#8B5CF6",
                          }}
                        >
                          {group.icon || "👥"}
                        </div>
                        <Badge
                          className="capitalize"
                          variant={group.myRole === "owner" ? "default" : "secondary"}
                        >
                          {group.myRole}
                        </Badge>
                      </div>
                      <CardTitle className="flex items-center justify-between group-hover:text-violet-500 transition-colors">
                        {group.name}
                        <ChevronRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </CardTitle>
                      {group.description && (
                        <CardDescription className="line-clamp-2">
                          {group.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <DollarSign className="h-4 w-4" />
                          <span>{groupStats[group.id]?.expenseCount || 0} expenses</span>
                        </div>
                      </div>

                      {groupStats[group.id] && groupStats[group.id].totalAmount > 0 && (
                        <div className="pt-3 border-t border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <TrendingUp className="h-4 w-4" />
                              Total
                            </span>
                            <span className="text-lg font-bold gradient-text">
                              ${groupStats[group.id].totalAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      {group.stats?.lastActivityAt && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 pt-2">
                          <Calendar className="h-3 w-3" />
                          Last activity{" "}
                          {formatDistanceToNow(group.stats.lastActivityAt.toDate(), {
                            addSuffix: true,
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

