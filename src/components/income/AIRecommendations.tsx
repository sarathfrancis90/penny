'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatPercentage } from '@/lib/utils/incomeCalculations';
import { Sparkles, TrendingUp, Target, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';

interface AIRecommendationsProps {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  savingsRate: number;
  unallocated: number;
  activeGoalsCount: number;
}

interface Recommendation {
  type: 'success' | 'warning' | 'info' | 'improvement';
  category: string;
  title: string;
  description: string;
  action?: string;
  priority: 'low' | 'medium' | 'high';
}

export function AIRecommendations({
  totalIncome,
  totalExpenses,
  totalSavings,
  savingsRate,
  unallocated,
  activeGoalsCount,
}: AIRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState(0);

  useEffect(() => {
    // Generate recommendations based on financial data
    const generateRecommendations = () => {
      const recs: Recommendation[] = [];
      let score = 50; // Base score

      // Savings Rate Analysis
      if (savingsRate >= 30) {
        recs.push({
          type: 'success',
          category: 'Savings',
          title: 'Excellent Savings Rate!',
          description: `You're saving ${formatPercentage(savingsRate)} of your income. This is well above the recommended 20% and puts you on a strong path to financial independence.`,
          priority: 'low',
        });
        score += 20;
      } else if (savingsRate >= 20) {
        recs.push({
          type: 'success',
          category: 'Savings',
          title: 'Great Savings Discipline',
          description: `Your ${formatPercentage(savingsRate)} savings rate meets the recommended 20% guideline. Keep up the excellent work!`,
          priority: 'low',
        });
        score += 15;
      } else if (savingsRate >= 10) {
        recs.push({
          type: 'warning',
          category: 'Savings',
          title: 'Consider Increasing Savings',
          description: `Your current savings rate is ${formatPercentage(savingsRate)}. Financial experts recommend saving at least 20% of your income. Try to increase your savings by ${formatPercentage(20 - savingsRate)}.`,
          action: 'Review your expenses and identify areas to cut back',
          priority: 'medium',
        });
        score += 5;
      } else {
        recs.push({
          type: 'warning',
          category: 'Savings',
          title: 'Low Savings Rate - Action Needed',
          description: `At ${formatPercentage(savingsRate)}, your savings rate is below healthy levels. This could impact your financial security and long-term goals.`,
          action: 'Aim to save at least ${formatCurrency((totalIncome * 0.2) - totalSavings, 'USD')} more per month',
          priority: 'high',
        });
        score -= 10;
      }

      // Expense Ratio Analysis
      const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
      if (expenseRatio > 80) {
        recs.push({
          type: 'warning',
          category: 'Expenses',
          title: 'High Expense Ratio',
          description: `You're spending ${formatPercentage(expenseRatio)} of your income on expenses. This leaves little room for savings and emergencies.`,
          action: 'Review your largest expense categories and look for opportunities to reduce spending',
          priority: 'high',
        });
        score -= 15;
      } else if (expenseRatio <= 60) {
        recs.push({
          type: 'success',
          category: 'Expenses',
          title: 'Controlled Spending',
          description: `Your expenses are ${formatPercentage(expenseRatio)} of income, leaving good room for savings and investments.`,
          priority: 'low',
        });
        score += 10;
      }

      // Unallocated Income Analysis
      if (unallocated > 0) {
        const unallocatedPercentage = (unallocated / totalIncome) * 100;
        if (unallocatedPercentage > 10) {
          recs.push({
            type: 'info',
            category: 'Budget',
            title: 'Unallocated Income Detected',
            description: `You have ${formatCurrency(unallocated, 'USD')} (${formatPercentage(unallocatedPercentage)}) unallocated. This money isn't working for you.`,
            action: 'Consider allocating to savings goals or emergency fund',
            priority: 'medium',
          });
        }
      } else if (unallocated < 0) {
        recs.push({
          type: 'warning',
          category: 'Budget',
          title: 'Over-Allocated Budget',
          description: `Your budgets exceed your income by ${formatCurrency(Math.abs(unallocated), 'USD')}. This is unsustainable.`,
          action: 'Reduce your expense budgets or savings allocations to match your income',
          priority: 'high',
        });
        score -= 20;
      }

      // Savings Goals Analysis
      if (activeGoalsCount === 0) {
        recs.push({
          type: 'info',
          category: 'Goals',
          title: 'No Active Savings Goals',
          description: 'Setting specific savings goals can help you stay motivated and focused on what matters most.',
          action: 'Create savings goals for things like emergency fund, vacation, or major purchases',
          priority: 'medium',
        });
        score -= 5;
      } else if (activeGoalsCount >= 3) {
        recs.push({
          type: 'success',
          category: 'Goals',
          title: 'Goal-Oriented Approach',
          description: `You have ${activeGoalsCount} active savings goals. Multiple goals help diversify your financial priorities.`,
          priority: 'low',
        });
        score += 10;
      }

      // 50/30/20 Rule Recommendation
      const needsExpenses = totalExpenses * 0.6; // Estimate
      const wantsExpenses = totalExpenses * 0.4; // Estimate
      if (expenseRatio <= 50 && savingsRate >= 20) {
        recs.push({
          type: 'success',
          category: 'Financial Health',
          title: 'Following the 50/30/20 Rule',
          description: 'Your budget aligns well with the 50/30/20 rule (50% needs, 30% wants, 20% savings), a gold standard for balanced finances.',
          priority: 'low',
        });
        score += 15;
      }

      // Emergency Fund Recommendation
      if (totalSavings < totalExpenses * 3) {
        recs.push({
          type: 'improvement',
          category: 'Emergency Fund',
          title: 'Build Your Emergency Fund',
          description: `Financial experts recommend having 3-6 months of expenses saved. You currently have ${formatCurrency(totalSavings, 'USD')}. Aim for at least ${formatCurrency(totalExpenses * 3, 'USD')}.`,
          action: 'Create a dedicated emergency fund goal and contribute consistently',
          priority: 'high',
        });
      }

      // Cap score between 0 and 100
      setHealthScore(Math.max(0, Math.min(100, score)));
      setRecommendations(recs.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }));
      setLoading(false);
    };

    generateRecommendations();
  }, [totalIncome, totalExpenses, totalSavings, savingsRate, unallocated, activeGoalsCount]);

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getHealthScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const getIcon = (type: Recommendation['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'info':
        return <Lightbulb className="h-5 w-5 text-blue-600" />;
      case 'improvement':
        return <TrendingUp className="h-5 w-5 text-purple-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Financial Health Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI Financial Health Score</CardTitle>
          </div>
          <CardDescription>
            Based on your income, expenses, and savings patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`text-5xl font-bold ${getHealthScoreColor(healthScore)}`}>
                  {healthScore}
                </div>
                <div>
                  <div className="text-2xl font-semibold">{getHealthScoreLabel(healthScore)}</div>
                  <div className="text-sm text-muted-foreground">
                    Out of 100
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {healthScore >= 80 && 'Your finances are in great shape! Keep up the excellent habits.'}
                {healthScore >= 60 && healthScore < 80 && 'You're doing well, but there's room for improvement.'}
                {healthScore >= 40 && healthScore < 60 && 'Your finances need attention. Follow the recommendations below.'}
                {healthScore < 40 && 'Your finances need significant improvements. Take action on high-priority items.'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Personalized Recommendations</CardTitle>
              <CardDescription>
                {recommendations.length} insights to improve your financial health
              </CardDescription>
            </div>
            <Target className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <>
              {recommendations.map((rec, index) => (
                <Alert key={index} className="relative">
                  <div className="flex gap-3">
                    {getIcon(rec.type)}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold">{rec.title}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">
                            {rec.category}
                          </div>
                        </div>
                        {rec.priority === 'high' && (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded">
                            High Priority
                          </span>
                        )}
                      </div>
                      <AlertDescription>{rec.description}</AlertDescription>
                      {rec.action && (
                        <div className="text-sm font-medium text-primary">
                          💡 Action: {rec.action}
                        </div>
                      )}
                    </div>
                  </div>
                </Alert>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

