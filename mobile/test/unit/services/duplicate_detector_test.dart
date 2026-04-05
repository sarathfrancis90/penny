import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/services/duplicate_detector.dart';

void main() {
  group('DuplicateDetector', () {
    late FakeFirebaseFirestore firestore;
    late DuplicateDetector detector;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      detector = DuplicateDetector(firestore: firestore);
    });

    test('returns null when no duplicates exist', () async {
      final result = await detector.checkForDuplicate(
        vendor: 'New Restaurant',
        amount: 25.00,
        date: DateTime.now(),
        userId: 'user-1',
      );

      expect(result, isNull);
    });

    test('detects exact duplicate (same vendor, amount, date)', () async {
      final now = DateTime.now();

      // Seed existing expense
      await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Tim Hortons',
        'amount': 14.50,
        'category': 'Meals and entertainment',
        'date': Timestamp.fromDate(DateTime(now.year, now.month, now.day, 12)),
        'expenseType': 'personal',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      });

      final result = await detector.checkForDuplicate(
        vendor: 'Tim Hortons',
        amount: 14.50,
        date: now,
        userId: 'user-1',
      );

      expect(result, isNotNull);
      expect(result!.matchType, DuplicateMatchType.exact);
      expect(result.existingExpense.vendor, 'Tim Hortons');
    });

    test('detects similar amount (within 5%)', () async {
      final now = DateTime.now();

      await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Starbucks',
        'amount': 10.00,
        'category': 'Meals and entertainment',
        'date': Timestamp.fromDate(DateTime(now.year, now.month, now.day, 12)),
        'expenseType': 'personal',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      });

      // 10.45 is within 5% of 10.00
      final result = await detector.checkForDuplicate(
        vendor: 'Starbucks',
        amount: 10.45,
        date: now,
        userId: 'user-1',
      );

      expect(result, isNotNull);
      expect(result!.matchType, DuplicateMatchType.similar);
    });

    test('does NOT match different vendor', () async {
      final now = DateTime.now();

      await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'McDonalds',
        'amount': 14.50,
        'category': 'Meals and entertainment',
        'date': Timestamp.fromDate(DateTime(now.year, now.month, now.day, 12)),
        'expenseType': 'personal',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      });

      final result = await detector.checkForDuplicate(
        vendor: 'Tim Hortons',
        amount: 14.50,
        date: now,
        userId: 'user-1',
      );

      expect(result, isNull);
    });

    test('detects group duplicate from different user', () async {
      final now = DateTime.now();

      // User-2 already added this expense to the group
      await firestore.collection('expenses').add({
        'userId': 'user-2',
        'vendor': 'Costco',
        'amount': 150.00,
        'category': 'Groceries',
        'date': Timestamp.fromDate(DateTime(now.year, now.month, now.day, 12)),
        'expenseType': 'group',
        'groupId': 'family-group',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      });

      // User-1 tries to add the same expense to the same group
      final result = await detector.checkForDuplicate(
        vendor: 'Costco',
        amount: 150.00,
        date: now,
        userId: 'user-1',
        groupId: 'family-group',
      );

      expect(result, isNotNull);
      expect(result!.matchType, DuplicateMatchType.exact);
      expect(result.warningMessage, contains('group member'));
    });

    test('case-insensitive vendor matching', () async {
      final now = DateTime.now();

      await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'TIM HORTONS',
        'amount': 14.50,
        'category': 'Meals and entertainment',
        'date': Timestamp.fromDate(DateTime(now.year, now.month, now.day, 12)),
        'expenseType': 'personal',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      });

      final result = await detector.checkForDuplicate(
        vendor: 'tim hortons',
        amount: 14.50,
        date: now,
        userId: 'user-1',
      );

      expect(result, isNotNull);
    });

    test('warningMessage for personal duplicate', () {
      final result = DuplicateResult(
        existingExpense: _createMockExpense('Tim Hortons', 14.50, 'user-1'),
        matchType: DuplicateMatchType.exact,
        addedBy: 'user-1',
      );

      expect(result.warningMessage, contains('You already have'));
      expect(result.warningMessage, contains('14.50'));
      expect(result.warningMessage, contains('Tim Hortons'));
    });

    test('warningMessage for group duplicate by another member', () {
      final result = DuplicateResult(
        existingExpense: _createMockExpense('Costco', 150.00, 'user-2'),
        matchType: DuplicateMatchType.exact,
        addedBy: 'user-2',
        requestingUserId: 'user-1',
      );

      expect(result.warningMessage, contains('group member'));
    });
  });
}

ExpenseModel _createMockExpense(String vendor, double amount, String userId) {
  final now = Timestamp.now();
  return ExpenseModel(
    id: 'mock-id',
    userId: userId,
    vendor: vendor,
    amount: amount,
    category: 'Meals and entertainment',
    date: now,
    expenseType: 'personal',
    createdAt: now,
    updatedAt: now,
  );
}
