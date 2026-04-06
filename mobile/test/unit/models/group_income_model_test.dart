import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/group_income_model.dart';

void main() {
  group('GroupIncomeSourceModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields correctly', () async {
      final now = Timestamp.now();
      final startDate = Timestamp.fromDate(DateTime(2025, 1, 1));
      final doc = await firestore.collection('income_sources_group').add({
        'groupId': 'group-1',
        'addedBy': 'user-1',
        'name': 'Consulting Revenue',
        'category': 'freelance',
        'amount': 5000.00,
        'frequency': 'monthly',
        'isRecurring': true,
        'isActive': true,
        'taxable': true,
        'currency': 'CAD',
        'createdAt': now,
        'updatedAt': now,
        'contributedBy': 'user-2',
        'splitType': 'proportional',
        'description': 'Monthly consulting income',
        'netAmount': 4200.00,
        'startDate': startDate,
        'recurringDate': 15,
      });

      final snapshot = await doc.get();
      final income = GroupIncomeSourceModel.fromFirestore(snapshot);

      expect(income.id, doc.id);
      expect(income.groupId, 'group-1');
      expect(income.addedBy, 'user-1');
      expect(income.name, 'Consulting Revenue');
      expect(income.category, 'freelance');
      expect(income.amount, 5000.00);
      expect(income.frequency, 'monthly');
      expect(income.isRecurring, true);
      expect(income.isActive, true);
      expect(income.taxable, true);
      expect(income.currency, 'CAD');
      expect(income.contributedBy, 'user-2');
      expect(income.splitType, 'proportional');
      expect(income.description, 'Monthly consulting income');
      expect(income.netAmount, 4200.00);
      expect(income.startDate, startDate);
      expect(income.recurringDate, 15);
    });

    test('fromFirestore handles missing optional fields with defaults', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('income_sources_group').add({
        'groupId': 'group-1',
        'addedBy': 'user-1',
        'name': 'Side project',
        'amount': 1000,
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final income = GroupIncomeSourceModel.fromFirestore(snapshot);

      expect(income.name, 'Side project');
      expect(income.category, 'other');
      expect(income.frequency, 'monthly');
      expect(income.isRecurring, true);
      expect(income.isActive, true);
      expect(income.taxable, true);
      expect(income.currency, 'CAD');
      expect(income.splitType, 'equal');
      expect(income.contributedBy, isNull);
      expect(income.description, isNull);
      expect(income.netAmount, isNull);
      expect(income.startDate, isNull);
      expect(income.recurringDate, isNull);
    });

    test('amount handles int values from Firestore', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('income_sources_group').add({
        'groupId': 'group-1',
        'addedBy': 'user-1',
        'name': 'Bonus',
        'amount': 2000, // int, not double
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final income = GroupIncomeSourceModel.fromFirestore(snapshot);

      expect(income.amount, 2000.0);
      expect(income.amount, isA<double>());
    });

    test('toFirestore produces correct map', () {
      final now = Timestamp.now();
      final income = GroupIncomeSourceModel(
        id: 'test-id',
        groupId: 'group-1',
        addedBy: 'user-1',
        name: 'Salary',
        category: 'salary',
        amount: 8000.00,
        frequency: 'monthly',
        isRecurring: true,
        isActive: true,
        taxable: true,
        currency: 'CAD',
        createdAt: now,
        updatedAt: now,
      );

      final map = income.toFirestore();

      expect(map['groupId'], 'group-1');
      expect(map['addedBy'], 'user-1');
      expect(map['name'], 'Salary');
      expect(map['amount'], 8000.00);
      expect(map['frequency'], 'monthly');
      expect(map.containsKey('contributedBy'), isFalse);
      expect(map.containsKey('description'), isFalse);
      expect(map.containsKey('netAmount'), isFalse);
      expect(map.containsKey('startDate'), isFalse);
      expect(map.containsKey('recurringDate'), isFalse);
    });

    test('toFirestore includes optional fields when set', () {
      final now = Timestamp.now();
      final income = GroupIncomeSourceModel(
        id: 'test-id',
        groupId: 'group-1',
        addedBy: 'user-1',
        name: 'Salary',
        category: 'salary',
        amount: 8000.00,
        frequency: 'monthly',
        isRecurring: true,
        isActive: true,
        taxable: true,
        currency: 'CAD',
        createdAt: now,
        updatedAt: now,
        contributedBy: 'user-2',
        description: 'Main salary',
        netAmount: 6500.00,
        startDate: now,
        recurringDate: 1,
      );

      final map = income.toFirestore();

      expect(map['contributedBy'], 'user-2');
      expect(map['description'], 'Main salary');
      expect(map['netAmount'], 6500.00);
      expect(map['startDate'], now);
      expect(map['recurringDate'], 1);
    });

    group('frequencyLabel getter', () {
      GroupIncomeSourceModel _makeIncome(String frequency) {
        final now = Timestamp.now();
        return GroupIncomeSourceModel(
          id: 'test',
          groupId: 'g-1',
          addedBy: 'u-1',
          name: 'Test',
          category: 'salary',
          amount: 1000,
          frequency: frequency,
          isRecurring: true,
          isActive: true,
          taxable: true,
          currency: 'CAD',
          createdAt: now,
          updatedAt: now,
        );
      }

      test('returns /mo for monthly', () {
        expect(_makeIncome('monthly').frequencyLabel, '/mo');
      });

      test('returns /2wk for biweekly', () {
        expect(_makeIncome('biweekly').frequencyLabel, '/2wk');
      });

      test('returns /wk for weekly', () {
        expect(_makeIncome('weekly').frequencyLabel, '/wk');
      });

      test('returns /yr for yearly', () {
        expect(_makeIncome('yearly').frequencyLabel, '/yr');
      });

      test('returns one-time for once', () {
        expect(_makeIncome('once').frequencyLabel, 'one-time');
      });

      test('returns empty string for unknown frequency', () {
        expect(_makeIncome('unknown').frequencyLabel, '');
      });
    });

    group('monthlyAmount getter', () {
      GroupIncomeSourceModel _makeIncome(String frequency, double amount) {
        final now = Timestamp.now();
        return GroupIncomeSourceModel(
          id: 'test',
          groupId: 'g-1',
          addedBy: 'u-1',
          name: 'Test',
          category: 'salary',
          amount: amount,
          frequency: frequency,
          isRecurring: true,
          isActive: true,
          taxable: true,
          currency: 'CAD',
          createdAt: now,
          updatedAt: now,
        );
      }

      test('monthly returns the same amount', () {
        expect(_makeIncome('monthly', 5000).monthlyAmount, 5000.0);
      });

      test('biweekly converts correctly (amount * 26 / 12)', () {
        final result = _makeIncome('biweekly', 2000).monthlyAmount;
        expect(result, closeTo(2000 * 26 / 12, 0.01));
      });

      test('weekly converts correctly (amount * 52 / 12)', () {
        final result = _makeIncome('weekly', 1000).monthlyAmount;
        expect(result, closeTo(1000 * 52 / 12, 0.01));
      });

      test('yearly converts correctly (amount / 12)', () {
        final result = _makeIncome('yearly', 60000).monthlyAmount;
        expect(result, closeTo(5000.0, 0.01));
      });

      test('once returns the raw amount (fallback)', () {
        expect(_makeIncome('once', 500).monthlyAmount, 500.0);
      });

      test('unknown frequency returns the raw amount (fallback)', () {
        expect(_makeIncome('unknown', 750).monthlyAmount, 750.0);
      });
    });
  });
}
