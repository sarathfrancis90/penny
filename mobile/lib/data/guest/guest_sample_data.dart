import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/models/income_model.dart';
import 'package:penny_mobile/data/models/savings_model.dart';

/// Sample data for guest mode. All dates are relative to DateTime.now()
/// so charts and period filters always show current data.

Timestamp _ts(DateTime dt) => Timestamp.fromDate(dt);

List<ExpenseModel> guestSampleExpenses() {
  final now = DateTime.now();
  final thisMonth = DateTime(now.year, now.month);
  final lastMonth = DateTime(now.year, now.month - 1);
  final ts = _ts(now);

  return [
    // Current month expenses
    ExpenseModel(
      id: 'guest_exp_1',
      userId: 'guest',
      vendor: 'Tim Hortons',
      amount: 14.50,
      category: 'Meals and entertainment',
      date: _ts(thisMonth.add(const Duration(days: 1))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Coffee and bagel',
    ),
    ExpenseModel(
      id: 'guest_exp_2',
      userId: 'guest',
      vendor: 'Shopify',
      amount: 39.00,
      category: 'Fees, licences, dues, memberships, and subscriptions',
      date: _ts(thisMonth.add(const Duration(days: 2))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Monthly subscription',
    ),
    ExpenseModel(
      id: 'guest_exp_3',
      userId: 'guest',
      vendor: 'Rogers Wireless',
      amount: 85.00,
      category: 'Telephone',
      date: _ts(thisMonth.add(const Duration(days: 3))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Monthly phone plan',
    ),
    ExpenseModel(
      id: 'guest_exp_4',
      userId: 'guest',
      vendor: 'Petro-Canada',
      amount: 72.30,
      category: 'Vehicle - Fuel (gasoline, propane, oil)',
      date: _ts(thisMonth.add(const Duration(days: 4))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Gas fill-up',
    ),
    ExpenseModel(
      id: 'guest_exp_5',
      userId: 'guest',
      vendor: 'Staples',
      amount: 156.00,
      category: 'Office expenses',
      date: _ts(thisMonth.add(const Duration(days: 5))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Printer paper and toner',
    ),
    ExpenseModel(
      id: 'guest_exp_6',
      userId: 'guest',
      vendor: 'Amazon Web Services',
      amount: 45.99,
      category: 'Other expenses (specify)',
      date: _ts(thisMonth.add(const Duration(days: 6))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Cloud hosting',
    ),
    ExpenseModel(
      id: 'guest_exp_7',
      userId: 'guest',
      vendor: 'Swiss Chalet',
      amount: 32.75,
      category: 'Meals and entertainment',
      date: _ts(thisMonth.add(const Duration(days: 7))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Client lunch',
    ),
    ExpenseModel(
      id: 'guest_exp_8',
      userId: 'guest',
      vendor: 'IKEA',
      amount: 234.00,
      category: 'Home Office - Office furnishings',
      date: _ts(thisMonth.add(const Duration(days: 8))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Standing desk mat',
    ),
    ExpenseModel(
      id: 'guest_exp_9',
      userId: 'guest',
      vendor: 'Uber',
      amount: 28.50,
      category: 'Travel (including transportation fees, accommodations, and meals)',
      date: _ts(thisMonth.add(const Duration(days: 9))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Ride to client meeting',
    ),
    ExpenseModel(
      id: 'guest_exp_10',
      userId: 'guest',
      vendor: 'Starbucks',
      amount: 18.25,
      category: 'Meals and entertainment',
      date: _ts(thisMonth.add(const Duration(days: 10))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Team coffee',
    ),
    // Last month expenses
    ExpenseModel(
      id: 'guest_exp_11',
      userId: 'guest',
      vendor: 'Bell Canada',
      amount: 79.99,
      category: 'Home Office - Monitoring and internet',
      date: _ts(lastMonth.add(const Duration(days: 5))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Internet service',
    ),
    ExpenseModel(
      id: 'guest_exp_12',
      userId: 'guest',
      vendor: 'Costco',
      amount: 89.50,
      category: 'Supplies (for example PPT kit etc.)',
      date: _ts(lastMonth.add(const Duration(days: 10))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Office supplies bulk purchase',
    ),
    ExpenseModel(
      id: 'guest_exp_13',
      userId: 'guest',
      vendor: 'Petro-Canada',
      amount: 65.40,
      category: 'Vehicle - Fuel (gasoline, propane, oil)',
      date: _ts(lastMonth.add(const Duration(days: 15))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Gas fill-up',
    ),
    ExpenseModel(
      id: 'guest_exp_14',
      userId: 'guest',
      vendor: 'CPA Ontario',
      amount: 450.00,
      category: 'Legal, accounting, and other professional fees',
      date: _ts(lastMonth.add(const Duration(days: 20))),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: 'Quarterly bookkeeping',
    ),
  ];
}

List<IncomeSourceModel> guestSampleIncomeSources() {
  final ts = _ts(DateTime.now());
  final startDate = _ts(DateTime(DateTime.now().year, 1, 1));

  return [
    IncomeSourceModel(
      id: 'guest_inc_1',
      userId: 'guest',
      name: 'Acme Corp',
      category: 'salary',
      amount: 6500.00,
      frequency: 'monthly',
      isRecurring: true,
      isActive: true,
      taxable: true,
      currency: 'CAD',
      startDate: startDate,
      createdAt: ts,
      updatedAt: ts,
      recurringDate: 1,
      description: 'Full-time consulting contract',
    ),
    IncomeSourceModel(
      id: 'guest_inc_2',
      userId: 'guest',
      name: 'Freelance Projects',
      category: 'freelance',
      amount: 2000.00,
      frequency: 'monthly',
      isRecurring: true,
      isActive: true,
      taxable: true,
      currency: 'CAD',
      startDate: startDate,
      createdAt: ts,
      updatedAt: ts,
      recurringDate: 15,
      description: 'Side consulting work',
    ),
  ];
}

List<BudgetModel> guestSampleBudgets() {
  final ts = _ts(DateTime.now());
  final period = BudgetPeriod(month: DateTime.now().month, year: DateTime.now().year);

  return [
    BudgetModel(
      id: 'guest_bud_1',
      userId: 'guest',
      category: 'Meals and entertainment',
      monthlyLimit: 500.00,
      period: period,
      settings: const BudgetSettings(alertThreshold: 80),
      createdAt: ts,
      updatedAt: ts,
    ),
    BudgetModel(
      id: 'guest_bud_2',
      userId: 'guest',
      category: 'Office expenses',
      monthlyLimit: 300.00,
      period: period,
      settings: const BudgetSettings(alertThreshold: 80),
      createdAt: ts,
      updatedAt: ts,
    ),
    BudgetModel(
      id: 'guest_bud_3',
      userId: 'guest',
      category: 'Vehicle - Fuel (gasoline, propane, oil)',
      monthlyLimit: 200.00,
      period: period,
      settings: const BudgetSettings(alertThreshold: 80),
      createdAt: ts,
      updatedAt: ts,
    ),
  ];
}

List<SavingsGoalModel> guestSampleSavingsGoals() {
  final ts = _ts(DateTime.now());
  final startDate = _ts(DateTime(DateTime.now().year, 1, 1));

  return [
    SavingsGoalModel(
      id: 'guest_sav_1',
      userId: 'guest',
      name: 'Emergency Fund',
      category: 'emergency_fund',
      targetAmount: 15000.00,
      currentAmount: 8200.00,
      monthlyContribution: 500.00,
      status: 'active',
      isActive: true,
      priority: 'high',
      currency: 'CAD',
      startDate: startDate,
      createdAt: ts,
      updatedAt: ts,
      progressPercentage: 54.7,
      monthsToGoal: 14,
      onTrack: true,
      emoji: '\u{1F6E1}\u{FE0F}',
    ),
    SavingsGoalModel(
      id: 'guest_sav_2',
      userId: 'guest',
      name: 'New MacBook Pro',
      category: 'custom',
      targetAmount: 3000.00,
      currentAmount: 1800.00,
      monthlyContribution: 300.00,
      status: 'active',
      isActive: true,
      priority: 'medium',
      currency: 'CAD',
      startDate: startDate,
      createdAt: ts,
      updatedAt: ts,
      progressPercentage: 60.0,
      monthsToGoal: 4,
      onTrack: true,
      emoji: '\u{1F4BB}',
    ),
  ];
}

List<GroupModel> guestSampleGroups() {
  final ts = _ts(DateTime.now());

  return [
    GroupModel(
      id: 'guest_grp_1',
      name: 'Household Expenses',
      createdBy: 'guest',
      createdAt: ts,
      updatedAt: ts,
      settings: const GroupSettings(currency: 'CAD'),
      status: 'active',
      stats: GroupStats(
        memberCount: 3,
        expenseCount: 12,
        totalAmount: 1250.00,
        lastActivityAt: ts,
      ),
      icon: '\u{1F3E0}',
      description: 'Shared household expenses',
    ),
  ];
}
