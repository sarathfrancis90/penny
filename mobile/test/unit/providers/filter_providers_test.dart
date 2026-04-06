import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';

void main() {
  group('ExpenseFilter', () {
    group('constructor defaults', () {
      test('defaults to all type filter', () {
        const filter = ExpenseFilter();
        expect(filter.typeFilter, ExpenseTypeFilter.all);
      });

      test('defaults to null categoryFilter', () {
        const filter = ExpenseFilter();
        expect(filter.categoryFilter, isNull);
      });

      test('defaults to null groupIdFilter', () {
        const filter = ExpenseFilter();
        expect(filter.groupIdFilter, isNull);
      });
    });

    group('copyWith', () {
      test('changes typeFilter only', () {
        const original = ExpenseFilter(
          typeFilter: ExpenseTypeFilter.all,
          categoryFilter: 'Meals and entertainment',
          groupIdFilter: 'group-1',
        );

        final updated =
            original.copyWith(typeFilter: ExpenseTypeFilter.personal);

        expect(updated.typeFilter, ExpenseTypeFilter.personal);
        expect(updated.categoryFilter, 'Meals and entertainment');
        expect(updated.groupIdFilter, 'group-1');
      });

      test('changes categoryFilter only', () {
        const original = ExpenseFilter(
          typeFilter: ExpenseTypeFilter.personal,
          categoryFilter: 'Meals and entertainment',
          groupIdFilter: 'group-1',
        );

        final updated =
            original.copyWith(categoryFilter: () => 'Office expenses');

        expect(updated.typeFilter, ExpenseTypeFilter.personal);
        expect(updated.categoryFilter, 'Office expenses');
        expect(updated.groupIdFilter, 'group-1');
      });

      test('clears categoryFilter to null', () {
        const original = ExpenseFilter(
          categoryFilter: 'Meals and entertainment',
        );

        final updated = original.copyWith(categoryFilter: () => null);

        expect(updated.categoryFilter, isNull);
      });

      test('changes groupIdFilter only', () {
        const original = ExpenseFilter(
          typeFilter: ExpenseTypeFilter.group,
          groupIdFilter: 'group-1',
        );

        final updated = original.copyWith(groupIdFilter: () => 'group-2');

        expect(updated.typeFilter, ExpenseTypeFilter.group);
        expect(updated.groupIdFilter, 'group-2');
      });

      test('clears groupIdFilter to null', () {
        const original = ExpenseFilter(groupIdFilter: 'group-1');

        final updated = original.copyWith(groupIdFilter: () => null);

        expect(updated.groupIdFilter, isNull);
      });

      test('changes all fields at once', () {
        const original = ExpenseFilter();

        final updated = original.copyWith(
          typeFilter: ExpenseTypeFilter.group,
          categoryFilter: () => 'Groceries',
          groupIdFilter: () => 'group-1',
        );

        expect(updated.typeFilter, ExpenseTypeFilter.group);
        expect(updated.categoryFilter, 'Groceries');
        expect(updated.groupIdFilter, 'group-1');
      });

      test('returns unchanged filter when no params provided', () {
        const original = ExpenseFilter(
          typeFilter: ExpenseTypeFilter.personal,
          categoryFilter: 'Telephone',
          groupIdFilter: 'group-5',
        );

        final updated = original.copyWith();

        expect(updated.typeFilter, ExpenseTypeFilter.personal);
        expect(updated.categoryFilter, 'Telephone');
        expect(updated.groupIdFilter, 'group-5');
      });
    });
  });

  group('DashboardPeriod', () {
    test('has 6 values', () {
      expect(DashboardPeriod.values.length, 6);
    });

    test('contains all expected values', () {
      expect(DashboardPeriod.values, contains(DashboardPeriod.thisWeek));
      expect(DashboardPeriod.values, contains(DashboardPeriod.thisMonth));
      expect(DashboardPeriod.values, contains(DashboardPeriod.lastMonth));
      expect(
          DashboardPeriod.values, contains(DashboardPeriod.threeMonths));
      expect(DashboardPeriod.values, contains(DashboardPeriod.thisYear));
      expect(DashboardPeriod.values, contains(DashboardPeriod.custom));
    });
  });

  group('ExpenseTypeFilter', () {
    test('has 3 values', () {
      expect(ExpenseTypeFilter.values.length, 3);
    });

    test('contains all, personal, group', () {
      expect(ExpenseTypeFilter.values, contains(ExpenseTypeFilter.all));
      expect(
          ExpenseTypeFilter.values, contains(ExpenseTypeFilter.personal));
      expect(ExpenseTypeFilter.values, contains(ExpenseTypeFilter.group));
    });
  });

  group('CategoryBreakdown', () {
    test('stores fields correctly', () {
      final breakdown = CategoryBreakdown(
        category: 'Meals and entertainment',
        amount: 250.0,
        percentage: 45.5,
      );

      expect(breakdown.category, 'Meals and entertainment');
      expect(breakdown.amount, 250.0);
      expect(breakdown.percentage, 45.5);
    });

    test('handles zero amount', () {
      final breakdown = CategoryBreakdown(
        category: 'Office expenses',
        amount: 0.0,
        percentage: 0.0,
      );

      expect(breakdown.amount, 0.0);
      expect(breakdown.percentage, 0.0);
    });

    test('handles 100% percentage', () {
      final breakdown = CategoryBreakdown(
        category: 'Groceries',
        amount: 500.0,
        percentage: 100.0,
      );

      expect(breakdown.percentage, 100.0);
    });
  });
}
