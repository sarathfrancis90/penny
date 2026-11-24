import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';

/// Reloads the expense data after a successful create, edit, delete or undo.
///
/// Pass `ref.invalidate` (or `container.invalidate`). The dashboard lists,
/// totals, search results and budget usage are all derived from
/// [allExpensesProvider], so they follow. For a group expense pass its
/// [groupId] so that group's expenses, stats and activity reload too.
void refreshExpenseData(
  void Function(ProviderOrFamily provider) invalidate, {
  String? groupId,
}) {
  invalidate(allExpensesProvider);
  if (groupId == null) return;
  invalidate(groupExpensesProvider(groupId));
  invalidate(pendingGroupExpensesProvider(groupId));
  invalidate(groupActivitiesProvider(groupId));
  invalidate(groupByIdProvider(groupId));
  invalidate(userGroupsProvider);
}
