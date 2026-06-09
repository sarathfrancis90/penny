import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class BudgetRepository {
  BudgetRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<BudgetModel>> watchBudgets(String userId, BudgetPeriod period) {
    return Stream.fromFuture(_listBudgets(userId, period));
  }

  Future<List<BudgetModel>> _listBudgets(
    String userId,
    BudgetPeriod period,
  ) async {
    final response = await _api.get(
      ApiEndpoints.personalBudgets,
      queryParameters: {
        'userId': userId,
        'month': period.month,
        'year': period.year,
      },
    );
    final data = responseMap(response);
    return listValue(
      data['budgets'],
    ).map((json) => BudgetModel.fromFirestore(apiDocument(json))).toList();
  }

  Future<String> createBudget({
    required String userId,
    required String category,
    required double monthlyLimit,
    required BudgetPeriod period,
    BudgetSettings settings = const BudgetSettings(),
  }) async {
    final response = await _api.post(
      ApiEndpoints.personalBudgets,
      data: {
        'userId': userId,
        'category': category,
        'monthlyLimit': monthlyLimit,
        'period': period.toMap(),
        'settings': settings.toMap(),
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateBudget(
    String budgetId,
    Map<String, dynamic> updates,
  ) async {
    await _api.put(ApiEndpoints.personalBudgetById(budgetId), data: updates);
  }

  Future<void> deleteBudget(String budgetId) async {
    await _api.delete(ApiEndpoints.personalBudgetById(budgetId));
  }

  List<BudgetUsage> calculateUsage(
    List<BudgetModel> budgets,
    List<ExpenseModel> expenses,
  ) {
    return budgets.map((budget) {
      final categoryExpenses = expenses
          .where(
            (e) => e.category == budget.category && e.expenseType == 'personal',
          )
          .toList();
      final totalSpent = categoryExpenses.fold(0.0, (sum, e) => sum + e.amount);
      final remaining = budget.monthlyLimit - totalSpent;
      final percentage = budget.monthlyLimit > 0
          ? (totalSpent / budget.monthlyLimit * 100)
          : 0.0;

      return BudgetUsage(
        category: budget.category,
        budgetLimit: budget.monthlyLimit,
        totalSpent: totalSpent,
        remainingAmount: remaining,
        percentageUsed: percentage,
        status: BudgetUsage.computeStatus(percentage),
        expenseCount: categoryExpenses.length,
      );
    }).toList()..sort((a, b) => b.percentageUsed.compareTo(a.percentageUsed));
  }
}
