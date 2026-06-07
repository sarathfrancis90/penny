export const expenseCategories = [
  'Advertising (Promotion, gift cards etc.)',
  'Meals and entertainment',
  'Groceries',
  'Insurance (No life insurance)',
  'Interest (and bank charges)',
  'Fees, licences, dues, memberships, and subscriptions',
  'Office expenses',
  'Supplies (for example PPT kit etc.)',
  'Rent (covers only office rent in industrial area)',
  'Legal, accounting, and other professional fees',
  'Management and administration fees',
  'Sub contracts / consultants paid in Canada',
  'Sub contracts / consultants paid outside Canada',
  'Salaries, wages, and benefits paid to the employees',
  'Withdrawal by Directors',
  'Travel (including transportation fees, accommodations, and meals)',
  'Telephone',
  'Motor vehicle expenses',
  'Other expenses (specify)',
  'Home Office - Heat (gas, propane, wood, etc.)',
  'Home Office - Electricity',
  'Home Office - Water',
  'Home Office - Insurance',
  'Home Office - Maintenance',
  'Home Office - Mortgage interest or rent',
  'Home Office - Property taxes',
  'Home Office - Monitoring and internet',
  'Home Office - Office furnishings',
  'Vehicle - Fuel (gasoline, propane, oil)',
  'Vehicle - Repairs and maintenance (including oil changes)',
  'Vehicle - Lease payments',
  'Vehicle - Car washes',
  'Vehicle - Insurance',
  'Vehicle - Licence and registration',
  'Vehicle - Interest expense on vehicle purchase loan',
  'Vehicle - ETR 407',
  'Vehicle - CAA (Canadian Auto Association)',
  'Vehicle - Parking costs (non-prorated)',
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export const CANONICAL_OTHER_EXPENSE_CATEGORY: ExpenseCategory =
  'Other expenses (specify)';

const expenseCategorySet = new Set<string>(expenseCategories);

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategorySet.has(value);
}

export function normalizeExpenseCategory(value: string): ExpenseCategory {
  return isExpenseCategory(value) ? value : CANONICAL_OTHER_EXPENSE_CATEGORY;
}
