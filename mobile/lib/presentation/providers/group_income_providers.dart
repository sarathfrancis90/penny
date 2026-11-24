import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/group_income_model.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

/// Stream all income sources for a specific group.
final groupIncomeSourcesProvider = StreamProvider.autoDispose
    .family<List<GroupIncomeSourceModel>, String>((ref, groupId) {
      if (keepForCurrentSession(ref) == null) return const Stream.empty();
      return ref
          .watch(groupIncomeRepositoryProvider)
          .watchGroupIncomeSources(groupId);
    });

/// Total monthly income for a group (computed from active sources).
final totalGroupMonthlyIncomeProvider = Provider.autoDispose
    .family<double, String>((ref, groupId) {
      final sources =
          ref.watch(groupIncomeSourcesProvider(groupId)).valueOrNull ?? [];
      final now = DateTime.now();
      return sources.fold(0.0, (sum, s) {
        return sum +
            monthlyIncomeAmount(
              amount: s.amount,
              frequency: s.frequency,
              receivedOn: (s.startDate ?? s.createdAt).toDate(),
              month: now,
            );
      });
    });
