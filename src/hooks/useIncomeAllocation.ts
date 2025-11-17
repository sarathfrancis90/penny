'use client';

import { useMemo } from 'react';
import { useIncome } from './useIncome';
import { useSavingsGoals } from './useSavingsGoals';
import { usePersonalBudgets } from './usePersonalBudgets';
import { useGroupBudgets } from './useGroupBudgets';
import { calculateTotalMonthlyIncome, calculateTotalMonthlySavings } from '@/lib/utils/incomeCalculations';
import { getCurrentPeriod } from '@/lib/budgetCalculations';
import { PersonalBudget, GroupBudget } from '@/lib/types';

interface ValidationResult {
  isValid: boolean;
  totalAllocated: number;
  unallocated: number;
  overAllocation: number;
  newTotalBudgets?: number;
  newTotalSavings?: number;
}

interface IncomeAllocationData {
  totalMonthlyIncome: number;
  totalBudgets: number;
  totalSavings: number;
  totalAllocated: number;
  unallocated: number;
  isOverAllocated: boolean;
  allocationPercentage: number;
  budgetPercentage: number;
  savingsPercentage: number;
  validateAllocation: (newBudgetAmount?: number, newSavingsAmount?: number) => ValidationResult;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for personal income allocation validation
 * Tracks income, budgets, and savings to ensure total allocation doesn't exceed income
 */
export function useIncomeAllocation(userId: string | undefined): IncomeAllocationData {
  const currentPeriod = getCurrentPeriod();
  
  // Fetch all financial data
  const { 
    incomeSources, 
    totalMonthlyIncome, 
    loading: incomeLoading, 
    error: incomeError 
  } = useIncome();
  
  const { 
    savingsGoals, 
    activeGoals,
    totalMonthlySavings,
    loading: savingsLoading, 
    error: savingsError 
  } = useSavingsGoals();
  
  const { 
    budgets, 
    loading: budgetsLoading, 
    error: budgetsError 
  } = usePersonalBudgets(
    userId, 
    undefined, 
    currentPeriod.month, 
    currentPeriod.year
  );

  // Calculate total budget amount for current month
  const totalBudgets = useMemo(() => {
    return budgets.reduce((sum, budget) => sum + budget.monthlyLimit, 0);
  }, [budgets]);

  // Calculate allocation metrics
  const metrics = useMemo(() => {
    const totalAllocated = totalBudgets + totalMonthlySavings;
    const unallocated = totalMonthlyIncome - totalAllocated;
    const isOverAllocated = unallocated < 0;
    const allocationPercentage = totalMonthlyIncome > 0 
      ? (totalAllocated / totalMonthlyIncome) * 100 
      : 0;
    const budgetPercentage = totalMonthlyIncome > 0 
      ? (totalBudgets / totalMonthlyIncome) * 100 
      : 0;
    const savingsPercentage = totalMonthlyIncome > 0 
      ? (totalMonthlySavings / totalMonthlyIncome) * 100 
      : 0;

    return {
      totalAllocated,
      unallocated,
      isOverAllocated,
      allocationPercentage,
      budgetPercentage,
      savingsPercentage,
    };
  }, [totalBudgets, totalMonthlySavings, totalMonthlyIncome]);

  // Validation function
  const validateAllocation = (
    newBudgetAmount: number = 0,
    newSavingsAmount: number = 0
  ): ValidationResult => {
    const newTotalBudgets = totalBudgets + newBudgetAmount;
    const newTotalSavings = totalMonthlySavings + newSavingsAmount;
    const newTotalAllocated = newTotalBudgets + newTotalSavings;
    const newUnallocated = totalMonthlyIncome - newTotalAllocated;
    const isValid = newUnallocated >= 0;
    const overAllocation = Math.max(0, newTotalAllocated - totalMonthlyIncome);

    return {
      isValid,
      totalAllocated: newTotalAllocated,
      unallocated: newUnallocated,
      overAllocation,
      newTotalBudgets,
      newTotalSavings,
    };
  };

  const loading = incomeLoading || savingsLoading || budgetsLoading;
  const error = incomeError || savingsError || budgetsError;

  return {
    totalMonthlyIncome,
    totalBudgets,
    totalSavings: totalMonthlySavings,
    ...metrics,
    validateAllocation,
    loading,
    error,
  };
}

/**
 * Hook for group income allocation validation
 * Same as personal but for group entities
 */
export function useGroupIncomeAllocation(
  userId: string | undefined,
  groupId: string | undefined
): IncomeAllocationData {
  const currentPeriod = getCurrentPeriod();
  
  // For group, we need to fetch group income, group budgets, and group savings
  // Using the existing hooks but filtered for group
  const { 
    budgets, 
    loading: budgetsLoading, 
    error: budgetsError 
  } = useGroupBudgets(
    groupId, 
    undefined, 
    currentPeriod.month, 
    currentPeriod.year
  );

  // Calculate total budget amount for current month
  const totalBudgets = useMemo(() => {
    return budgets.reduce((sum, budget) => sum + budget.monthlyLimit, 0);
  }, [budgets]);

  // For now, return default values until we implement group income/savings hooks
  // TODO: Implement useGroupIncome and useGroupSavingsGoals hooks
  const totalMonthlyIncome = 0; // TODO: Get from useGroupIncome
  const totalMonthlySavings = 0; // TODO: Get from useGroupSavingsGoals

  const metrics = useMemo(() => {
    const totalAllocated = totalBudgets + totalMonthlySavings;
    const unallocated = totalMonthlyIncome - totalAllocated;
    const isOverAllocated = unallocated < 0;
    const allocationPercentage = totalMonthlyIncome > 0 
      ? (totalAllocated / totalMonthlyIncome) * 100 
      : 0;
    const budgetPercentage = totalMonthlyIncome > 0 
      ? (totalBudgets / totalMonthlyIncome) * 100 
      : 0;
    const savingsPercentage = totalMonthlyIncome > 0 
      ? (totalMonthlySavings / totalMonthlyIncome) * 100 
      : 0;

    return {
      totalAllocated,
      unallocated,
      isOverAllocated,
      allocationPercentage,
      budgetPercentage,
      savingsPercentage,
    };
  }, [totalBudgets, totalMonthlySavings, totalMonthlyIncome]);

  const validateAllocation = (
    newBudgetAmount: number = 0,
    newSavingsAmount: number = 0
  ): ValidationResult => {
    const newTotalBudgets = totalBudgets + newBudgetAmount;
    const newTotalSavings = totalMonthlySavings + newSavingsAmount;
    const newTotalAllocated = newTotalBudgets + newTotalSavings;
    const newUnallocated = totalMonthlyIncome - newTotalAllocated;
    const isValid = newUnallocated >= 0;
    const overAllocation = Math.max(0, newTotalAllocated - totalMonthlyIncome);

    return {
      isValid,
      totalAllocated: newTotalAllocated,
      unallocated: newUnallocated,
      overAllocation,
      newTotalBudgets,
      newTotalSavings,
    };
  };

  const loading = budgetsLoading;
  const error = budgetsError;

  return {
    totalMonthlyIncome,
    totalBudgets,
    totalSavings: totalMonthlySavings,
    ...metrics,
    validateAllocation,
    loading,
    error,
  };
}

