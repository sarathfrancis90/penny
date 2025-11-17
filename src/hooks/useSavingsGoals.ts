import { useState, useEffect, useCallback } from 'react';
import { PersonalSavingsGoal, GoalStatus, CreatePersonalSavingsGoal, UpdatePersonalSavingsGoal } from '@/lib/types/savings';
import { calculateTotalMonthlySavings } from '@/lib/utils/incomeCalculations';
import { PersonalSavingsGoalService } from '@/lib/services/savingsService';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook to manage personal savings goals
 */
export function useSavingsGoals() {
  const { user } = useAuth();
  const [savingsGoals, setSavingsGoals] = useState<PersonalSavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all savings goals
  const fetchSavingsGoals = useCallback(async (includeInactive: boolean = false) => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const goals = await PersonalSavingsGoalService.getAllForUser(user.uid, includeInactive);
      setSavingsGoals(goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching savings goals:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // Fetch only active savings goals
  const fetchActiveGoals = useCallback(async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const goals = await PersonalSavingsGoalService.getAllForUser(user.uid, false);
      setSavingsGoals(goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching savings goals:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // Create a new savings goal
  const createGoal = useCallback(async (goalData: Partial<PersonalSavingsGoal>) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);

      // Add userId to the data
      const dataWithUserId: CreatePersonalSavingsGoal = {
        ...goalData,
        userId: user.uid,
      } as CreatePersonalSavingsGoal;
      const newGoal = await PersonalSavingsGoalService.create(dataWithUserId);
      
      // Refresh the list
      await fetchSavingsGoals();
      
      return newGoal;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error creating savings goal:', err);
      throw err;
    }
  }, [user?.uid, fetchSavingsGoals]);

  // Update a savings goal
  const updateGoal = useCallback(async (goalId: string, updates: Partial<PersonalSavingsGoal>) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);

      await PersonalSavingsGoalService.update(goalId, updates as UpdatePersonalSavingsGoal);
      
      // Refresh the list
      await fetchSavingsGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error updating savings goal:', err);
      throw err;
    }
  }, [user?.uid, fetchSavingsGoals]);

  // Delete a savings goal
  const deleteGoal = useCallback(async (goalId: string) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      setError(null);

      await PersonalSavingsGoalService.delete(goalId);

      // Refresh the list
      await fetchSavingsGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error deleting savings goal:', err);
      throw err;
    }
  }, [user?.uid, fetchSavingsGoals]);

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

        const goal = await PersonalSavingsGoalService.getById(goalId);
        setSavingsGoal(goal);
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

