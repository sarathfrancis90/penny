import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/guest/guest_sample_data.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/dashboard/widgets/cash_flow_chart.dart';

/// Stream all expenses for current user (or sample data in guest mode).
final allExpensesProvider = StreamProvider<List<ExpenseModel>>((ref) {
  if (ref.watch(guestModeProvider)) return Stream.value(guestSampleExpenses());
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
final categoryBreakdownProvider = Provider<List<CategoryBreakdown>>((ref) {
  final expenses = ref.watch(currentMonthExpensesProvider);
  return _computeBreakdown(expenses);
});

// ============================================================
// DASHBOARD FILTERS
// ============================================================

/// Period presets + custom date range.
enum DashboardPeriod {
  thisWeek,
  thisMonth,
  lastMonth,
  threeMonths,
  thisYear,
  custom,
}

final dashboardPeriodProvider =
    StateProvider<DashboardPeriod>((ref) => DashboardPeriod.thisMonth);

/// Custom date range (used when period == custom).
final customDateRangeProvider =
    StateProvider<DateTimeRange?>((ref) => null);

/// Expense type filter.
enum ExpenseTypeFilter { all, personal, group }

/// Full filter state.
class ExpenseFilter {
  const ExpenseFilter({
    this.typeFilter = ExpenseTypeFilter.all,
    this.categoryFilter,
    this.groupIdFilter,
  });

  final ExpenseTypeFilter typeFilter;
  final String? categoryFilter;
  final String? groupIdFilter; // Filter by specific group

  ExpenseFilter copyWith({
    ExpenseTypeFilter? typeFilter,
    String? Function()? categoryFilter,
    String? Function()? groupIdFilter,
  }) {
    return ExpenseFilter(
      typeFilter: typeFilter ?? this.typeFilter,
      categoryFilter:
          categoryFilter != null ? categoryFilter() : this.categoryFilter,
      groupIdFilter:
          groupIdFilter != null ? groupIdFilter() : this.groupIdFilter,
    );
  }
}

final expenseFilterProvider =
    StateProvider<ExpenseFilter>((ref) => const ExpenseFilter());

/// Expenses filtered by period + type + category + group.
final filteredExpensesProvider = Provider<List<ExpenseModel>>((ref) {
  final expenses = ref.watch(allExpensesProvider).valueOrNull ?? [];
  final period = ref.watch(dashboardPeriodProvider);
  final customRange = ref.watch(customDateRangeProvider);
  final filter = ref.watch(expenseFilterProvider);
  final now = DateTime.now();

  // Step 1: filter by period
  final periodFiltered = expenses.where((e) {
    final d = e.date.toDate();
    switch (period) {
      case DashboardPeriod.thisWeek:
        final weekStart = now.subtract(Duration(days: now.weekday - 1));
        return !d.isBefore(DateTime(weekStart.year, weekStart.month, weekStart.day));
      case DashboardPeriod.thisMonth:
        return d.year == now.year && d.month == now.month;
      case DashboardPeriod.lastMonth:
        final lastMonth = DateTime(now.year, now.month - 1);
        return d.year == lastMonth.year && d.month == lastMonth.month;
      case DashboardPeriod.threeMonths:
        final threeMonthsAgo = DateTime(now.year, now.month - 2, 1);
        return !d.isBefore(threeMonthsAgo);
      case DashboardPeriod.thisYear:
        return d.year == now.year;
      case DashboardPeriod.custom:
        if (customRange == null) return true;
        return !d.isBefore(customRange.start) &&
            d.isBefore(customRange.end.add(const Duration(days: 1)));
    }
  }).toList();

  // Step 2: filter by type (personal / group)
  var filtered = periodFiltered.where((e) {
    switch (filter.typeFilter) {
      case ExpenseTypeFilter.all:
        return true;
      case ExpenseTypeFilter.personal:
        return e.expenseType == 'personal';
      case ExpenseTypeFilter.group:
        return e.expenseType == 'group';
    }
  }).toList();

  // Step 3: filter by specific group
  if (filter.groupIdFilter != null) {
    filtered = filtered.where((e) => e.groupId == filter.groupIdFilter).toList();
  }

  // Step 4: filter by category
  if (filter.categoryFilter != null) {
    filtered = filtered.where((e) => e.category == filter.categoryFilter).toList();
  }

  // Sort by date descending
  filtered.sort((a, b) => b.date.toDate().compareTo(a.date.toDate()));

  return filtered;
});

/// Category breakdown derived from filtered expenses.
final filteredCategoryBreakdownProvider = Provider<List<CategoryBreakdown>>((ref) {
  return _computeBreakdown(ref.watch(filteredExpensesProvider));
});

// ============================================================
// HELPERS
// ============================================================

List<CategoryBreakdown> _computeBreakdown(List<ExpenseModel> expenses) {
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
}

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

/// Daily spending totals for the current filter period.
class DailySpending {
  const DailySpending({required this.date, required this.amount});
  final DateTime date;
  final double amount;
}

final dailySpendingProvider = Provider<List<DailySpending>>((ref) {
  final expenses = ref.watch(filteredExpensesProvider);
  final Map<DateTime, double> daily = {};

  for (final e in expenses) {
    final d = e.date.toDate();
    final dateOnly = DateTime(d.year, d.month, d.day);
    daily[dateOnly] = (daily[dateOnly] ?? 0) + e.amount;
  }

  final sorted = daily.entries.toList()
    ..sort((a, b) => a.key.compareTo(b.key));

  return sorted
      .map((e) => DailySpending(date: e.key, amount: e.value))
      .toList();
});

/// Cash flow data for the last 3 months.
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
