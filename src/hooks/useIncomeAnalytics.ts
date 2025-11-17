import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MonthlyIncomeRecord } from '@/lib/types/income';

interface IncomeAnalytics {
  records: MonthlyIncomeRecord[];
  ytd: {
    income: number;
    expenses: number;
    savings: number;
  };
  averages: {
    monthlyIncome: number;
    monthlySavings: number;
    savingsRate: number;
  };
  period: {
    year: number;
    months: number;
  };
}

export function useIncomeAnalytics(userId: string | undefined, year?: number, months: number = 12) {
  const [analytics, setAnalytics] = useState<IncomeAnalytics | null>(null);
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

        // Fetch monthly income records
        const recordsRef = collection(db, 'monthly_income_records');
        const q = query(
          recordsRef,
          where('userId', '==', userId),
          where('period.year', '==', targetYear),
          orderBy('period.month', 'asc'),
          firestoreLimit(months)
        );

        const querySnapshot = await getDocs(q);
        const records: MonthlyIncomeRecord[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as MonthlyIncomeRecord[];

        // Calculate YTD totals
        const ytdIncome = records.reduce((sum, record) => sum + (record.totalIncome || 0), 0);
        const ytdExpenses = records.reduce((sum, record) => sum + (record.totalExpenseBudgeted || 0), 0);
        const ytdSavings = records.reduce((sum, record) => sum + (record.totalSavingsAllocated || 0), 0);

        // Calculate averages
        const avgMonthlyIncome = records.length > 0 ? ytdIncome / records.length : 0;
        const avgMonthlySavings = records.length > 0 ? ytdSavings / records.length : 0;
        const avgSavingsRate = ytdIncome > 0 ? (ytdSavings / ytdIncome) * 100 : 0;

        setAnalytics({
          records,
          ytd: {
            income: ytdIncome,
            expenses: ytdExpenses,
            savings: ytdSavings,
          },
          averages: {
            monthlyIncome: avgMonthlyIncome,
            monthlySavings: avgMonthlySavings,
            savingsRate: avgSavingsRate,
          },
          period: {
            year: targetYear,
            months: records.length,
          },
        });
      } catch (err) {
        console.error('Error fetching income analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [userId, year, months]);

  return { analytics, loading, error };
}

