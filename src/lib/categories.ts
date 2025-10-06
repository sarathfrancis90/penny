/**
 * Master list of Canadian tax expense categories for self-incorporated professionals
 * Based on CRA business expense guidelines
 * 
 * NOTE: This is a comprehensive starting list. Update this array with categories
 * from EXPENSES.csv, HOME OFFICE.csv, and VEHICLE.csv once available.
 */
export const expenseCategories = [
  // Advertising & Marketing
  "Advertising",
  "Marketing",
  "Website & Domain",
  "Social Media Advertising",
  
  // Professional Services
  "Accounting & Bookkeeping",
  "Legal Fees",
  "Consulting Fees",
  "Professional Development",
  "Training & Courses",
  
  // Office Expenses
  "Office Supplies",
  "Software & Subscriptions",
  "Computer Equipment",
  "Office Furniture",
  "Stationery & Printing",
  
  // Home Office
  "Home Office - Rent",
  "Home Office - Utilities",
  "Home Office - Internet",
  "Home Office - Maintenance",
  "Home Office - Insurance",
  "Home Office - Property Taxes",
  
  // Communication
  "Telephone & Mobile",
  "Internet",
  "Web Hosting",
  "Communication Tools",
  
  // Travel & Transportation
  "Airfare",
  "Hotel Accommodation",
  "Meals & Entertainment (50%)",
  "Ground Transportation",
  "Parking",
  "Vehicle - Fuel",
  "Vehicle - Maintenance & Repairs",
  "Vehicle - Insurance",
  "Vehicle - License & Registration",
  "Vehicle - Lease Payments",
  
  // Business Operations
  "Bank Fees & Charges",
  "Credit Card Fees",
  "Business Insurance",
  "Business Licenses & Permits",
  "Memberships & Dues",
  
  // Technology
  "Cloud Services",
  "SaaS Subscriptions",
  "Development Tools",
  "API Services",
  "Data Storage",
  
  // Meals & Entertainment
  "Client Meals (50%)",
  "Business Lunches (50%)",
  "Entertainment (50%)",
  
  // Other
  "Contract Labour",
  "Subcontractors",
  "Miscellaneous",
  "Other Business Expenses",
] as const;

/**
 * Type for expense category
 */
export type ExpenseCategory = typeof expenseCategories[number];

/**
 * Category groups for better organization in the UI
 */
export const categoryGroups = {
  "Advertising & Marketing": [
    "Advertising",
    "Marketing",
    "Website & Domain",
    "Social Media Advertising",
  ],
  "Professional Services": [
    "Accounting & Bookkeeping",
    "Legal Fees",
    "Consulting Fees",
    "Professional Development",
    "Training & Courses",
  ],
  "Office": [
    "Office Supplies",
    "Software & Subscriptions",
    "Computer Equipment",
    "Office Furniture",
    "Stationery & Printing",
  ],
  "Home Office": [
    "Home Office - Rent",
    "Home Office - Utilities",
    "Home Office - Internet",
    "Home Office - Maintenance",
    "Home Office - Insurance",
    "Home Office - Property Taxes",
  ],
  "Communication": [
    "Telephone & Mobile",
    "Internet",
    "Web Hosting",
    "Communication Tools",
  ],
  "Travel": [
    "Airfare",
    "Hotel Accommodation",
    "Meals & Entertainment (50%)",
    "Ground Transportation",
    "Parking",
  ],
  "Vehicle": [
    "Vehicle - Fuel",
    "Vehicle - Maintenance & Repairs",
    "Vehicle - Insurance",
    "Vehicle - License & Registration",
    "Vehicle - Lease Payments",
  ],
  "Technology": [
    "Cloud Services",
    "SaaS Subscriptions",
    "Development Tools",
    "API Services",
    "Data Storage",
  ],
  "Business Operations": [
    "Bank Fees & Charges",
    "Credit Card Fees",
    "Business Insurance",
    "Business Licenses & Permits",
    "Memberships & Dues",
  ],
  "Other": [
    "Contract Labour",
    "Subcontractors",
    "Miscellaneous",
    "Other Business Expenses",
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
