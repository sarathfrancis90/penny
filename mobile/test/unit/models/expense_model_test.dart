import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

void main() {
  group('ExpenseModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields correctly', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Tim Hortons',
        'amount': 14.50,
        'category': 'Meals and entertainment',
        'date': now,
        'description': 'Lunch',
        'expenseType': 'personal',
        'groupId': null,
        'receiptUrl': 'https://example.com/receipt.jpg',
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
      });

      final snapshot = await doc.get();
      final expense = ExpenseModel.fromFirestore(snapshot);

      expect(expense.id, doc.id);
      expect(expense.userId, 'user-1');
      expect(expense.vendor, 'Tim Hortons');
      expect(expense.amount, 14.50);
      expect(expense.category, 'Meals and entertainment');
      expect(expense.expenseType, 'personal');
      expect(expense.description, 'Lunch');
      expect(expense.receiptUrl, 'https://example.com/receipt.jpg');
      expect(expense.groupId, isNull);
    });

    test('fromFirestore handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Staples',
        'amount': 45,
        'category': 'Office expenses',
        'date': now,
        'expenseType': 'personal',
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final expense = ExpenseModel.fromFirestore(snapshot);

      expect(expense.vendor, 'Staples');
      expect(expense.amount, 45.0);
      expect(expense.description, isNull);
      expect(expense.receiptUrl, isNull);
      expect(expense.notes, isNull);
      expect(expense.groupId, isNull);
    });

    test('toFirestore produces correct map', () async {
      final now = Timestamp.now();
      final expense = ExpenseModel(
        id: 'test-id',
        userId: 'user-1',
        vendor: 'Shell',
        amount: 52.00,
        category: 'Vehicle - Fuel (gasoline, propane, oil)',
        date: now,
        expenseType: 'personal',
        createdAt: now,
        updatedAt: now,
        description: 'Gas',
      );

      final map = expense.toFirestore();

      expect(map['vendor'], 'Shell');
      expect(map['amount'], 52.00);
      expect(map['category'], 'Vehicle - Fuel (gasoline, propane, oil)');
      expect(map['expenseType'], 'personal');
      expect(map['description'], 'Gas');
      expect(map['syncStatus'], 'synced');
      expect(map.containsKey('id'), isFalse); // id is not stored in doc
    });

    test('amount handles int values from Firestore', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Store',
        'amount': 100, // int, not double
        'category': 'Office expenses',
        'date': now,
        'expenseType': 'personal',
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final expense = ExpenseModel.fromFirestore(snapshot);

      expect(expense.amount, 100.0);
      expect(expense.amount, isA<double>());
    });

    test('group expense has groupMetadata', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Restaurant',
        'amount': 85.00,
        'category': 'Meals and entertainment',
        'date': now,
        'expenseType': 'group',
        'groupId': 'group-1',
        'groupMetadata': {
          'approvalStatus': 'pending',
          'addedBy': 'user-1',
        },
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final expense = ExpenseModel.fromFirestore(snapshot);

      expect(expense.expenseType, 'group');
      expect(expense.groupId, 'group-1');
      expect(expense.groupMetadata, isNotNull);
      expect(expense.groupMetadata!['approvalStatus'], 'pending');
    });
  });
}
