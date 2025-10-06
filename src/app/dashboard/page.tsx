"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useExpenses } from "@/hooks/useExpenses";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Tag } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ExpenseSummary } from "@/lib/types";

// Color palette for the chart
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#a855f7", // purple
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { expenses, loading, error } = useExpenses(user?.uid);

  // Process expenses to calculate category summaries
  const categorySummaries = useMemo<ExpenseSummary[]>(() => {
    if (!expenses.length) return [];

    // Group by category and calculate totals
    const categoryMap = new Map<string, { total: number; count: number }>();

    expenses.forEach((expense) => {
      const existing = categoryMap.get(expense.category) || {
        total: 0,
        count: 0,
      };
      categoryMap.set(expense.category, {
        total: existing.total + expense.amount,
        count: existing.count + 1,
      });
    });

    // Calculate grand total
    const grandTotal = Array.from(categoryMap.values()).reduce(
      (sum, { total }) => sum + total,
      0
    );

    // Convert to array and add percentages
    const summaries = Array.from(categoryMap.entries())
      .map(([category, { total, count }]) => ({
        category,
        total,
        count,
        percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total); // Sort by total descending

    return summaries;
  }, [expenses]);

  // Calculate overall statistics
  const totalExpenses = useMemo(
    () => categorySummaries.reduce((sum, cat) => sum + cat.total, 0),
    [categorySummaries]
  );

  const totalCount = useMemo(
    () => categorySummaries.reduce((sum, cat) => sum + cat.count, 0),
    [categorySummaries]
  );

  const topCategory = useMemo(
    () => (categorySummaries.length > 0 ? categorySummaries[0] : null),
    [categorySummaries]
  );

  // Prepare data for the chart (top 10 categories)
  const chartData = useMemo(
    () =>
      categorySummaries.slice(0, 10).map((summary) => ({
        category: summary.category.length > 20 
          ? summary.category.substring(0, 20) + "..." 
          : summary.category,
        amount: summary.total,
      })),
    [categorySummaries]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your expenses...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>
              Failed to load your expense data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">{error}</p>
            <Button asChild>
              <Link href="/">Go Back</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 overflow-auto">
        <div className="container mx-auto p-4 md:p-8 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight">
              Your Expense Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Overview of your business expenses
            </p>
          </div>

        {expenses.length === 0 ? (
          // Empty state
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Tag className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-2xl font-semibold mb-2">No expenses yet</h2>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Start tracking your business expenses by adding them through the
                chat interface.
              </p>
              <Button asChild>
                <Link href="/">Add Your First Expense</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Expenses
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    ${totalExpenses.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    CAD across all categories
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Transactions
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    expense entries
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Top Category
                  </CardTitle>
                  <Tag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold truncate">
                    {topCategory?.category || "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${topCategory?.total.toFixed(2) || "0.00"} (
                    {topCategory?.percentage.toFixed(1) || "0"}%)
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Bar Chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
                <CardDescription>
                  Top {chartData.length} categories by total amount
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="category"
                      angle={-45}
                      textAnchor="end"
                      height={120}
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        `$${value.toFixed(2)}`,
                        "Amount",
                      ]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Summary Table */}
            <Card>
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
                <CardDescription>
                  Detailed view of all expense categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableCaption>
                    Your expense summary for all categories
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Total (CAD)</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categorySummaries.map((summary) => (
                      <TableRow key={summary.category}>
                        <TableCell className="font-medium">
                          {summary.category}
                        </TableCell>
                        <TableCell className="text-right">
                          {summary.count}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${summary.total.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {summary.percentage.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{totalCount}</TableCell>
                      <TableCell className="text-right">
                        ${totalExpenses.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">100.0%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
