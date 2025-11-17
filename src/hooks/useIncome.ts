import { useState, useEffect, useCallback } from 'react';
import { PersonalIncomeSource, CreatePersonalIncomeSource, UpdatePersonalIncomeSource } from '@/lib/types/income';
import { calculateTotalMonthlyIncome } from '@/lib/utils/incomeCalculations';
import { PersonalIncomeService } from '@/lib/services/incomeService';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook to manage personal income sources
 */
export function useIncome() {
  const { user } = useAuth();
  const [incomeSources, setIncomeSources] = useState<PersonalIncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all income sources
  const fetchIncomeSources = useCallback(async (includeInactive: boolean = false) => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const sources = await PersonalIncomeService.getAllForUser(user.uid, includeInactive);
      setIncomeSources(sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching income sources:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // Create a new income source
  const createIncome = useCallback(async (incomeData: Partial<PersonalIncomeSource>) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);

      // Add userId to the data
      const dataWithUserId: CreatePersonalIncomeSource = {
        ...incomeData,
        userId: user.uid,
      } as CreatePersonalIncomeSource;
      const newIncome = await PersonalIncomeService.create(dataWithUserId);
      
      // Refresh the list
      await fetchIncomeSources();
      
      return newIncome;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error creating income source:', err);
      throw err;
    }
  }, [user?.uid, fetchIncomeSources]);

  // Update an income source
  const updateIncome = useCallback(async (incomeId: string, updates: Partial<PersonalIncomeSource>) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);

      await PersonalIncomeService.update(incomeId, updates as UpdatePersonalIncomeSource);
      
      // Refresh the list
      await fetchIncomeSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error updating income source:', err);
      throw err;
    }
  }, [user?.uid, fetchIncomeSources]);

  // Delete an income source
  const deleteIncome = useCallback(async (incomeId: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);

      await PersonalIncomeService.delete(incomeId);

      // Refresh the list
      await fetchIncomeSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error deleting income source:', err);
      throw err;
    }
  }, [user?.uid, fetchIncomeSources]);

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

        const source = await PersonalIncomeService.getById(incomeId);
        setIncomeSource(source);
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

