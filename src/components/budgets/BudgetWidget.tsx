"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BudgetCard } from "./BudgetCard";
import { useBudgetUsage } from "@/hooks/useBudgetUsage";
import { useGroups } from "@/hooks/useGroups";
import { getCurrentPeriod } from "@/lib/budgetCalculations";
import {
  PlusCircle,
  Loader2,
  TrendingUp,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface BudgetWidgetProps {
  userId: string;
  className?: string;
}

/**
 * Dashboard widget for displaying budget overview
 */
export function BudgetWidget({ userId, className }: BudgetWidgetProps) {
  const [selectedTab, setSelectedTab] = useState<"personal" | "group">("personal");
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);
  
  const currentPeriod = getCurrentPeriod();
  const { groups } = useGroups();

  // Fetch personal budgets usage
  const {
    usage: personalUsage,
    loading: personalLoading,
    error: personalError,
  } = useBudgetUsage(userId, "personal", undefined, currentPeriod.month, currentPeriod.year);

  // Fetch group budgets usage (for first group by default)
  const firstGroupId = groups[0]?.id;
  const displayGroupId = selectedGroupId || firstGroupId;

  const {
    usage: groupUsage,
    loading: groupLoading,
    error: groupError,
  } = useBudgetUsage(userId, "group", displayGroupId, currentPeriod.month, currentPeriod.year);

  // Calculate summary stats
  const personalSummary = useMemo(() => {
    if (!personalUsage || personalUsage.length === 0) {
      return { totalBudget: 0, totalSpent: 0, atRisk: 0 };
    }

    const totalBudget = personalUsage.reduce((sum, b) => sum + b.budgetLimit, 0);
    const totalSpent = personalUsage.reduce((sum, b) => sum + b.totalSpent, 0);
    const atRisk = personalUsage.filter(
      (b) => b.status === "warning" || b.status === "critical" || b.status === "over"
    ).length;

    return { totalBudget, totalSpent, atRisk };
  }, [personalUsage]);

  const groupSummary = useMemo(() => {
    if (!groupUsage || groupUsage.length === 0) {
      return { totalBudget: 0, totalSpent: 0, atRisk: 0 };
    }

    const totalBudget = groupUsage.reduce((sum, b) => sum + b.budgetLimit, 0);
    const totalSpent = groupUsage.reduce((sum, b) => sum + b.totalSpent, 0);
    const atRisk = groupUsage.filter(
      (b) => b.status === "warning" || b.status === "critical" || b.status === "over"
    ).length;

    return { totalBudget, totalSpent, atRisk };
  }, [groupUsage]);

  const currentSummary = selectedTab === "personal" ? personalSummary : groupSummary;
  const currentUsage = selectedTab === "personal" ? personalUsage : groupUsage;
  const isLoading = selectedTab === "personal" ? personalLoading : groupLoading;
  const error = selectedTab === "personal" ? personalError : groupError;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-xl font-bold">Budget Overview</CardTitle>
          <Link href="/budgets">
            <Button size="sm" className="w-full sm:w-auto">
              <PlusCircle size={16} className="mr-1" />
              Manage Budgets
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 rounded-lg border border-violet-200 dark:border-violet-800">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <DollarSign size={12} />
              <span>Budget</span>
            </div>
            <p className="text-sm font-bold">
              ${currentSummary.totalBudget.toFixed(0)}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp size={12} />
              <span>Spent</span>
            </div>
            <p className="text-sm font-bold">
              ${currentSummary.totalSpent.toFixed(0)}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <AlertCircle size={12} />
              <span>At Risk</span>
            </div>
            <p className={cn(
              "text-sm font-bold",
              currentSummary.atRisk > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
            )}>
              {currentSummary.atRisk}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as "personal" | "group")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="group" disabled={groups.length === 0}>
              Group {groups.length > 0 && `(${groups.length})`}
            </TabsTrigger>
          </TabsList>

          {/* Personal Budgets */}
          <TabsContent value="personal" className="space-y-3 mt-4">
            {personalLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              </div>
            )}

            {personalError && (
              <div className="text-center py-8 text-sm text-red-600 dark:text-red-400">
                Error loading budgets: {personalError}
              </div>
            )}

            {!personalLoading && !personalError && personalUsage.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-3">
                  No personal budgets set for this month
                </p>
                <Link href="/budgets">
                  <Button size="sm" variant="outline">
                    Create Your First Budget
                  </Button>
                </Link>
              </div>
            )}

            {!personalLoading && !personalError && personalUsage.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {personalUsage.map((budget) => (
                  <BudgetCard
                    key={budget.category}
                    budget={budget}
                    onClick={() => {
                      // Navigate to budget management page
                      window.location.href = "/budgets";
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Group Budgets */}
          <TabsContent value="group" className="space-y-3 mt-4">
            {/* Group Selector (if multiple groups) */}
            {groups.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {groups.map((group) => (
                  <Button
                    key={group.id}
                    size="sm"
                    variant={displayGroupId === group.id ? "default" : "outline"}
                    onClick={() => setSelectedGroupId(group.id)}
                    className="flex-shrink-0"
                  >
                    {group.emoji} {group.name}
                  </Button>
                ))}
              </div>
            )}

            {groupLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              </div>
            )}

            {groupError && (
              <div className="text-center py-8 text-sm text-red-600 dark:text-red-400">
                Error loading group budgets: {groupError}
              </div>
            )}

            {!groupLoading && !groupError && groupUsage.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-3">
                  No group budgets set for this month
                </p>
                <Link href="/budgets">
                  <Button size="sm" variant="outline">
                    Manage Group Budgets
                  </Button>
                </Link>
              </div>
            )}

            {!groupLoading && !groupError && groupUsage.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupUsage.map((budget) => (
                  <BudgetCard
                    key={budget.category}
                    budget={budget}
                    onClick={() => {
                      // Navigate to budget management page
                      window.location.href = "/budgets";
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

