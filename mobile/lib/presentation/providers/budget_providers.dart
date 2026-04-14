import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/guest/guest_sample_data.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Current budget period (default: current month).
final budgetPeriodProvider = StateProvider<BudgetPeriod>((ref) {
  return BudgetPeriod.current();
});

/// Stream budgets for current user and selected period (or sample data in guest mode).
final budgetsProvider = StreamProvider<List<BudgetModel>>((ref) {
  if (ref.watch(guestModeProvider)) return Stream.value(guestSampleBudgets());
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  final period = ref.watch(budgetPeriodProvider);
  return ref.watch(budgetRepositoryProvider).watchBudgets(user.uid, period);
});

/// Computed budget usage — joins budgets with current month's expenses.
final budgetUsageProvider = Provider<List<BudgetUsage>>((ref) {
  final budgets = ref.watch(budgetsProvider).valueOrNull ?? [];
  final expenses = ref.watch(currentMonthExpensesProvider);
  if (budgets.isEmpty) return [];
  return ref.watch(budgetRepositoryProvider).calculateUsage(budgets, expenses);
});

/// Total budget limit for the month.
final totalBudgetLimitProvider = Provider<double>((ref) {
  final budgets = ref.watch(budgetsProvider).valueOrNull ?? [];
  return budgets.fold(0.0, (sum, b) => sum + b.monthlyLimit);
});

/// Total spent across all budgeted categories this month.
final totalBudgetSpentProvider = Provider<double>((ref) {
  final usage = ref.watch(budgetUsageProvider);
  return usage.fold(0.0, (sum, u) => sum + u.totalSpent);
});

/// Budget usage for a specific category (used by over-budget warning).
final budgetUsageForCategoryProvider =
    Provider.family<BudgetUsage?, String>((ref, category) {
  final usages = ref.watch(budgetUsageProvider);
  return usages.where((u) => u.category == category).firstOrNull;
});
