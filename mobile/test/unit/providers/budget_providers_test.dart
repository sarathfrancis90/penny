import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';

void main() {
  group('Budget Providers', () {
    test('budgetPeriodProvider defaults to current month', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final period = container.read(budgetPeriodProvider);
      final now = DateTime.now();
      expect(period.month, now.month);
      expect(period.year, now.year);
    });

    test('budgetPeriodProvider can be changed to previous month', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(budgetPeriodProvider.notifier).state =
          const BudgetPeriod(month: 3, year: 2026);

      final period = container.read(budgetPeriodProvider);
      expect(period.month, 3);
      expect(period.year, 2026);
    });
  });

  group('BudgetUsage calculation edge cases', () {
    test('100% usage is over status', () {
      expect(BudgetUsage.computeStatus(100), BudgetStatus.over);
    });

    test('exactly 75% is warning', () {
      expect(BudgetUsage.computeStatus(75), BudgetStatus.warning);
    });

    test('exactly 90% is critical', () {
      expect(BudgetUsage.computeStatus(90), BudgetStatus.critical);
    });

    test('0% is safe', () {
      expect(BudgetUsage.computeStatus(0), BudgetStatus.safe);
    });

    test('negative percentage (impossible but defensive) is safe', () {
      expect(BudgetUsage.computeStatus(-5), BudgetStatus.safe);
    });

    test('200% over budget is over', () {
      expect(BudgetUsage.computeStatus(200), BudgetStatus.over);
    });
  });
}
