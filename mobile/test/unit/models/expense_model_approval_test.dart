import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

void main() {
  group('ExpenseModel approval getters', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    ExpenseModel _makeExpense({Map<String, dynamic>? groupMetadata}) {
      final now = Timestamp.now();
      return ExpenseModel(
        id: 'test-id',
        userId: 'user-1',
        vendor: 'Restaurant',
        amount: 85.00,
        category: 'Meals and entertainment',
        date: now,
        expenseType: 'group',
        createdAt: now,
        updatedAt: now,
        groupId: 'group-1',
        groupMetadata: groupMetadata,
      );
    }

    group('approvalStatus', () {
      test('returns null when groupMetadata is null', () {
        final expense = _makeExpense(groupMetadata: null);
        expect(expense.approvalStatus, isNull);
      });

      test('returns null when approvalStatus key is absent', () {
        final expense =
            _makeExpense(groupMetadata: {'addedBy': 'user-1'});
        expect(expense.approvalStatus, isNull);
      });

      test('returns the status string when present', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'pending'});
        expect(expense.approvalStatus, 'pending');
      });
    });

    group('approvedBy', () {
      test('returns null when groupMetadata is null', () {
        final expense = _makeExpense(groupMetadata: null);
        expect(expense.approvedBy, isNull);
      });

      test('returns the approvedBy string when present', () {
        final expense = _makeExpense(groupMetadata: {
          'approvalStatus': 'approved',
          'approvedBy': 'admin-user',
        });
        expect(expense.approvedBy, 'admin-user');
      });
    });

    group('isPending', () {
      test('returns true when approvalStatus is pending', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'pending'});
        expect(expense.isPending, true);
      });

      test('returns false when approvalStatus is approved', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'approved'});
        expect(expense.isPending, false);
      });

      test('returns false when approvalStatus is null', () {
        final expense = _makeExpense(groupMetadata: null);
        expect(expense.isPending, false);
      });

      test('returns false when approvalStatus is rejected', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'rejected'});
        expect(expense.isPending, false);
      });
    });

    group('isApproved', () {
      test('returns true when approvalStatus is approved', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'approved'});
        expect(expense.isApproved, true);
      });

      test('returns true when approvalStatus is null (default behavior)',
          () {
        final expense = _makeExpense(groupMetadata: null);
        expect(expense.isApproved, true);
      });

      test(
          'returns true when groupMetadata exists but approvalStatus is absent',
          () {
        final expense =
            _makeExpense(groupMetadata: {'addedBy': 'user-1'});
        expect(expense.isApproved, true);
      });

      test('returns false when approvalStatus is pending', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'pending'});
        expect(expense.isApproved, false);
      });

      test('returns false when approvalStatus is rejected', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'rejected'});
        expect(expense.isApproved, false);
      });
    });

    group('isRejected', () {
      test('returns true when approvalStatus is rejected', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'rejected'});
        expect(expense.isRejected, true);
      });

      test('returns false when approvalStatus is approved', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'approved'});
        expect(expense.isRejected, false);
      });

      test('returns false when approvalStatus is pending', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'pending'});
        expect(expense.isRejected, false);
      });

      test('returns false when approvalStatus is null', () {
        final expense = _makeExpense(groupMetadata: null);
        expect(expense.isRejected, false);
      });
    });

    group('rejectedReason', () {
      test('returns null when groupMetadata is null', () {
        final expense = _makeExpense(groupMetadata: null);
        expect(expense.rejectedReason, isNull);
      });

      test('returns null when rejectedReason key is absent', () {
        final expense = _makeExpense(
            groupMetadata: {'approvalStatus': 'rejected'});
        expect(expense.rejectedReason, isNull);
      });

      test('returns the reason string when present', () {
        final expense = _makeExpense(groupMetadata: {
          'approvalStatus': 'rejected',
          'rejectedReason': 'Duplicate receipt',
        });
        expect(expense.rejectedReason, 'Duplicate receipt');
      });
    });

    group('fromFirestore with approval fields', () {
      test('parses groupMetadata with approval status from Firestore',
          () async {
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
        });

        final snapshot = await doc.get();
        final expense = ExpenseModel.fromFirestore(snapshot);

        expect(expense.isPending, true);
        expect(expense.isApproved, false);
        expect(expense.isRejected, false);
        expect(expense.approvalStatus, 'pending');
      });

      test('personal expense without groupMetadata defaults to approved',
          () async {
        final now = Timestamp.now();
        final doc = await firestore.collection('expenses').add({
          'userId': 'user-1',
          'vendor': 'Staples',
          'amount': 45.00,
          'category': 'Office expenses',
          'date': now,
          'expenseType': 'personal',
          'createdAt': now,
          'updatedAt': now,
        });

        final snapshot = await doc.get();
        final expense = ExpenseModel.fromFirestore(snapshot);

        expect(expense.groupMetadata, isNull);
        expect(expense.isApproved, true);
        expect(expense.isPending, false);
        expect(expense.isRejected, false);
      });
    });
  });
}
