import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/guest/guest_sample_data.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

/// Clock that decides which month is "current". Overridden in tests.
final budgetClockProvider = Provider<DateTime Function()>(
  (ref) => DateTime.now,
);

/// Selected budget period (default: current month).
///
/// The app can stay open across a month change, so while the current month
/// is the one selected this follows the calendar instead of keeping the
/// month the app was started in.
final budgetPeriodProvider = StateProvider<BudgetPeriod>((ref) {
  final clock = ref.watch(budgetClockProvider);
  BudgetPeriod thisMonth() {
    final now = clock();
    return BudgetPeriod(month: now.month, year: now.year);
  }

  final initial = thisMonth();
  final timer = Timer.periodic(const Duration(minutes: 1), (_) {
    if (ref.controller.state == initial && thisMonth() != initial) {
      ref.invalidateSelf();
    }
  });
  ref.onDispose(timer.cancel);
  return initial;
});

/// Stream budgets for current user and selected period (or sample data in guest mode).
final budgetsProvider = StreamProvider.autoDispose<List<BudgetModel>>((ref) {
  keepForCurrentSession(ref);
  if (ref.watch(guestModeProvider)) return Stream.value(guestSampleBudgets());
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  final period = ref.watch(budgetPeriodProvider);
  return ref.watch(budgetRepositoryProvider).watchBudgets(user.uid, period);
});

/// Expenses dated inside the selected budget period.
final budgetPeriodExpensesProvider = Provider.autoDispose<List<ExpenseModel>>((
  ref,
) {
  final period = ref.watch(budgetPeriodProvider);
  final expenses = ref.watch(allExpensesProvider).valueOrNull ?? [];
  return expenses.where((e) {
    final d = e.date.toDate();
    return d.year == period.year && d.month == period.month;
  }).toList();
});

/// Computed budget usage — joins budgets with the selected period's expenses.
final budgetUsageProvider = Provider.autoDispose<List<BudgetUsage>>((ref) {
  final budgets = ref.watch(budgetsProvider).valueOrNull ?? [];
  final expenses = ref.watch(budgetPeriodExpensesProvider);
  if (budgets.isEmpty) return [];
  return ref.watch(budgetRepositoryProvider).calculateUsage(budgets, expenses);
});

/// Total budget limit for the month.
final totalBudgetLimitProvider = Provider.autoDispose<double>((ref) {
  final budgets = ref.watch(budgetsProvider).valueOrNull ?? [];
  return budgets.fold(0.0, (sum, b) => sum + b.monthlyLimit);
});

/// Total spent across all budgeted categories this month.
final totalBudgetSpentProvider = Provider.autoDispose<double>((ref) {
  final usage = ref.watch(budgetUsageProvider);
  return usage.fold(0.0, (sum, u) => sum + u.totalSpent);
});

/// Budget usage for a specific category (used by over-budget warning).
final budgetUsageForCategoryProvider = Provider.autoDispose
    .family<BudgetUsage?, String>((ref, category) {
      final usages = ref.watch(budgetUsageProvider);
      return usages.where((u) => u.category == category).firstOrNull;
    });
