import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/income_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream all income sources for current user.
final incomeSourcesProvider = StreamProvider<List<IncomeSourceModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(incomeRepositoryProvider).watchIncomeSources(user.uid);
});

/// Active income sources only.
final activeIncomeSourcesProvider = Provider<List<IncomeSourceModel>>((ref) {
  final sources = ref.watch(incomeSourcesProvider).valueOrNull ?? [];
  return sources.where((s) => s.isActive).toList();
});

/// Total monthly income from active sources.
final totalMonthlyIncomeProvider = Provider<double>((ref) {
  final sources = ref.watch(activeIncomeSourcesProvider);
  return sources.fold(0.0, (sum, s) {
    return sum + switch (s.frequency) {
      'monthly' => s.amount,
      'biweekly' => s.amount * 26 / 12,
      'weekly' => s.amount * 52 / 12,
      'yearly' => s.amount / 12,
      _ => s.amount,
    };
  });
});
