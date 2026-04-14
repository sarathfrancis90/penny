import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/repositories/group_budget_repository.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';

/// Group budget repository provider.
final groupBudgetRepositoryProvider = Provider<GroupBudgetRepository>((ref) {
  return GroupBudgetRepository();
});

/// Stream group budgets for a group (current period).
final groupBudgetsProvider =
    StreamProvider.family<List<GroupBudgetModel>, String>((ref, groupId) {
  final period = ref.watch(budgetPeriodProvider);
  return ref.watch(groupBudgetRepositoryProvider).watchGroupBudgets(groupId, period);
});

/// Total group budget limit for the month.
final totalGroupBudgetLimitProvider =
    Provider.family<double, String>((ref, groupId) {
  final budgets = ref.watch(groupBudgetsProvider(groupId)).valueOrNull ?? [];
  return budgets.fold(0.0, (sum, b) => sum + b.monthlyLimit);
});
