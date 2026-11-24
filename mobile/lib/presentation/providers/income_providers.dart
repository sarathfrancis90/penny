import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/income_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

/// Stream all income sources for current user.
/// Income is locked in guest mode — returns empty list.
final incomeSourcesProvider =
    StreamProvider.autoDispose<List<IncomeSourceModel>>((ref) {
      keepForCurrentSession(ref);
      if (ref.watch(guestModeProvider)) return Stream.value([]);
      final user = ref.watch(currentUserProvider);
      if (user == null) return const Stream.empty();
      return ref.watch(incomeRepositoryProvider).watchIncomeSources(user.uid);
    });

/// Active income sources only.
final activeIncomeSourcesProvider =
    Provider.autoDispose<List<IncomeSourceModel>>((ref) {
      final sources = ref.watch(incomeSourcesProvider).valueOrNull ?? [];
      return sources.where((s) => s.isActive).toList();
    });

/// What an income source adds to [month]'s income.
///
/// Recurring sources are converted to a monthly amount. A one-time source
/// counts only in the month it was received ([receivedOn]) — never as income
/// that repeats every month.
double monthlyIncomeAmount({
  required double amount,
  required String frequency,
  required DateTime? receivedOn,
  required DateTime month,
}) {
  return switch (frequency) {
    'monthly' => amount,
    'biweekly' => amount * 26 / 12,
    'weekly' => amount * 52 / 12,
    'yearly' => amount / 12,
    'once' =>
      receivedOn != null &&
              receivedOn.year == month.year &&
              receivedOn.month == month.month
          ? amount
          : 0,
    _ => amount,
  };
}

/// Total income from [sources] for [month].
double totalIncomeForMonth(List<IncomeSourceModel> sources, DateTime month) {
  return sources.fold(0.0, (sum, s) {
    return sum +
        monthlyIncomeAmount(
          amount: s.amount,
          frequency: s.frequency,
          receivedOn: s.startDate.toDate(),
          month: month,
        );
  });
}

/// Total income for the current month from active sources.
final totalMonthlyIncomeProvider = Provider.autoDispose<double>((ref) {
  return totalIncomeForMonth(
    ref.watch(activeIncomeSourcesProvider),
    DateTime.now(),
  );
});
