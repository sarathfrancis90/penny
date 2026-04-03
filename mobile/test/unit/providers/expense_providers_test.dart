import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';

void main() {
  group('Expense Providers', () {
    test('dashboardPeriodProvider defaults to thisMonth', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final period = container.read(dashboardPeriodProvider);
      expect(period, DashboardPeriod.thisMonth);
    });

    test('dashboardPeriodProvider can be changed', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(dashboardPeriodProvider.notifier).state =
          DashboardPeriod.lastMonth;

      final period = container.read(dashboardPeriodProvider);
      expect(period, DashboardPeriod.lastMonth);
    });

    test('CategoryBreakdown correctly computes percentage', () {
      final breakdown = CategoryBreakdown(
        category: 'Meals and entertainment',
        amount: 50.0,
        percentage: 50.0,
      );

      expect(breakdown.category, 'Meals and entertainment');
      expect(breakdown.amount, 50.0);
      expect(breakdown.percentage, 50.0);
    });
  });
}
