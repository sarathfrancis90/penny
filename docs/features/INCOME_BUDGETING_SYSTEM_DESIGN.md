# 💰 Income & Budget Allocation System - Design Document

**Feature**: Comprehensive Income Tracking & Budget Allocation  
**Version**: 1.0  
**Date**: November 17, 2025  
**Status**: 📝 Design Phase  

---

## 🎯 Executive Summary

Transform Penny from an expense tracker into a **complete financial management system** by adding income tracking and income-based budget allocation. Users will set income sources, allocate budgets based on available income, and get intelligent recommendations for budget planning.

### Key Value Propositions
- 💰 **Income-Based Budgeting**: Set budgets based on actual income
- 📊 **Budget Allocation Tracking**: Know how much income is allocated vs available
- 🔄 **Smart Monthly Setup**: Auto-copy budgets with income confirmation
- 📈 **Income Analytics**: Track income trends and YTD summaries
- 👥 **Group Income**: Manage shared income for families/roommates
- 🤖 **AI Recommendations**: Get budget suggestions based on income

---

## 📋 Table of Contents

1. [Problem Statement](#problem-statement)
2. [User Personas & Use Cases](#user-personas--use-cases)
3. [Feature Requirements](#feature-requirements)
4. [System Architecture](#system-architecture)
5. [Database Schema](#database-schema)
6. [UI/UX Design](#uiux-design)
7. [Implementation Phases](#implementation-phases)
8. [Integration Points](#integration-points)
9. [Success Metrics](#success-metrics)
10. [Future Enhancements](#future-enhancements)

---

## 🔴 Problem Statement

### Current Limitations
1. ❌ **No Income Tracking**: Users can't record income
2. ❌ **Arbitrary Budgets**: Budgets set without knowing actual income
3. ❌ **No Budget Allocation View**: Don't know if over-budgeting
4. ❌ **Monthly Repetition**: Users re-enter same budgets every month
5. ❌ **No Financial Overview**: Missing income vs expenses comparison

### User Pain Points
- "I set a $5,000 budget but only earn $4,000/month" (Over-allocation)
- "I don't know how much I have left to budget" (No visibility)
- "I have to set the same budgets every month" (Tedious)
- "Can't track if my income is growing" (No analytics)
- "Need to split income with roommates" (No group income)

---

## 👥 User Personas & Use Cases

### Persona 1: Sarah - Salaried Professional
**Profile**: 28, software engineer, stable salary

**Use Cases**:
- Add monthly salary of $8,000
- Allocate budgets: Housing ($2,000), Food ($800), Transport ($300)
- See remaining $4,900 unallocated
- Track bonus income separately
- View year-to-date income growth

### Persona 2: Mike - Freelancer
**Profile**: 34, graphic designer, variable income

**Use Cases**:
- Add multiple income sources (Client A, B, C)
- Income varies monthly ($4,000 - $8,000)
- Need conservative budget allocation
- Track average income over 3-6 months
- Get AI suggestions for budget limits

### Persona 3: The Johnsons - Family Group
**Profile**: Married couple, shared expenses

**Use Cases**:
- Both add income to "Family" group
- Combined income: $12,000/month
- Allocate group budgets: Groceries ($1,200), Utilities ($400)
- Track who contributed what income
- See family budget allocation dashboard

### Persona 4: College Roommates - Shared Living
**Profile**: 3 roommates sharing apartment

**Use Cases**:
- Each adds their income contribution ($500/month)
- Group income: $1,500/month
- Set budgets for shared expenses only
- Track equal/unequal income contributions
- Monthly income confirmation

---

## 🎯 Feature Requirements

### Must-Have (MVP)

#### Income Management
- ✅ Add multiple income sources (salary, freelance, bonus, etc.)
- ✅ Personal income (individual user)
- ✅ Group income (shared, admin-only)
- ✅ Edit/delete income sources
- ✅ Recurring income (monthly, bi-weekly, weekly)
- ✅ One-time income (bonuses, gifts)

#### Budget Allocation
- ✅ Calculate total available income
- ✅ Show budget allocation percentage
- ✅ Show unallocated income
- ✅ Warn when over-allocated
- ✅ Smart allocation suggestions

#### Monthly Budget Setup
- ✅ First login of month → budget setup prompt
- ✅ Auto-copy previous month's budgets
- ✅ Auto-copy previous month's income
- ✅ Allow confirmation/editing before applying
- ✅ Skip option (use last month as-is)

#### Income Dashboard
- ✅ Current month income summary
- ✅ Budget allocation breakdown (pie/bar chart)
- ✅ Allocated vs Unallocated income
- ✅ Income vs Expenses comparison
- ✅ Quick actions (add income, adjust budgets)

#### Analytics
- ✅ Month-over-month income trends
- ✅ Year-to-date (YTD) income summary
- ✅ Average income (3-month, 6-month)
- ✅ Income by source breakdown
- ✅ Budget allocation history

### Should-Have (Phase 2)

#### Advanced Features
- ✅ Income forecasting (based on historical data)
- ✅ Savings goal tracking (% of income)
- ✅ Emergency fund recommendations (3-6 months expenses)
- ✅ Income categories (active, passive, investment)
- ✅ Tax withholding tracking
- ✅ Net vs Gross income

#### AI-Powered Insights
- ✅ "Your income increased 15% this quarter"
- ✅ "You're over-allocating by $200. Consider reducing X budget"
- ✅ "Based on income, recommended savings: $800/month"
- ✅ Budget recommendations based on 50/30/20 rule
- ✅ Income stability score (for freelancers)

#### Group Features
- ✅ Income contribution tracking (who added what)
- ✅ Unequal income splits (40/60, not 50/50)
- ✅ Group budget recommendations based on total income
- ✅ Income history per member
- ✅ "Fair share" budget allocation

### Nice-to-Have (Phase 3)

#### Advanced Analytics
- ✅ Income vs expenses ratio
- ✅ Burn rate calculation
- ✅ Runway calculation (months of expenses covered)
- ✅ Investment income tracking
- ✅ Multi-currency income support

#### Automation
- ✅ Bank integration (auto-import income)
- ✅ Payroll integration
- ✅ Recurring income auto-creation
- ✅ Smart income detection from transaction data

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Penny Frontend                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Income       │  │ Budget       │  │ Analytics    │      │
│  │ Management   │  │ Allocation   │  │ Dashboard    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ /api/income  │  │ /api/budgets │  │ /api/        │      │
│  │              │  │ /allocation  │  │ analytics    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Income       │  │ Allocation   │  │ Notification │      │
│  │ Service      │  │ Calculator   │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Firestore Database                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ income_      │  │ budget_      │  │ monthly_     │      │
│  │ sources      │  │ allocations  │  │ setup_status │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Frontend Components
```
src/components/income/
├── IncomeSourceList.tsx          # List all income sources
├── IncomeSourceForm.tsx          # Add/edit income source
├── IncomeSourceCard.tsx          # Single income display
├── IncomeSummary.tsx             # Monthly income summary
├── BudgetAllocationView.tsx      # Allocation breakdown
├── MonthlySetupWizard.tsx        # First-login setup flow
├── IncomeVsExpensesChart.tsx     # Comparison chart
└── AllocationProgressBar.tsx     # Visual allocation indicator

src/components/budgets/
├── BudgetAllocationCalculator.tsx # Smart allocation tool
├── BudgetRecommendations.tsx     # AI suggestions
└── UnallocatedIncome.tsx         # Show remaining income
```

#### API Routes
```
src/app/api/income/
├── route.ts                      # CRUD for personal income
├── [incomeId]/route.ts          # Update/delete specific
├── monthly-summary/route.ts     # Current month summary
├── ytd/route.ts                 # Year-to-date analytics
└── group/[groupId]/route.ts     # Group income management

src/app/api/budgets/
├── allocation/route.ts          # Calculate allocation
├── allocation/suggestions/route.ts  # AI recommendations
└── monthly-setup/route.ts       # Setup wizard data
```

---

## 🗄️ Database Schema

### New Collections

#### 1. `income_sources_personal`
```typescript
interface PersonalIncomeSource {
  id: string;
  userId: string;
  name: string;                    // "Salary", "Freelance", "Bonus"
  category: IncomeCategory;        // salary, freelance, bonus, investment, other
  amount: number;
  frequency: IncomeFrequency;      // monthly, biweekly, weekly, once
  
  // Recurring details
  isRecurring: boolean;
  recurringDate?: number;          // Day of month (1-31)
  
  // Status
  isActive: boolean;
  startDate: Timestamp;
  endDate?: Timestamp;             // For fixed-term income
  
  // Metadata
  description?: string;
  taxable: boolean;
  netAmount?: number;              // After-tax amount
  currency: string;                // "USD", "CAD", etc.
  
  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReceivedAt?: Timestamp;
}

enum IncomeCategory {
  SALARY = 'salary',
  FREELANCE = 'freelance',
  BONUS = 'bonus',
  INVESTMENT = 'investment',
  RENTAL = 'rental',
  SIDE_HUSTLE = 'side_hustle',
  GIFT = 'gift',
  OTHER = 'other'
}

enum IncomeFrequency {
  MONTHLY = 'monthly',
  BIWEEKLY = 'biweekly',
  WEEKLY = 'weekly',
  ONCE = 'once',
  YEARLY = 'yearly'
}
```

#### 2. `income_sources_group`
```typescript
interface GroupIncomeSource {
  id: string;
  groupId: string;
  addedBy: string;                 // User ID who added
  contributedBy?: string;          // Which member's income
  
  name: string;
  category: IncomeCategory;
  amount: number;
  frequency: IncomeFrequency;
  
  isRecurring: boolean;
  recurringDate?: number;
  
  isActive: boolean;
  startDate: Timestamp;
  endDate?: Timestamp;
  
  description?: string;
  taxable: boolean;
  netAmount?: number;
  currency: string;
  
  // Group-specific
  splitType: 'equal' | 'proportional' | 'fixed';
  allocation?: Record<string, number>;  // userId -> percentage/amount
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReceivedAt?: Timestamp;
}
```

#### 3. `monthly_income_records`
```typescript
interface MonthlyIncomeRecord {
  id: string;
  userId?: string;                 // For personal
  groupId?: string;                // For group
  period: {
    month: number;
    year: number;
  };
  
  // Income summary
  totalIncome: number;
  incomeByCategory: Record<IncomeCategory, number>;
  incomeBySource: Array<{
    sourceId: string;
    sourceName: string;
    amount: number;
    receivedAt: Timestamp;
  }>;
  
  // Budget allocation
  totalBudgeted: number;
  budgetByCategory: Record<string, number>;
  unallocatedIncome: number;
  allocationPercentage: number;    // totalBudgeted / totalIncome * 100
  
  // Status
  isOverAllocated: boolean;
  overAllocationAmount: number;
  
  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp;         // When user confirmed this month
}
```

#### 4. `monthly_setup_status`
```typescript
interface MonthlySetupStatus {
  id: string;                      // userId_YYYY_MM or groupId_YYYY_MM
  userId?: string;
  groupId?: string;
  period: {
    month: number;
    year: number;
  };
  
  // Setup progress
  setupCompleted: boolean;
  incomeConfirmed: boolean;
  budgetsConfirmed: boolean;
  skippedSetup: boolean;
  
  // Data
  previousMonthIncome: number;
  currentMonthIncome: number;
  previousMonthBudgets: Array<{
    category: string;
    limit: number;
  }>;
  currentMonthBudgets: Array<{
    category: string;
    limit: number;
  }>;
  
  // Tracking
  setupStartedAt?: Timestamp;
  setupCompletedAt?: Timestamp;
  lastPromptedAt?: Timestamp;
  promptCount: number;
}
```

#### 5. `budget_allocation_history`
```typescript
interface BudgetAllocationHistory {
  id: string;
  userId?: string;
  groupId?: string;
  period: {
    month: number;
    year: number;
  };
  
  totalIncome: number;
  allocations: Array<{
    category: string;
    budgetAmount: number;
    percentage: number;
  }>;
  
  unallocated: number;
  unallocatedPercentage: number;
  
  recommendations: Array<{
    category: string;
    suggestedAmount: number;
    reason: string;
  }>;
  
  createdAt: Timestamp;
}
```

### Modified Collections

#### Updated: `budgets_personal` / `budgets_group`
```typescript
// Add these fields to existing budget documents
interface BudgetWithAllocation {
  // ... existing fields ...
  
  // NEW: Income-based allocation
  allocationSource: 'income' | 'manual';
  allocatedFromIncome: boolean;
  allocationPercentage?: number;   // % of total income
  recommendedLimit?: number;       // AI suggestion
  
  // NEW: Tracking
  lastAdjustedBy?: string;
  adjustmentReason?: string;
}
```

---

## 🎨 UI/UX Design

### 1. Monthly Setup Wizard (First Login)

**Trigger**: User logs in on first day of new month

```
┌─────────────────────────────────────────────────────────────┐
│  🎉 Welcome to November 2025!                               │
│                                                              │
│  Let's set up your finances for this month                  │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Step 1 of 3: Confirm Income                        │    │
│  │                                                     │    │
│  │ We've copied your income from last month:          │    │
│  │                                                     │    │
│  │ ✓ Monthly Salary        $8,000                    │    │
│  │ ✓ Freelance Income      $1,500                    │    │
│  │                                                     │    │
│  │ Total Income: $9,500                              │    │
│  │                                                     │    │
│  │ [Edit Income]  [Add New Income Source]            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  [Skip This Month]        [Continue →]                      │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│  Step 2 of 3: Set Budgets                                   │
│                                                              │
│  Income Available: $9,500                                   │
│  Currently Allocated: $7,800 (82%)                          │
│  Unallocated: $1,700                                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 🍔 Food              $1,000  [▓▓▓▓▓░░░░░] 11%     │    │
│  │ 🏠 Housing           $2,500  [▓▓▓▓▓▓▓▓▓░] 26%     │    │
│  │ 🚗 Transportation    $  400  [▓▓░░░░░░░░]  4%     │    │
│  │ 💡 Utilities         $  300  [▓▓░░░░░░░░]  3%     │    │
│  │ 🎬 Entertainment     $  200  [▓░░░░░░░░░]  2%     │    │
│  │ 👕 Shopping          $  400  [▓▓░░░░░░░░]  4%     │    │
│  │ 💊 Healthcare        $  500  [▓▓▓░░░░░░░]  5%     │    │
│  │ 📚 Education         $  300  [▓▓░░░░░░░░]  3%     │    │
│  │ 💰 Savings          $2,200  [▓▓▓▓▓▓▓▓░░] 23%     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  💡 Smart Tip: You have $1,700 unallocated. Consider       │
│     increasing your Savings budget to meet 25% goal.       │
│                                                              │
│  [Use AI Recommendations]  [Edit Manually]                  │
│                                                              │
│  [← Back]                [Continue →]                       │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│  Step 3 of 3: Review & Confirm                              │
│                                                              │
│  📊 Your November 2025 Financial Plan                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 💰 Total Income:     $9,500                        │    │
│  │ 📊 Total Budgeted:   $9,500 (100%)                │    │
│  │ 💵 Unallocated:      $    0                        │    │
│  │                                                     │    │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │    │
│  │                                                     │    │
│  │ Budget Breakdown:                                  │    │
│  │ • Housing (26%) ........... $2,500                │    │
│  │ • Savings (26%) ........... $2,500  ← Increased!  │    │
│  │ • Food (11%) .............. $1,000                │    │
│  │ • Healthcare (5%) ......... $  500                │    │
│  │ • Transportation (4%) ..... $  400                │    │
│  │ • Other (28%) ............. $2,600                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ✅ Your budget is balanced!                                │
│  🎯 Following 50/30/20 rule: 52% needs, 28% wants, 26% save│
│                                                              │
│  [← Edit]                [Confirm & Start Month →]          │
└─────────────────────────────────────────────────────────────┘
```

### 2. Income Dashboard Tab

New tab in main dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard  [All Expenses]  [Income]  [Budgets]  [Charts]  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  💰 Income Overview - November 2025                         │
│                                                              │
│  ┌──────────────────┬──────────────────┬──────────────────┐│
│  │ Total Income     │ Budget Allocated │ Unallocated      ││
│  │ $9,500          │ $9,500 (100%)    │ $0               ││
│  └──────────────────┴──────────────────┴──────────────────┘│
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Income Sources                       [+ Add Income]│    │
│  │                                                     │    │
│  │ 💼 Monthly Salary                                  │    │
│  │    $8,000/month • Active • Recurring              │    │
│  │    [Edit] [Deactivate]                            │    │
│  │                                                     │    │
│  │ 💻 Freelance Income                                │    │
│  │    $1,500/month • Active • Variable               │    │
│  │    [Edit] [Deactivate]                            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Budget Allocation                                  │    │
│  │                                                     │    │
│  │  [███████████████████████████░░] 95%              │    │
│  │                                                     │    │
│  │  Allocated: $9,500                                │    │
│  │  Unallocated: $0                                  │    │
│  │                                                     │    │
│  │  [View Detailed Breakdown]                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Income vs Expenses                                 │    │
│  │                                                     │    │
│  │  Income:   $9,500 ████████████████████            │    │
│  │  Expenses: $7,234 ██████████████░░░░░░            │    │
│  │  Savings:  $2,266 (23.9%)                         │    │
│  │                                                     │    │
│  │  🎯 On track to save $2,266 this month!           │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3. Budget Allocation Calculator

When creating/editing budgets:

```
┌─────────────────────────────────────────────────────────────┐
│  Create Budget - Food Category                              │
│                                                              │
│  💰 Income Context                                          │
│  Total Income: $9,500                                       │
│  Currently Allocated: $8,500 (89.5%)                        │
│  Remaining: $1,000                                          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Monthly Budget Limit                               │    │
│  │                                                     │    │
│  │  $ [1000    ] 💰                                   │    │
│  │                                                     │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │    │
│  │                                                     │    │
│  │  Percentage of Income: 10.5%                       │    │
│  │  Allocation Status: ✅ Within budget               │    │
│  │                                                     │    │
│  │  💡 Recommendation: $950 (10% of income)           │    │
│  │     Based on your historical spending              │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ⚠️  Warning: You'll have $0 unallocated if you save this  │
│                                                              │
│  [Cancel]                           [Save Budget]           │
└─────────────────────────────────────────────────────────────┘
```

### 4. Income Analytics Page

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Income Analytics                                         │
│                                                              │
│  [Month] [Quarter] [Year] [All Time]                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Year-to-Date Summary (2025)                        │    │
│  │                                                     │    │
│  │ Total Income:     $104,500                         │    │
│  │ Average/Month:    $  9,500                         │    │
│  │ Highest Month:    $ 12,000 (March)                │    │
│  │ Lowest Month:     $  7,500 (February)             │    │
│  │ Growth Rate:      +12.5% vs 2024                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Income Trend                                       │    │
│  │                                                     │    │
│  │  $12K ┤     ●                                      │    │
│  │  $10K ┤   ●   ●     ●   ●   ●   ●   ●   ●   ●    │    │
│  │  $ 8K ┤ ●                                          │    │
│  │  $ 6K ┤                                            │    │
│  │       └─────────────────────────────────────────   │    │
│  │         J F M A M J J A S O N                      │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Income by Category                                 │    │
│  │                                                     │    │
│  │  💼 Salary      $88,000 (84%) ████████████████░░  │    │
│  │  💻 Freelance   $12,000 (11%) ██░░░░░░░░░░░░░░░░  │    │
│  │  🎁 Bonus       $ 4,500 ( 4%) █░░░░░░░░░░░░░░░░░  │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 5. Group Income Management

```
┌─────────────────────────────────────────────────────────────┐
│  Family Group → Income Management                           │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Total Group Income: $15,000/month                  │    │
│  │                                                     │    │
│  │ Contributors:                                      │    │
│  │ • John (You)  - $10,000 (67%)                     │    │
│  │ • Sarah       - $ 5,000 (33%)                     │    │
│  │                                                     │    │
│  │ Budget Allocated: $14,200 (95%)                   │    │
│  │ Unallocated: $800                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Income Sources                      [+ Add Income] │    │
│  │                                                     │    │
│  │ 💼 John's Salary                                   │    │
│  │    $10,000/month • Active                         │    │
│  │    Added by: You • Contributor: You               │    │
│  │    [Edit] [Remove]                                │    │
│  │                                                     │    │
│  │ 💻 Sarah's Income                                  │    │
│  │    $5,000/month • Active                          │    │
│  │    Added by: Sarah • Contributor: Sarah           │    │
│  │    [View Only]                                    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Implementation Phases

### Phase 1: Core Income Management (2-3 weeks)

**Deliverables:**
- ✅ Database schema implementation
- ✅ Add/edit/delete income sources (personal)
- ✅ Income source CRUD APIs
- ✅ Basic income list UI
- ✅ Income form with validation
- ✅ Firestore security rules

**Tasks:**
1. Create Firestore collections and indexes
2. Implement `incomeService.ts` with CRUD operations
3. Create API routes (`/api/income/*`)
4. Build React components (`IncomeSourceList`, `IncomeSourceForm`)
5. Add income tab to dashboard
6. Write security rules
7. Add unit tests

**Success Criteria:**
- Users can add multiple income sources
- Income sources display correctly
- CRUD operations work flawlessly
- Security rules prevent unauthorized access

---

### Phase 2: Budget Allocation System (2-3 weeks)

**Deliverables:**
- ✅ Budget allocation calculation
- ✅ Allocation percentage display
- ✅ Unallocated income tracking
- ✅ Over-allocation warnings
- ✅ Budget creation with income context

**Tasks:**
1. Create `allocationCalculator.ts` service
2. Update budget creation flow to show income context
3. Build `BudgetAllocationView` component
4. Add allocation percentage to budget cards
5. Implement over-allocation warnings
6. Create `/api/budgets/allocation` endpoint
7. Add real-time allocation updates

**Success Criteria:**
- Budget allocation calculated correctly
- Users see available income when creating budgets
- Over-allocation warnings appear
- Allocation percentages update in real-time

---

### Phase 3: Monthly Setup Wizard (2 weeks)

**Deliverables:**
- ✅ First-login-of-month detection
- ✅ Monthly setup wizard flow
- ✅ Auto-copy previous month data
- ✅ Confirmation/editing interface
- ✅ Skip option

**Tasks:**
1. Create `monthlySetupStatus` collection
2. Implement first-login detection logic
3. Build `MonthlySetupWizard` component (3 steps)
4. Create auto-copy logic for income and budgets
5. Add skip and save functionality
6. Create `/api/budgets/monthly-setup` endpoint
7. Add notification for setup reminder

**Success Criteria:**
- Wizard appears on first login of new month
- Previous month data auto-copies correctly
- Users can edit before confirming
- Setup saves correctly
- Skip option works

---

### Phase 4: Income Analytics (2 weeks)

**Deliverables:**
- ✅ Income dashboard tab
- ✅ Monthly income summary
- ✅ Year-to-date analytics
- ✅ Income trends chart
- ✅ Income vs expenses comparison

**Tasks:**
1. Create `incomeAnalytics.ts` service
2. Build income dashboard components
3. Implement trend chart with Chart.js/Recharts
4. Create YTD calculation logic
5. Add income vs expenses comparison
6. Create `/api/income/ytd` endpoint
7. Build responsive mobile views

**Success Criteria:**
- Income dashboard displays current month summary
- YTD analytics calculate correctly
- Charts render properly
- Mobile-responsive design

---

### Phase 5: Group Income (2 weeks)

**Deliverables:**
- ✅ Group income sources
- ✅ Admin-only add/edit permissions
- ✅ Group income dashboard
- ✅ Contribution tracking
- ✅ Group budget allocation

**Tasks:**
1. Create `income_sources_group` collection
2. Implement group income APIs
3. Add admin permission checks
4. Build group income UI components
5. Add contribution tracking
6. Update group budget allocation
7. Create group income analytics

**Success Criteria:**
- Only admins can add group income
- Group income displays correctly
- Contribution tracking works
- Group budget allocation accurate

---

### Phase 6: AI Recommendations (2-3 weeks)

**Deliverables:**
- ✅ Budget recommendations based on income
- ✅ 50/30/20 rule suggestions
- ✅ Smart allocation tips
- ✅ Income stability scoring
- ✅ Savings goal recommendations

**Tasks:**
1. Integrate Gemini AI for recommendations
2. Create recommendation algorithm
3. Implement 50/30/20 rule calculator
4. Build recommendation UI components
5. Add income stability scoring (for freelancers)
6. Create savings goal suggestions
7. Add A/B testing for recommendations

**Success Criteria:**
- AI provides relevant budget recommendations
- 50/30/20 rule accurately calculated
- Recommendations help users make better decisions
- Freelancers see income stability score

---

### Phase 7: Advanced Features (3-4 weeks)

**Deliverables:**
- ✅ Income forecasting
- ✅ Tax withholding tracking
- ✅ Net vs gross income
- ✅ Emergency fund calculator
- ✅ Savings goal tracking

**Tasks:**
1. Build forecasting model
2. Add tax withholding fields
3. Implement net/gross toggle
4. Create emergency fund calculator
5. Build savings goal tracker
6. Add income categories (active/passive)
7. Create advanced analytics views

**Success Criteria:**
- Forecasts are reasonably accurate
- Tax tracking helps with planning
- Emergency fund recommendations useful
- Savings goals trackable

---

## 🔗 Integration Points

### 1. Existing Budget System

**Changes Required:**
- Add `allocationSource` field to budgets
- Update budget creation flow to show income context
- Add allocation percentage to budget cards
- Create allocation calculator service

**Migration:**
- Existing budgets default to `allocationSource: 'manual'`
- No breaking changes to existing functionality

### 2. Notification System

**New Notifications:**
- `monthly_setup_reminder`: "Time to set your November budgets!"
- `income_added`: "New income source added: Freelance Project"
- `over_allocation`: "Warning: Budgets exceed income by $200"
- `unallocated_income`: "You have $500 unallocated income"
- `income_milestone`: "Congrats! You earned $100k this year!"

### 3. Dashboard

**New Components:**
- Income tab (new)
- Allocation progress bar (all tabs)
- Income vs expenses widget
- Unallocated income alert

### 4. Group System

**Changes:**
- Add income management to group settings
- Show group income in group dashboard
- Add "Income" tab to group details page
- Update group budget allocation logic

### 5. AI System

**Gemini Integration:**
- "Analyze my income and suggest budget allocations"
- "Is my budget allocation healthy?"
- "Should I increase my savings based on income?"
- Income-aware expense recommendations

---

## 📊 Success Metrics

### Engagement Metrics
- **Setup Completion Rate**: >80% users complete monthly setup
- **Income Addition Rate**: >60% users add at least one income source
- **Allocation Optimization**: Average allocation increases from 70% to 90%+
- **Return Rate**: Users return on 1st of month to set budgets

### Financial Health Metrics
- **Savings Rate**: Average user savings increases by 5-10%
- **Over-Allocation**: Reduced from 30% to <10% of users
- **Budget Adherence**: Increases by 15-20%
- **Income Visibility**: 100% of active users aware of monthly income

### User Satisfaction
- **NPS Score**: Target +40 (excellent)
- **Feature Rating**: >4.5/5 stars
- **Support Tickets**: <5% related to income/allocation confusion

---

## 🔮 Future Enhancements (Phase 8+)

### 1. Bank Integration
- Auto-import income from bank accounts
- Detect paycheck deposits
- Reconcile expected vs actual income

### 2. Investment Income
- Track investment gains/losses
- Dividend income tracking
- Capital gains tracking

### 3. Tax Planning
- Estimated tax calculations
- Tax bracket awareness
- Tax-advantaged savings recommendations

### 4. Multi-Currency
- Support income in multiple currencies
- Automatic conversion
- Currency trends

### 5. Household Budgeting
- Family/household view
- Combined income across multiple groups
- Shared vs individual budget allocation

### 6. Income Goals
- Set income growth goals
- Track progress to goals
- Celebrate milestones

---

## 🔒 Security & Privacy

### Data Security
- ✅ All income data encrypted at rest
- ✅ User isolation enforced by Firestore rules
- ✅ Group income only visible to members
- ✅ Admin-only permissions for group income

### Privacy
- ✅ Income amounts never shared outside groups
- ✅ No third-party access to income data
- ✅ Users can delete income history
- ✅ GDPR-compliant data export

---

## 🧪 Testing Strategy

### Unit Tests
- Income CRUD operations
- Allocation calculations
- Budget recommendations
- YTD calculations

### Integration Tests
- Monthly setup wizard flow
- Budget allocation with income
- Group income management
- Notification triggers

### E2E Tests
- Complete monthly setup flow
- Add income → create budget → see allocation
- Group income → group budget allocation
- YTD analytics accuracy

---

## 📝 Documentation Requirements

### User Documentation
- "Getting Started with Income Tracking"
- "Understanding Budget Allocation"
- "Monthly Budget Setup Guide"
- "Income Analytics Explained"
- "Group Income Management"

### Developer Documentation
- API endpoints documentation
- Database schema details
- Allocation calculation algorithms
- Integration guide for new features

---

## 🎯 Definition of Done

### For Each Phase
- ✅ All features implemented as designed
- ✅ Unit tests written and passing (>80% coverage)
- ✅ Integration tests passing
- ✅ Security rules implemented and tested
- ✅ Mobile-responsive UI
- ✅ User documentation written
- ✅ Code reviewed and approved
- ✅ Deployed to staging
- ✅ QA testing passed
- ✅ Deployed to production

---

## 📅 Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 2-3 weeks | Core Income Management |
| Phase 2 | 2-3 weeks | Budget Allocation System |
| Phase 3 | 2 weeks | Monthly Setup Wizard |
| Phase 4 | 2 weeks | Income Analytics |
| Phase 5 | 2 weeks | Group Income |
| Phase 6 | 2-3 weeks | AI Recommendations |
| Phase 7 | 3-4 weeks | Advanced Features |

**Total Estimated Time**: 15-19 weeks (3.5-4.5 months)

**MVP (Phases 1-3)**: 6-8 weeks
**Full Feature Set (Phases 1-6)**: 12-15 weeks

---

## 🏆 Conclusion

This income & budget allocation system will transform Penny from an **expense tracker** into a **complete financial management platform**. Users will:

1. ✅ Track all income sources
2. ✅ Allocate budgets based on actual income
3. ✅ Get smart recommendations
4. ✅ Never over-allocate budgets again
5. ✅ Understand their financial health at a glance
6. ✅ Plan better with income forecasting

**This is a game-changing feature that will significantly increase user engagement and financial wellness.**

---

**Document Version**: 1.0  
**Status**: ✅ Ready for Development  
**Next Step**: Review and approve → Start Phase 1  

---

*Built with 💙 for better financial health*

