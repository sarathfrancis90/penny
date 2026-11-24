import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/income_model.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';

final _june = DateTime(2026, 6, 15);

double _monthly(double amount, String frequency, {DateTime? receivedOn}) {
  return monthlyIncomeAmount(
    amount: amount,
    frequency: frequency,
    receivedOn: receivedOn,
    month: _june,
  );
}

IncomeSourceModel _source(String frequency, double amount, DateTime startDate) {
  final ts = Timestamp.fromDate(startDate);
  return IncomeSourceModel(
    id: frequency,
    userId: 'u1',
    name: frequency,
    category: 'salary',
    amount: amount,
    frequency: frequency,
    isRecurring: frequency != 'once',
    isActive: true,
    taxable: true,
    currency: 'CAD',
    startDate: ts,
    createdAt: ts,
    updatedAt: ts,
  );
}

void main() {
  group('Income calculation logic', () {
    test('monthly frequency returns amount directly', () {
      expect(_monthly(6000, 'monthly'), 6000.0);
    });

    test('biweekly converts to monthly correctly', () {
      expect(_monthly(2000, 'biweekly'), closeTo(4333.33, 0.01));
    });

    test('weekly converts to monthly correctly', () {
      expect(_monthly(500, 'weekly'), closeTo(2166.67, 0.01));
    });

    test('yearly converts to monthly correctly', () {
      expect(_monthly(12000, 'yearly'), 1000.0);
    });

    test('one-time income counts only in the month it was received', () {
      expect(_monthly(1000, 'once', receivedOn: DateTime(2026, 6, 2)), 1000.0);
      expect(_monthly(1000, 'once', receivedOn: DateTime(2026, 5, 31)), 0.0);
      expect(_monthly(1000, 'once', receivedOn: DateTime(2025, 6, 2)), 0.0);
      expect(_monthly(1000, 'once'), 0.0);
    });

    test('total with mixed frequencies calculates correctly', () {
      final total =
          _monthly(6000, 'monthly') +
          _monthly(2000, 'biweekly') +
          _monthly(12000, 'yearly');
      expect(total, closeTo(11333.33, 0.01));
    });
  });

  test('a one-time bonus received last month is not in this month\'s income '
      'and shows only in its own month of the cash flow', () async {
    final now = DateTime.now();
    final lastMonth = DateTime(now.year, now.month - 1, 10);
    final container = ProviderContainer(
      overrides: [
        guestModeProvider.overrideWith((ref) => false),
        allExpensesProvider.overrideWith(
          (ref) => Stream.value(const <ExpenseModel>[]),
        ),
        activeIncomeSourcesProvider.overrideWithValue([
          _source('monthly', 5000, DateTime(2024, 1, 1)),
          _source('once', 1000, lastMonth),
        ]),
      ],
    );
    addTearDown(container.dispose);

    expect(container.read(totalMonthlyIncomeProvider), 5000);
    final cashFlow = container.read(cashFlowProvider);
    expect(cashFlow.map((m) => m.income), [5000, 6000, 5000]);
  });
}
