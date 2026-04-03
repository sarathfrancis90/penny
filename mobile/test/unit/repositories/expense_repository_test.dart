import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

void main() {
  group('ExpenseRepository', () {
    late FakeFirebaseFirestore firestore;
    late ExpenseRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = ExpenseRepository(firestore: firestore);
    });

    group('Create', () {
      test('savePersonalExpense creates doc with correct fields', () async {
        final id = await repo.savePersonalExpense(
          userId: 'user-1',
          vendor: 'Tim Hortons',
          amount: 14.50,
          category: 'Meals and entertainment',
          date: '2026-04-03',
          description: 'Lunch',
        );

        expect(id, isNotEmpty);

        final doc = await firestore.collection('expenses').doc(id).get();
        final data = doc.data()!;

        expect(data['userId'], 'user-1');
        expect(data['vendor'], 'Tim Hortons');
        expect(data['amount'], 14.50);
        expect(data['category'], 'Meals and entertainment');
        expect(data['description'], 'Lunch');
        expect(data['expenseType'], 'personal');
        expect(data['groupId'], isNull);
        expect(data['syncStatus'], 'synced');
        expect(data['history'], isA<List>());
        expect((data['history'] as List).length, 1);
        expect((data['history'] as List).first['action'], 'created');
      });

      test('savePersonalExpense parses date correctly', () async {
        final id = await repo.savePersonalExpense(
          userId: 'user-1',
          vendor: 'Store',
          amount: 10.00,
          category: 'Office expenses',
          date: '2026-04-03',
        );

        final doc = await firestore.collection('expenses').doc(id).get();
        final date = (doc.data()!['date'] as Timestamp).toDate();

        expect(date.year, 2026);
        expect(date.month, 4);
        expect(date.day, 3);
        expect(date.hour, 12); // noon to avoid timezone issues
      });
    });

    group('Read', () {
      test('watchPersonalExpenses streams user expenses', () async {
        // Seed 2 expenses for user-1 and 1 for user-2
        await firestore.collection('expenses').add({
          'userId': 'user-1',
          'vendor': 'A',
          'amount': 10,
          'category': 'Office expenses',
          'date': Timestamp.now(),
          'expenseType': 'personal',
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        await firestore.collection('expenses').add({
          'userId': 'user-1',
          'vendor': 'B',
          'amount': 20,
          'category': 'Telephone',
          'date': Timestamp.now(),
          'expenseType': 'personal',
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        await firestore.collection('expenses').add({
          'userId': 'user-2',
          'vendor': 'C',
          'amount': 30,
          'category': 'Groceries',
          'date': Timestamp.now(),
          'expenseType': 'personal',
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });

        final expenses =
            await repo.watchPersonalExpenses('user-1').first;

        expect(expenses.length, 2);
        expect(expenses.every((e) => e.userId == 'user-1'), isTrue);
      });
    });

    group('Update', () {
      test('updateExpense modifies fields and adds history', () async {
        // Create
        final id = await repo.savePersonalExpense(
          userId: 'user-1',
          vendor: 'Tim Hortons',
          amount: 14.50,
          category: 'Meals and entertainment',
          date: '2026-04-03',
        );

        // Update
        await repo.updateExpense(
          expenseId: id,
          userId: 'user-1',
          updates: {
            'amount': 16.50,
            'vendor': 'Tim Hortons - Updated',
          },
        );

        final doc = await firestore.collection('expenses').doc(id).get();
        final data = doc.data()!;

        expect(data['amount'], 16.50);
        expect(data['vendor'], 'Tim Hortons - Updated');
        // History should have 2 entries (created + updated)
        expect((data['history'] as List).length, 2);
        expect((data['history'] as List).last['action'], 'updated');
      });
    });

    group('Delete', () {
      test('deleteExpense removes doc from Firestore', () async {
        final id = await repo.savePersonalExpense(
          userId: 'user-1',
          vendor: 'To Delete',
          amount: 5.00,
          category: 'Other expenses (specify)',
          date: '2026-04-03',
        );

        // Verify it exists
        var doc = await firestore.collection('expenses').doc(id).get();
        expect(doc.exists, isTrue);

        // Delete
        await repo.deleteExpense(id);

        // Verify it's gone
        doc = await firestore.collection('expenses').doc(id).get();
        expect(doc.exists, isFalse);
      });

      test('deleting expense updates stream', () async {
        final id = await repo.savePersonalExpense(
          userId: 'user-1',
          vendor: 'Temp',
          amount: 1.00,
          category: 'Office expenses',
          date: '2026-04-03',
        );

        // Get initial count
        var expenses =
            await repo.watchAllExpenses('user-1').first;
        expect(expenses.length, 1);

        // Delete
        await repo.deleteExpense(id);

        // Stream should update
        expenses = await repo.watchAllExpenses('user-1').first;
        expect(expenses.length, 0);
      });
    });
  });
}
