import { useState, useEffect, useCallback } from 'react';
import { PersonalIncomeSource } from '@/lib/types/income';
import { calculateTotalMonthlyIncome } from '@/lib/utils/incomeCalculations';

/**
 * Hook to manage personal income sources
 */
export function useIncome() {
  const [incomeSources, setIncomeSources] = useState<PersonalIncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all income sources
  const fetchIncomeSources = useCallback(async (includeInactive: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (includeInactive) {
        params.append('includeInactive', 'true');
      }

      const response = await fetch(`/api/income?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch income sources');
      }

      const data = await response.json();
      setIncomeSources(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching income sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new income source
  const createIncome = useCallback(async (incomeData: any) => {
    try {
      setError(null);

      const response = await fetch('/api/income', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(incomeData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create income source');
      }

      const data = await response.json();
      
      // Refresh the list
      await fetchIncomeSources();
      
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error creating income source:', err);
      throw err;
    }
  }, [fetchIncomeSources]);

  // Update an income source
  const updateIncome = useCallback(async (incomeId: string, updates: any) => {
    try {
      setError(null);

      const response = await fetch(`/api/income/${incomeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update income source');
      }

      const data = await response.json();
      
      // Refresh the list
      await fetchIncomeSources();
      
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error updating income source:', err);
      throw err;
    }
  }, [fetchIncomeSources]);

  // Delete an income source
  const deleteIncome = useCallback(async (incomeId: string) => {
    try {
      setError(null);

      const response = await fetch(`/api/income/${incomeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete income source');
      }

      // Refresh the list
      await fetchIncomeSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error deleting income source:', err);
      throw err;
    }
  }, [fetchIncomeSources]);

  // Calculate total monthly income
  const totalMonthlyIncome = calculateTotalMonthlyIncome(incomeSources);

  // Get active income sources only
  const activeIncomeSources = incomeSources.filter((source) => source.isActive);

  // Initial fetch
  useEffect(() => {
    fetchIncomeSources();
  }, [fetchIncomeSources]);

  return {
    incomeSources,
    activeIncomeSources,
    totalMonthlyIncome,
    loading,
    error,
    fetchIncomeSources,
    createIncome,
    updateIncome,
    deleteIncome,
  };
}

/**
 * Hook to get a specific income source
 */
export function useIncomeSource(incomeId: string | null) {
  const [incomeSource, setIncomeSource] = useState<PersonalIncomeSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!incomeId) {
      setLoading(false);
      return;
    }

    const fetchIncome = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/income/${incomeId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch income source');
        }

        const data = await response.json();
        setIncomeSource(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching income source:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncome();
  }, [incomeId]);

  return {
    incomeSource,
    loading,
    error,
  };
}

