import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';
import 'package:penny_mobile/presentation/widgets/success_overlay.dart';

/// Clears on-screen choices that belong to one user (dashboard period,
/// custom range, filters, selected budget month), any "saved" confirmation
/// still showing, and the in-memory image cache whenever a different user — or nobody — is signed in, so the next
/// person on the device does not inherit them.
///
/// The cached data itself (expenses, groups, notifications, ...) is dropped
/// by each provider through [keepForCurrentSession].
///
/// Kept alive by the router.
final sessionResetProvider = Provider<void>((ref) {
  ref.listen<String?>(currentUserIdProvider, (previous, next) {
    if (previous == next) return;
    ref.invalidate(expenseFilterProvider);
    ref.invalidate(dashboardPeriodProvider);
    ref.invalidate(customDateRangeProvider);
    ref.invalidate(budgetPeriodProvider);
    ref.read(clearImageCacheProvider)();
    SuccessOverlay.dismissAll();
  });
});
