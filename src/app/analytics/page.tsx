'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIncomeAnalytics } from '@/hooks/useIncomeAnalytics';
import { useSavingsAnalytics } from '@/hooks/useSavingsAnalytics';
import { AppLayout } from '@/components/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatPercentage } from '@/lib/utils/incomeCalculations';
import { SAVINGS_CATEGORY_LABELS } from '@/lib/types/savings';
import { TrendingUp, TrendingDown, DollarSign, Target, Calendar, Award } from 'lucide-react';

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { analytics: incomeAnalytics, loading: incomeLoading } = useIncomeAnalytics(
    user?.uid,
    selectedYear
  );
  const { analytics: savingsAnalytics, loading: savingsLoading } = useSavingsAnalytics(
    user?.uid,
    selectedYear
  );

  const loading = authLoading || incomeLoading || savingsLoading;

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
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
            <p className="text-lg">Please sign in to view your analytics.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header with Year Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Track your income, savings, and spending patterns over time
            </p>
          </div>
          <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading analytics...</p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="savings">Savings</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* YTD Summary Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">YTD Income</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(incomeAnalytics?.ytd.income || 0, 'USD')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {incomeAnalytics?.period.months || 0} month
                      {(incomeAnalytics?.period.months || 0) !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">YTD Expenses</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(incomeAnalytics?.ytd.expenses || 0, 'USD')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {incomeAnalytics?.ytd.income
                        ? formatPercentage((incomeAnalytics.ytd.expenses / incomeAnalytics.ytd.income) * 100)
                        : '0%'}{' '}
                      of income
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">YTD Savings</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(incomeAnalytics?.ytd.savings || 0, 'USD')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {incomeAnalytics?.ytd.income
                        ? formatPercentage((incomeAnalytics.ytd.savings / incomeAnalytics.ytd.income) * 100)
                        : '0%'}{' '}
                      of income
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Savings Rate</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatPercentage(incomeAnalytics?.averages.savingsRate || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Average for {selectedYear}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Trend</CardTitle>
                  <CardDescription>Income, expenses, and savings by month</CardDescription>
                </CardHeader>
                <CardContent>
                  {incomeAnalytics && incomeAnalytics.records.length > 0 ? (
                    <div className="space-y-4">
                      {incomeAnalytics.records.map((record) => {
                        const savingsRate =
                          record.totalIncome > 0
                            ? (record.totalSavingsAllocated / record.totalIncome) * 100
                            : 0;

                        return (
                          <div key={record.id} className="flex items-center gap-4">
                            <div className="w-24 text-sm font-medium">
                              {new Date(2024, record.period.month - 1).toLocaleDateString('en-US', {
                                month: 'short',
                              })}
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Income</span>
                                <span className="font-semibold">
                                  {formatCurrency(record.totalIncome, 'USD')}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Expenses</span>
                                <span>{formatCurrency(record.totalExpenseBudgeted, 'USD')}</span>
                              </div>
                              <div className="flex justify-between text-sm text-green-600">
                                <span>Savings</span>
                                <span>
                                  {formatCurrency(record.totalSavingsAllocated, 'USD')} (
                                  {formatPercentage(savingsRate)})
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No data available for {selectedYear}</p>
                      <p className="text-sm mt-2">
                        Complete your monthly setup wizard to start tracking analytics
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Income Tab */}
            <TabsContent value="income" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Monthly Income</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(incomeAnalytics?.averages.monthlyIncome || 0, 'USD')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Total YTD</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(incomeAnalytics?.ytd.income || 0, 'USD')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Months Recorded</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{incomeAnalytics?.period.months || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Income by Category</CardTitle>
                  <CardDescription>Breakdown of income sources</CardDescription>
                </CardHeader>
                <CardContent>
                  {incomeAnalytics && incomeAnalytics.records.length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(
                        incomeAnalytics.records[0]?.incomeByCategory || {}
                      ).map(([category, amount]) => (
                        <div key={category} className="flex justify-between items-center">
                          <span className="capitalize">{category.replace('_', ' ')}</span>
                          <span className="font-semibold">{formatCurrency(amount as number, 'USD')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No income data available</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Savings Tab */}
            <TabsContent value="savings" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Monthly Savings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(savingsAnalytics?.averages.monthlySaved || 0, 'USD')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Total YTD Saved</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(savingsAnalytics?.ytd.totalSaved || 0, 'USD')}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Goal Completion Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatPercentage(savingsAnalytics?.averages.goalCompletionRate || 0)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Savings by Category</CardTitle>
                  <CardDescription>YTD savings breakdown by goal category</CardDescription>
                </CardHeader>
                <CardContent>
                  {savingsAnalytics && Object.keys(savingsAnalytics.ytd.byCategory).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(savingsAnalytics.ytd.byCategory)
                        .filter(([, amount]) => amount > 0)
                        .sort(([, a], [, b]) => b - a)
                        .map(([category, amount]) => (
                          <div key={category} className="flex justify-between items-center">
                            <span>{SAVINGS_CATEGORY_LABELS[category as keyof typeof SAVINGS_CATEGORY_LABELS]}</span>
                            <span className="font-semibold">{formatCurrency(amount, 'USD')}</span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No savings data available</p>
                      <p className="text-sm mt-2">Start contributing to your savings goals to see analytics</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}

