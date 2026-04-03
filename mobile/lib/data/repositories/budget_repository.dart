import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

class BudgetRepository {
  BudgetRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Stream personal budgets for a user and period.
  Stream<List<BudgetModel>> watchBudgets(String userId, BudgetPeriod period) {
    return _db
        .collection('budgets_personal')
        .where('userId', isEqualTo: userId)
        .where('period.month', isEqualTo: period.month)
        .where('period.year', isEqualTo: period.year)
        .snapshots()
        .map((snap) => snap.docs.map(BudgetModel.fromFirestore).toList());
  }

  /// Create a personal budget.
  Future<String> createBudget({
    required String userId,
    required String category,
    required double monthlyLimit,
    required BudgetPeriod period,
    BudgetSettings settings = const BudgetSettings(),
  }) async {
    final now = Timestamp.now();
    final doc = await _db.collection('budgets_personal').add({
      'userId': userId,
      'category': category,
      'monthlyLimit': monthlyLimit,
      'period': period.toMap(),
      'settings': settings.toMap(),
      'createdAt': now,
      'updatedAt': now,
    });
    return doc.id;
  }

  /// Update a budget.
  Future<void> updateBudget(String budgetId, Map<String, dynamic> updates) {
    return _db.collection('budgets_personal').doc(budgetId).update({
      ...updates,
      'updatedAt': Timestamp.now(),
    });
  }

  /// Delete a budget.
  Future<void> deleteBudget(String budgetId) {
    return _db.collection('budgets_personal').doc(budgetId).delete();
  }

  /// Calculate budget usage by comparing budgets against expenses.
  List<BudgetUsage> calculateUsage(
    List<BudgetModel> budgets,
    List<ExpenseModel> expenses,
  ) {
    return budgets.map((budget) {
      final categoryExpenses = expenses
          .where((e) =>
              e.category == budget.category &&
              e.expenseType == 'personal')
          .toList();

      final totalSpent =
          categoryExpenses.fold(0.0, (sum, e) => sum + e.amount);
      final remaining = budget.monthlyLimit - totalSpent;
      final percentage =
          budget.monthlyLimit > 0 ? (totalSpent / budget.monthlyLimit * 100) : 0.0;

      return BudgetUsage(
        category: budget.category,
        budgetLimit: budget.monthlyLimit,
        totalSpent: totalSpent,
        remainingAmount: remaining,
        percentageUsed: percentage,
        status: BudgetUsage.computeStatus(percentage),
        expenseCount: categoryExpenses.length,
      );
    }).toList()
      ..sort((a, b) => b.percentageUsed.compareTo(a.percentageUsed));
  }
}
