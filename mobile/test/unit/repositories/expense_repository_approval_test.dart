import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

void main() {
  group('ExpenseRepository — approve/reject', () {
    late FakeFirebaseFirestore firestore;
    late ExpenseRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = ExpenseRepository(firestore: firestore);
    });

    /// Helper to read a dot-notation field from a Firestore doc.
    /// fake_cloud_firestore stores `update({'a.b': val})` either as
    /// a literal key `'a.b'` or as a nested `{'a': {'b': val}}`.
    dynamic readDotField(Map<String, dynamic> data, String dotPath) {
      // Try literal key first (common in fake_cloud_firestore)
      if (data.containsKey(dotPath)) return data[dotPath];
      // Try nested path
      final parts = dotPath.split('.');
      dynamic current = data;
      for (final part in parts) {
        if (current is Map<String, dynamic> && current.containsKey(part)) {
          current = current[part];
        } else {
          return null;
        }
      }
      return current;
    }

    /// Seeds a group expense with pending approval status.
    Future<String> seedPendingGroupExpense() async {
      final now = Timestamp.now();
      final doc = await firestore.collection('expenses').add({
        'userId': 'user-1',
        'vendor': 'Costco',
        'amount': 150.00,
        'category': 'Groceries',
        'date': now,
        'expenseType': 'group',
        'groupId': 'group-1',
        'groupMetadata': {
          'approvalStatus': 'pending',
          'addedBy': 'user-1',
        },
        'createdAt': now,
        'updatedAt': now,
        'history': [
          {'action': 'created', 'by': 'user-1', 'at': now},
        ],
      });
      return doc.id;
    }

    group('approveExpense', () {
      test('sets approvalStatus to approved', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.approveExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final data = doc.data()!;
        final status =
            readDotField(data, 'groupMetadata.approvalStatus');

        expect(status, 'approved');
      });

      test('sets approvedBy to the approving user', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.approveExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final approvedBy =
            readDotField(doc.data()!, 'groupMetadata.approvedBy');
        expect(approvedBy, 'admin-1');
      });

      test('sets approvedAt timestamp', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.approveExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final approvedAt =
            readDotField(doc.data()!, 'groupMetadata.approvedAt');
        expect(approvedAt, isA<Timestamp>());
      });

      test('adds approved entry to history', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.approveExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final history = doc.data()!['history'] as List<dynamic>;

        // Original 'created' + new 'approved'
        expect(history.length, 2);
        expect(history.last['action'], 'approved');
        expect(history.last['by'], 'admin-1');
      });

      test('updates updatedAt timestamp', () async {
        final expenseId = await seedPendingGroupExpense();
        final beforeDoc =
            await firestore.collection('expenses').doc(expenseId).get();
        final beforeUpdatedAt =
            beforeDoc.data()!['updatedAt'] as Timestamp;

        await repo.approveExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final afterDoc =
            await firestore.collection('expenses').doc(expenseId).get();
        final afterUpdatedAt =
            afterDoc.data()!['updatedAt'] as Timestamp;

        expect(afterUpdatedAt, isNotNull);
        expect(
          afterUpdatedAt.millisecondsSinceEpoch >=
              beforeUpdatedAt.millisecondsSinceEpoch,
          true,
        );
      });
    });

    group('rejectExpense', () {
      test('sets approvalStatus to rejected', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.rejectExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final status =
            readDotField(doc.data()!, 'groupMetadata.approvalStatus');
        expect(status, 'rejected');
      });

      test('stores rejection reason when provided', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.rejectExpense(
          expenseId: expenseId,
          userId: 'admin-1',
          reason: 'Duplicate receipt',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final reason =
            readDotField(doc.data()!, 'groupMetadata.rejectedReason');
        expect(reason, 'Duplicate receipt');
      });

      test('stores null reason when not provided', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.rejectExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final reason =
            readDotField(doc.data()!, 'groupMetadata.rejectedReason');
        expect(reason, isNull);
      });

      test('sets rejectedAt timestamp', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.rejectExpense(
          expenseId: expenseId,
          userId: 'admin-1',
          reason: 'Not valid',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final rejectedAt =
            readDotField(doc.data()!, 'groupMetadata.rejectedAt');
        expect(rejectedAt, isA<Timestamp>());
      });

      test('adds rejected entry to history with reason', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.rejectExpense(
          expenseId: expenseId,
          userId: 'admin-1',
          reason: 'Wrong category',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        final history = doc.data()!['history'] as List<dynamic>;

        expect(history.length, 2);
        expect(history.last['action'], 'rejected');
        expect(history.last['by'], 'admin-1');
        expect(history.last['changes']['reason'], 'Wrong category');
      });

      test('updates updatedAt timestamp', () async {
        final expenseId = await seedPendingGroupExpense();

        await repo.rejectExpense(
          expenseId: expenseId,
          userId: 'admin-1',
        );

        final doc =
            await firestore.collection('expenses').doc(expenseId).get();
        expect(doc.data()!['updatedAt'], isA<Timestamp>());
      });
    });

    group('watchGroupExpenses', () {
      test('streams expenses for a specific group', () async {
        final now = Timestamp.now();

        // Group-1 expense
        await firestore.collection('expenses').add({
          'userId': 'user-1',
          'vendor': 'Costco',
          'amount': 150,
          'category': 'Groceries',
          'date': now,
          'expenseType': 'group',
          'groupId': 'group-1',
          'createdAt': now,
          'updatedAt': now,
        });

        // Group-2 expense (should be excluded)
        await firestore.collection('expenses').add({
          'userId': 'user-1',
          'vendor': 'Walmart',
          'amount': 75,
          'category': 'Groceries',
          'date': now,
          'expenseType': 'group',
          'groupId': 'group-2',
          'createdAt': now,
          'updatedAt': now,
        });

        // Personal expense (should be excluded)
        await firestore.collection('expenses').add({
          'userId': 'user-1',
          'vendor': 'Tim Hortons',
          'amount': 14.50,
          'category': 'Meals and entertainment',
          'date': now,
          'expenseType': 'personal',
          'createdAt': now,
          'updatedAt': now,
        });

        final expenses = await repo.watchGroupExpenses('group-1').first;
        expect(expenses.length, 1);
        expect(expenses.first.vendor, 'Costco');
        expect(expenses.first.groupId, 'group-1');
      });
    });
  });
}
