import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

class ExpenseRepository {
  ExpenseRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Stream personal expenses for a user.
  Stream<List<ExpenseModel>> watchPersonalExpenses(String userId) {
    return _db
        .collection('expenses')
        .where('userId', isEqualTo: userId)
        .where('expenseType', isEqualTo: 'personal')
        .orderBy('date', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(ExpenseModel.fromFirestore).toList());
  }

  /// Stream expenses for a specific group.
  Stream<List<ExpenseModel>> watchGroupExpenses(String groupId) {
    return _db
        .collection('expenses')
        .where('groupId', isEqualTo: groupId)
        .where('expenseType', isEqualTo: 'group')
        .orderBy('date', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(ExpenseModel.fromFirestore).toList());
  }

  /// Stream all expenses (personal + group) for a user.
  Stream<List<ExpenseModel>> watchAllExpenses(String userId) {
    return _db
        .collection('expenses')
        .where('userId', isEqualTo: userId)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(ExpenseModel.fromFirestore).toList());
  }

  /// Save a personal expense directly to Firestore.
  Future<String> savePersonalExpense({
    required String userId,
    required String vendor,
    required double amount,
    required String category,
    required String date,
    String? description,
    String? receiptUrl,
  }) async {
    final now = Timestamp.now();

    // Parse date string to Timestamp (noon to avoid timezone issues)
    final parts = date.split('-').map(int.parse).toList();
    final expenseDate =
        Timestamp.fromDate(DateTime(parts[0], parts[1], parts[2], 12));

    final docRef = await _db.collection('expenses').add({
      'userId': userId,
      'vendor': vendor,
      'amount': amount,
      'category': category,
      'date': expenseDate,
      'description': description ?? '',
      'receiptUrl': receiptUrl,
      'groupId': null,
      'expenseType': 'personal',
      'createdAt': now,
      'updatedAt': now,
      'syncStatus': 'synced',
      'history': [
        {
          'action': 'created',
          'by': userId,
          'at': now,
        },
      ],
    });

    return docRef.id;
  }

  /// Update an expense.
  Future<void> updateExpense({
    required String expenseId,
    required String userId,
    required Map<String, dynamic> updates,
  }) async {
    final now = Timestamp.now();
    await _db.collection('expenses').doc(expenseId).update({
      ...updates,
      'updatedAt': now,
      'history': FieldValue.arrayUnion([
        {
          'action': 'updated',
          'by': userId,
          'at': now,
        },
      ]),
    });
  }

  /// Delete an expense.
  Future<void> deleteExpense(String expenseId) async {
    await _db.collection('expenses').doc(expenseId).delete();
  }
}
