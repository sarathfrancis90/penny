import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MonthlySavingsSummary, SavingsCategory } from '@/lib/types/savings';

interface SavingsAnalytics {
  summaries: MonthlySavingsSummary[];
  ytd: {
    totalSaved: number;
    totalAllocated: number;
    goalsMetCount: number;
    totalGoals: number;
    byCategory: Record<SavingsCategory, number>;
  };
  averages: {
    monthlySaved: number;
    monthlyAllocated: number;
    goalCompletionRate: number;
  };
  period: {
    year: number;
    months: number;
  };
}

export function useSavingsAnalytics(userId: string | undefined, year?: number, months: number = 12) {
  const [analytics, setAnalytics] = useState<SavingsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        const targetYear = year || new Date().getFullYear();

        // Fetch monthly savings summaries
        const summariesRef = collection(db, 'monthly_savings_summary');
        const q = query(
          summariesRef,
          where('userId', '==', userId),
          where('period.year', '==', targetYear),
          orderBy('period.month', 'asc'),
          firestoreLimit(months)
        );

        const querySnapshot = await getDocs(q);
        const summaries: MonthlySavingsSummary[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as MonthlySavingsSummary[];

        // Calculate YTD totals
        const ytdTotalSaved = summaries.reduce(
          (sum, summary) => sum + (summary.totalSavingsContributed || 0),
          0
        );
        const ytdTotalAllocated = summaries.reduce(
          (sum, summary) => sum + (summary.totalSavingsAllocated || 0),
          0
        );
        const goalsMetCount = summaries.filter((s) => s.savingsGoalsMet).length;

        // Aggregate by category
        const byCategory: Partial<Record<SavingsCategory, number>> = {};
        summaries.forEach((summary) => {
          if (summary.ytdByCategory) {
            Object.entries(summary.ytdByCategory).forEach(([category, amount]) => {
              const cat = category as SavingsCategory;
              byCategory[cat] = (byCategory[cat] || 0) + amount;
            });
          }
        });

        // Calculate averages
        const avgMonthlySaved = summaries.length > 0 ? ytdTotalSaved / summaries.length : 0;
        const avgMonthlyAllocated = summaries.length > 0 ? ytdTotalAllocated / summaries.length : 0;
        const goalCompletionRate = summaries.length > 0 ? (goalsMetCount / summaries.length) * 100 : 0;

        setAnalytics({
          summaries,
          ytd: {
            totalSaved: ytdTotalSaved,
            totalAllocated: ytdTotalAllocated,
            goalsMetCount,
            totalGoals: summaries.length,
            byCategory: byCategory as Record<SavingsCategory, number>,
          },
          averages: {
            monthlySaved: avgMonthlySaved,
            monthlyAllocated: avgMonthlyAllocated,
            goalCompletionRate,
          },
          period: {
            year: targetYear,
            months: summaries.length,
          },
        });
      } catch (err) {
        console.error('Error fetching savings analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [userId, year, months]);

  return { analytics, loading, error };
}

