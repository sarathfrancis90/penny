/**
 * Master list of Canadian tax expense categories for self-incorporated professionals
 * Based on official CRA T2125 Business Income and Expenses forms
 * 
 * Categories are organized by:
 * 1. General Business Expenses
 * 2. Home Office Expenses
 * 3. Automobile/Vehicle Expenses
 */
export const expenseCategories = [
  // GENERAL BUSINESS EXPENSES (from main expenses sheet)
  "Advertising (Promotion, gift cards etc.)",
  "Meals and entertainment",
  "Insurance (No life insurance)",
  "Interest (and bank charges)",
  "Fees, licences, dues, memberships, and subscriptions",
  "Office expenses",
  "Supplies (for example PPT kit etc.)",
  "Rent (covers only office rent in industrial area)",
  "Legal, accounting, and other professional fees",
  "Management and administration fees",
  "Sub contracts / consultants paid in Canada",
  "Sub contracts / consultants paid outside Canada",
  "Salaries, wages, and benefits paid to the employees",
  "Withdrawal by Directors",
  "Travel (including transportation fees, accommodations, and meals)",
  "Telephone",
  "Motor vehicle expenses",
  "Other expenses (specify)",
  
  // HOME OFFICE EXPENSES (from home office sheet)
  "Home Office - Heat (gas, propane, wood, etc.)",
  "Home Office - Electricity",
  "Home Office - Water",
  "Home Office - Insurance",
  "Home Office - Maintenance",
  "Home Office - Mortgage interest or rent",
  "Home Office - Property taxes",
  "Home Office - Monitoring and internet",
  "Home Office - Office furnishings",
  
  // AUTOMOBILE/VEHICLE EXPENSES (from vehicle sheet)
  "Vehicle - Fuel (gasoline, propane, oil)",
  "Vehicle - Repairs and maintenance (including oil changes)",
  "Vehicle - Lease payments",
  "Vehicle - Car washes",
  "Vehicle - Insurance",
  "Vehicle - Licence and registration",
  "Vehicle - Interest expense on vehicle purchase loan",
  "Vehicle - ETR 407",
  "Vehicle - CAA (Canadian Auto Association)",
  "Vehicle - Parking costs (non-prorated)",
] as const;

/**
 * Type for expense category
 */
export type ExpenseCategory = typeof expenseCategories[number];

/**
 * Category groups for better organization in the UI
 * Organized to match the tax form structure
 */
export const categoryGroups = {
  "General Business Expenses": [
    "Advertising (Promotion, gift cards etc.)",
    "Meals and entertainment (50%)",
    "Insurance (No life insurance)",
    "Interest (and bank charges)",
    "Fees, licences, dues, memberships, and subscriptions",
    "Office expenses",
    "Supplies (for example PPT kit etc.)",
    "Rent (covers only office rent in industrial area)",
    "Legal, accounting, and other professional fees",
    "Management and administration fees",
    "Sub contracts / consultants paid in Canada",
    "Sub contracts / consultants paid outside Canada",
    "Salaries, wages, and benefits paid to the employees",
    "Withdrawal by Directors",
    "Travel (including transportation fees, accommodations, and meals)",
    "Telephone",
    "Motor vehicle expenses",
    "Other expenses (specify)",
  ],
  "Home Office Expenses": [
    "Home Office - Heat (gas, propane, wood, etc.)",
    "Home Office - Electricity",
    "Home Office - Water",
    "Home Office - Insurance",
    "Home Office - Maintenance",
    "Home Office - Mortgage interest or rent",
    "Home Office - Property taxes",
    "Home Office - Monitoring and internet",
    "Home Office - Office furnishings",
  ],
  "Automobile/Vehicle Expenses": [
    "Vehicle - Fuel (gasoline, propane, oil)",
    "Vehicle - Repairs and maintenance (including oil changes)",
    "Vehicle - Lease payments",
    "Vehicle - Car washes",
    "Vehicle - Insurance",
    "Vehicle - Licence and registration",
    "Vehicle - Interest expense on vehicle purchase loan",
    "Vehicle - ETR 407",
    "Vehicle - CAA (Canadian Auto Association)",
    "Vehicle - Parking costs (non-prorated)",
  ],
} as const;

/**
 * Helper function to get category group for a given category
 */
export function getCategoryGroup(category: string): string | null {
  for (const [group, categories] of Object.entries(categoryGroups)) {
    if (categories.includes(category as never)) {
      return group;
    }
  }
  return null;
}
