import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/budget_model.dart';

void main() {
  group('BudgetModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('budgets_personal').add({
        'userId': 'user-1',
        'category': 'Meals and entertainment',
        'monthlyLimit': 300,
        'period': {'month': 4, 'year': 2026},
        'settings': {
          'rollover': false,
          'alertThreshold': 80,
          'notificationsEnabled': true,
        },
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final budget = BudgetModel.fromFirestore(snapshot);

      expect(budget.category, 'Meals and entertainment');
      expect(budget.monthlyLimit, 300.0);
      expect(budget.period.month, 4);
      expect(budget.period.year, 2026);
      expect(budget.settings.rollover, false);
      expect(budget.settings.alertThreshold, 80);
    });

    test('BudgetPeriod.current returns current month/year', () {
      final period = BudgetPeriod.current();
      final now = DateTime.now();
      expect(period.month, now.month);
      expect(period.year, now.year);
    });

    test('BudgetPeriod equality works', () {
      const a = BudgetPeriod(month: 4, year: 2026);
      const b = BudgetPeriod(month: 4, year: 2026);
      const c = BudgetPeriod(month: 5, year: 2026);
      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });

    test('BudgetUsage.computeStatus returns correct status', () {
      expect(BudgetUsage.computeStatus(50), BudgetStatus.safe);
      expect(BudgetUsage.computeStatus(74), BudgetStatus.safe);
      expect(BudgetUsage.computeStatus(75), BudgetStatus.warning);
      expect(BudgetUsage.computeStatus(89), BudgetStatus.warning);
      expect(BudgetUsage.computeStatus(90), BudgetStatus.critical);
      expect(BudgetUsage.computeStatus(99), BudgetStatus.critical);
      expect(BudgetUsage.computeStatus(100), BudgetStatus.over);
      expect(BudgetUsage.computeStatus(150), BudgetStatus.over);
    });
  });
}
