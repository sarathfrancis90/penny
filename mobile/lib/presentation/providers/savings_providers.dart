import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/guest/guest_sample_data.dart';
import 'package:penny_mobile/data/models/savings_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream savings goals for current user (or sample data in guest mode).
final savingsGoalsProvider = StreamProvider<List<SavingsGoalModel>>((ref) {
  if (ref.watch(guestModeProvider)) return Stream.value(guestSampleSavingsGoals());
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(savingsRepositoryProvider).watchSavingsGoals(user.uid);
});

/// Total saved across all goals.
final totalSavedProvider = Provider<double>((ref) {
  final goals = ref.watch(savingsGoalsProvider).valueOrNull ?? [];
  return goals.fold(0.0, (sum, g) => sum + g.currentAmount);
});

/// Total target across all goals.
final totalTargetProvider = Provider<double>((ref) {
  final goals = ref.watch(savingsGoalsProvider).valueOrNull ?? [];
  return goals.fold(0.0, (sum, g) => sum + g.targetAmount);
});
