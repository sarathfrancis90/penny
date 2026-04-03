import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Income calculation logic', () {
    test('monthly frequency returns amount directly', () {
      expect(_monthlyEquivalent(6000, 'monthly'), 6000.0);
    });

    test('biweekly converts to monthly correctly', () {
      // biweekly = amount * 26 / 12
      final result = _monthlyEquivalent(2000, 'biweekly');
      expect(result, closeTo(4333.33, 0.01));
    });

    test('weekly converts to monthly correctly', () {
      // weekly = amount * 52 / 12
      final result = _monthlyEquivalent(500, 'weekly');
      expect(result, closeTo(2166.67, 0.01));
    });

    test('yearly converts to monthly correctly', () {
      // yearly = amount / 12
      expect(_monthlyEquivalent(12000, 'yearly'), 1000.0);
    });

    test('once returns amount as-is', () {
      expect(_monthlyEquivalent(1000, 'once'), 1000.0);
    });

    test('total with mixed frequencies calculates correctly', () {
      // salary: 6000/mo + freelance: 2000 biweekly + bonus: 12000/yr
      final total = _monthlyEquivalent(6000, 'monthly') +
          _monthlyEquivalent(2000, 'biweekly') +
          _monthlyEquivalent(12000, 'yearly');
      // 6000 + 4333.33 + 1000 = 11333.33
      expect(total, closeTo(11333.33, 0.01));
    });
  });
}

/// Mirror of totalMonthlyIncomeProvider logic for testing.
double _monthlyEquivalent(double amount, String frequency) {
  return switch (frequency) {
    'monthly' => amount,
    'biweekly' => amount * 26 / 12,
    'weekly' => amount * 52 / 12,
    'yearly' => amount / 12,
    _ => amount,
  };
}
