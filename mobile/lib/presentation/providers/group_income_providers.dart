import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/group_income_model.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream all income sources for a specific group.
final groupIncomeSourcesProvider =
    StreamProvider.family<List<GroupIncomeSourceModel>, String>(
        (ref, groupId) {
  return ref
      .watch(groupIncomeRepositoryProvider)
      .watchGroupIncomeSources(groupId);
});

/// Total monthly income for a group (computed from active sources).
final totalGroupMonthlyIncomeProvider =
    Provider.family<double, String>((ref, groupId) {
  final sources =
      ref.watch(groupIncomeSourcesProvider(groupId)).valueOrNull ?? [];
  return sources.fold(0.0, (sum, s) => sum + s.monthlyAmount);
});
