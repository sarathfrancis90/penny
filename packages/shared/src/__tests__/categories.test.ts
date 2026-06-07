import { describe, expect, it } from 'vitest';

import { expenseCategories as webExpenseCategories } from '../../../../src/lib/categories';
import {
  CANONICAL_OTHER_EXPENSE_CATEGORY,
  expenseCategories,
  isExpenseCategory,
} from '../categories';

describe('shared expense categories', () => {
  it('matches the existing web category contract exactly', () => {
    expect(expenseCategories).toEqual(webExpenseCategories);
  });

  it('uses the canonical fallback category', () => {
    expect(CANONICAL_OTHER_EXPENSE_CATEGORY).toBe('Other expenses (specify)');
    expect(isExpenseCategory(CANONICAL_OTHER_EXPENSE_CATEGORY)).toBe(true);
    expect(isExpenseCategory('Other Business Expenses')).toBe(false);
  });
});
