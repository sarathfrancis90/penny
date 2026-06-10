import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class ExpenseRepository {
  ExpenseRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<ExpenseModel>> watchPersonalExpenses(String userId) {
    return Stream.fromFuture(_listExpenses(scope: 'personal', userId: userId));
  }

  Stream<List<ExpenseModel>> watchGroupExpenses(String groupId) {
    return Stream.fromFuture(_listExpenses(scope: 'group', groupId: groupId));
  }

  Stream<List<ExpenseModel>> watchAllExpenses(String userId) {
    return Stream.fromFuture(_listExpenses(scope: 'all', userId: userId));
  }

  Future<List<ExpenseModel>> _listExpenses({
    required String scope,
    String? userId,
    String? groupId,
    String? approvalStatus,
  }) async {
    final response = await _api.get(
      ApiEndpoints.expenses,
      queryParameters: {
        'scope': scope,
        'userId': ?userId,
        'groupId': ?groupId,
        'approvalStatus': ?approvalStatus,
      },
    );
    final data = responseMap(response);
    return listValue(
      data['expenses'],
    ).map((json) => ExpenseModel.fromFirestore(apiDocument(json))).toList();
  }

  Future<String> savePersonalExpense({
    required String userId,
    required String vendor,
    required double amount,
    required String category,
    required String date,
    String? description,
    String? receiptUrl,
    String? groupId,
  }) async {
    final response = await _api.post(
      ApiEndpoints.expenses,
      data: {
        'userId': userId,
        'vendor': vendor,
        'amount': amount,
        'category': category,
        'date': date,
        'description': ?description,
        'receiptUrl': ?receiptUrl,
        'groupId': ?groupId,
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateExpense({
    required String expenseId,
    required String userId,
    required Map<String, dynamic> updates,
  }) async {
    await _api.patch(
      ApiEndpoints.expenseById(expenseId),
      data: {'userId': userId, ..._apiUpdates(updates)},
    );
  }

  Future<void> deleteExpense(String expenseId) async {
    await _api.delete(ApiEndpoints.expenseById(expenseId));
  }

  Future<void> approveExpense({
    required String expenseId,
    required String userId,
  }) async {
    await _api.post(
      ApiEndpoints.approveExpense(expenseId),
      data: {'userId': userId},
    );
  }

  Future<void> rejectExpense({
    required String expenseId,
    required String userId,
    String? reason,
  }) async {
    await _api.post(
      ApiEndpoints.rejectExpense(expenseId),
      data: {'userId': userId, 'reason': ?reason},
    );
  }

  Stream<List<ExpenseModel>> watchPendingGroupExpenses(String groupId) {
    return Stream.fromFuture(
      _listExpenses(
        scope: 'group',
        groupId: groupId,
        approvalStatus: 'pending',
      ),
    );
  }

  Map<String, dynamic> _apiUpdates(Map<String, dynamic> updates) {
    return updates.map((key, value) {
      if (value is Timestamp) return MapEntry(key, _dateString(value.toDate()));
      if (value is DateTime) return MapEntry(key, _dateString(value));
      return MapEntry(key, value);
    });
  }

  String _dateString(DateTime date) {
    final local = date.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '${local.year}-$month-$day';
  }
}
