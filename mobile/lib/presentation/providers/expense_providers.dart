import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/dashboard/widgets/cash_flow_chart.dart';

/// Stream all expenses for current user.
final allExpensesProvider = StreamProvider<List<ExpenseModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(expenseRepositoryProvider).watchAllExpenses(user.uid);
});

/// Current month's expenses filtered from all expenses.
final currentMonthExpensesProvider = Provider<List<ExpenseModel>>((ref) {
  final expenses = ref.watch(allExpensesProvider).valueOrNull ?? [];
  final now = DateTime.now();
  return expenses.where((e) {
    final d = e.date.toDate();
    return d.year == now.year && d.month == now.month;
  }).toList();
});

/// Last month's expenses.
final lastMonthExpensesProvider = Provider<List<ExpenseModel>>((ref) {
  final expenses = ref.watch(allExpensesProvider).valueOrNull ?? [];
  final now = DateTime.now();
  final lastMonth = DateTime(now.year, now.month - 1);
  return expenses.where((e) {
    final d = e.date.toDate();
    return d.year == lastMonth.year && d.month == lastMonth.month;
  }).toList();
});

/// Total spent this month.
final currentMonthTotalProvider = Provider<double>((ref) {
  final expenses = ref.watch(currentMonthExpensesProvider);
  return expenses.fold(0.0, (sum, e) => sum + e.amount);
});

/// Total spent last month.
final lastMonthTotalProvider = Provider<double>((ref) {
  final expenses = ref.watch(lastMonthExpensesProvider);
  return expenses.fold(0.0, (sum, e) => sum + e.amount);
});

/// Category breakdown for current month.
final categoryBreakdownProvider =
    Provider<List<CategoryBreakdown>>((ref) {
  final expenses = ref.watch(currentMonthExpensesProvider);
  final totals = <String, double>{};

  for (final e in expenses) {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount;
  }

  final total = totals.values.fold(0.0, (a, b) => a + b);
  final sorted = totals.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));

  return sorted
      .map((e) => CategoryBreakdown(
            category: e.key,
            amount: e.value,
            percentage: total > 0 ? (e.value / total * 100) : 0,
          ))
      .toList();
});

/// Selected period for dashboard.
enum DashboardPeriod { thisMonth, lastMonth, threeMonths }

final dashboardPeriodProvider =
    StateProvider<DashboardPeriod>((ref) => DashboardPeriod.thisMonth);

class CategoryBreakdown {
  const CategoryBreakdown({
    required this.category,
    required this.amount,
    required this.percentage,
  });

  final String category;
  final double amount;
  final double percentage;
}

/// Cash flow data for the last 3 months (expenses vs income).
final cashFlowProvider = Provider<List<MonthCashFlow>>((ref) {
  final expenses = ref.watch(allExpensesProvider).valueOrNull ?? [];
  final monthlyIncome = ref.watch(totalMonthlyIncomeProvider);

  final now = DateTime.now();
  final months = <MonthCashFlow>[];

  for (var i = 2; i >= 0; i--) {
    final target = DateTime(now.year, now.month - i);
    final label = DateFormat.MMM().format(target);

    final monthExpenses = expenses.where((e) {
      final d = e.date.toDate();
      return d.year == target.year && d.month == target.month;
    });
    final totalExpenses = monthExpenses.fold(0.0, (sum, e) => sum + e.amount);

    months.add(MonthCashFlow(
      monthLabel: label,
      income: monthlyIncome,
      expenses: totalExpenses,
    ));
  }

  return months;
});

/// Filter state for the dashboard expense list.
enum ExpenseTypeFilter { all, personal, group }

class ExpenseFilter {
  const ExpenseFilter({
    this.typeFilter = ExpenseTypeFilter.all,
    this.categoryFilter,
  });

  final ExpenseTypeFilter typeFilter;
  final String? categoryFilter;

  ExpenseFilter copyWith({
    ExpenseTypeFilter? typeFilter,
    String? Function()? categoryFilter,
  }) {
    return ExpenseFilter(
      typeFilter: typeFilter ?? this.typeFilter,
      categoryFilter:
          categoryFilter != null ? categoryFilter() : this.categoryFilter,
    );
  }
}

final expenseFilterProvider =
    StateProvider<ExpenseFilter>((ref) => const ExpenseFilter());

/// Expenses filtered by the dashboard period, then by the expense filter.
final filteredExpensesProvider = Provider<List<ExpenseModel>>((ref) {
  final expenses = ref.watch(allExpensesProvider).valueOrNull ?? [];
  final period = ref.watch(dashboardPeriodProvider);
  final filter = ref.watch(expenseFilterProvider);
  final now = DateTime.now();

  // Step 1: filter by period
  final periodFiltered = expenses.where((e) {
    final d = e.date.toDate();
    switch (period) {
      case DashboardPeriod.thisMonth:
        return d.year == now.year && d.month == now.month;
      case DashboardPeriod.lastMonth:
        final lastMonth = DateTime(now.year, now.month - 1);
        return d.year == lastMonth.year && d.month == lastMonth.month;
      case DashboardPeriod.threeMonths:
        final threeMonthsAgo = DateTime(now.year, now.month - 2, 1);
        return !d.isBefore(threeMonthsAgo);
    }
  }).toList();

  // Step 2: filter by type (personal / group)
  final typeFiltered = periodFiltered.where((e) {
    switch (filter.typeFilter) {
      case ExpenseTypeFilter.all:
        return true;
      case ExpenseTypeFilter.personal:
        return e.expenseType == 'personal';
      case ExpenseTypeFilter.group:
        return e.expenseType == 'group';
    }
  }).toList();

  // Step 3: filter by category
  final categoryFiltered = filter.categoryFilter == null
      ? typeFiltered
      : typeFiltered.where((e) => e.category == filter.categoryFilter).toList();

  // Sort by date descending
  categoryFiltered.sort((a, b) => b.date.toDate().compareTo(a.date.toDate()));

  return categoryFiltered;
});

/// Category breakdown derived from filtered expenses (respects period + filters).
final filteredCategoryBreakdownProvider =
    Provider<List<CategoryBreakdown>>((ref) {
  final expenses = ref.watch(filteredExpensesProvider);
  final totals = <String, double>{};

  for (final e in expenses) {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount;
  }

  final total = totals.values.fold(0.0, (a, b) => a + b);
  final sorted = totals.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));

  return sorted
      .map((e) => CategoryBreakdown(
            category: e.key,
            amount: e.value,
            percentage: total > 0 ? (e.value / total * 100) : 0,
          ))
      .toList();
});
