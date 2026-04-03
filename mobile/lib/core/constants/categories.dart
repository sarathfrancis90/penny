/// CRA T2125 tax categories — MUST match src/lib/categories.ts exactly.
/// These strings are stored in Firestore and used by the AI analysis pipeline.
const List<String> expenseCategories = [
  // GENERAL BUSINESS EXPENSES
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

  // HOME OFFICE EXPENSES
  'Home Office - Heat (gas, propane, wood, etc.)',
  'Home Office - Electricity',
  'Home Office - Water',
  'Home Office - Insurance',
  'Home Office - Maintenance',
  'Home Office - Mortgage interest or rent',
  'Home Office - Property taxes',
  'Home Office - Monitoring and internet',
  'Home Office - Office furnishings',

  // AUTOMOBILE/VEHICLE EXPENSES
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
];

const Map<String, List<String>> categoryGroups = {
  'General Business Expenses': [
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
  ],
  'Home Office Expenses': [
    'Home Office - Heat (gas, propane, wood, etc.)',
    'Home Office - Electricity',
    'Home Office - Water',
    'Home Office - Insurance',
    'Home Office - Maintenance',
    'Home Office - Mortgage interest or rent',
    'Home Office - Property taxes',
    'Home Office - Monitoring and internet',
    'Home Office - Office furnishings',
  ],
  'Automobile/Vehicle Expenses': [
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
  ],
};

String? getCategoryGroup(String category) {
  for (final entry in categoryGroups.entries) {
    if (entry.value.contains(category)) return entry.key;
  }
  return null;
}
