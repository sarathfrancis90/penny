import { useState, useEffect, useCallback } from 'react';
import { PersonalSavingsGoal, GoalStatus } from '@/lib/types/savings';
import { calculateTotalMonthlySavings } from '@/lib/utils/incomeCalculations';

/**
 * Hook to manage personal savings goals
 */
export function useSavingsGoals() {
  const [savingsGoals, setSavingsGoals] = useState<PersonalSavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all savings goals
  const fetchSavingsGoals = useCallback(async (includeInactive: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (includeInactive) {
        params.append('includeInactive', 'true');
      }

      const response = await fetch(`/api/savings-goals?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch savings goals');
      }

      const data = await response.json();
      setSavingsGoals(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching savings goals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch only active savings goals
  const fetchActiveGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('activeOnly', 'true');

      const response = await fetch(`/api/savings-goals?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch savings goals');
      }

      const data = await response.json();
      setSavingsGoals(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching savings goals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new savings goal
  const createGoal = useCallback(async (goalData: Partial<PersonalSavingsGoal>) => {
    try {
      setError(null);

      const response = await fetch('/api/savings-goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(goalData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create savings goal');
      }

      const data = await response.json();
      
      // Refresh the list
      await fetchSavingsGoals();
      
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error creating savings goal:', err);
      throw err;
    }
  }, [fetchSavingsGoals]);

  // Update a savings goal
  const updateGoal = useCallback(async (goalId: string, updates: Partial<PersonalSavingsGoal>) => {
    try {
      setError(null);

      const response = await fetch(`/api/savings-goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update savings goal');
      }

      const data = await response.json();
      
      // Refresh the list
      await fetchSavingsGoals();
      
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error updating savings goal:', err);
      throw err;
    }
  }, [fetchSavingsGoals]);

  // Delete a savings goal
  const deleteGoal = useCallback(async (goalId: string) => {
    try {
      setError(null);

      const response = await fetch(`/api/savings-goals/${goalId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete savings goal');
      }

      // Refresh the list
      await fetchSavingsGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error deleting savings goal:', err);
      throw err;
    }
  }, [fetchSavingsGoals]);

  // Pause a goal
  const pauseGoal = useCallback(async (goalId: string) => {
    return updateGoal(goalId, { status: GoalStatus.PAUSED, isActive: false } as Partial<PersonalSavingsGoal>);
  }, [updateGoal]);

  // Resume a goal
  const resumeGoal = useCallback(async (goalId: string) => {
    return updateGoal(goalId, { status: GoalStatus.ACTIVE, isActive: true } as Partial<PersonalSavingsGoal>);
  }, [updateGoal]);

  // Calculate total monthly savings allocation
  const totalMonthlySavings = calculateTotalMonthlySavings(savingsGoals);

  // Get active goals only
  const activeGoals = savingsGoals.filter(
    (goal) => goal.isActive && goal.status === 'active'
  );

  // Get achieved goals
  const achievedGoals = savingsGoals.filter(
    (goal) => goal.status === 'achieved'
  );

  // Calculate total saved (current amount across all goals)
  const totalSaved = savingsGoals.reduce(
    (sum, goal) => sum + goal.currentAmount,
    0
  );

  // Calculate total target (target amount across all active goals)
  const totalTarget = activeGoals.reduce(
    (sum, goal) => sum + goal.targetAmount,
    0
  );

  // Calculate overall progress percentage
  const overallProgress =
    totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // Initial fetch
  useEffect(() => {
    fetchSavingsGoals();
  }, [fetchSavingsGoals]);

  return {
    savingsGoals,
    activeGoals,
    achievedGoals,
    totalMonthlySavings,
    totalSaved,
    totalTarget,
    overallProgress,
    loading,
    error,
    fetchSavingsGoals,
    fetchActiveGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    pauseGoal,
    resumeGoal,
  };
}

/**
 * Hook to get a specific savings goal
 */
export function useSavingsGoal(goalId: string | null) {
  const [savingsGoal, setSavingsGoal] = useState<PersonalSavingsGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goalId) {
      setLoading(false);
      return;
    }

    const fetchGoal = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/savings-goals/${goalId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch savings goal');
        }

        const data = await response.json();
        setSavingsGoal(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching savings goal:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGoal();
  }, [goalId]);

  return {
    savingsGoal,
    loading,
    error,
  };
}

