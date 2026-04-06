import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/group_savings_model.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream savings goals for a specific group.
final groupSavingsGoalsProvider =
    StreamProvider.family<List<GroupSavingsGoalModel>, String>(
        (ref, groupId) {
  return ref
      .watch(groupSavingsRepositoryProvider)
      .watchGroupSavingsGoals(groupId);
});

/// Total saved across all group goals.
final groupTotalSavedProvider =
    Provider.family<double, String>((ref, groupId) {
  final goals =
      ref.watch(groupSavingsGoalsProvider(groupId)).valueOrNull ?? [];
  return goals.fold(0.0, (sum, g) => sum + g.currentAmount);
});

/// Total target across all group goals.
final groupTotalTargetProvider =
    Provider.family<double, String>((ref, groupId) {
  final goals =
      ref.watch(groupSavingsGoalsProvider(groupId)).valueOrNull ?? [];
  return goals.fold(0.0, (sum, g) => sum + g.targetAmount);
});
