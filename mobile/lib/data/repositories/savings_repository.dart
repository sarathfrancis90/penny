import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/savings_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class SavingsRepository {
  SavingsRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<SavingsGoalModel>> watchSavingsGoals(String userId) {
    return Stream.fromFuture(_listSavings(userId));
  }

  Future<List<SavingsGoalModel>> _listSavings(String userId) async {
    final response = await _api.get(
      ApiEndpoints.personalSavings,
      queryParameters: {'userId': userId, 'status': 'active'},
    );
    return listValue(
      responseMap(response)['savingsGoals'],
    ).map((json) => SavingsGoalModel.fromFirestore(apiDocument(json))).toList();
  }

  Future<String> createSavingsGoal({
    required String userId,
    required String name,
    required String category,
    required double targetAmount,
    required double monthlyContribution,
    required String priority,
    String currency = 'CAD',
    String? description,
    String? emoji,
    DateTime? targetDate,
  }) async {
    final response = await _api.post(
      ApiEndpoints.personalSavings,
      data: {
        'userId': userId,
        'name': name,
        'category': category,
        'targetAmount': targetAmount,
        'monthlyContribution': monthlyContribution,
        'priority': priority,
        'currency': currency,
        'description': ?description,
        'emoji': ?emoji,
        if (targetDate != null) 'targetDate': targetDate.toIso8601String(),
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateSavingsGoal(
    String id,
    Map<String, dynamic> updates,
  ) async {
    await _api.patch(ApiEndpoints.personalSavingsById(id), data: updates);
  }

  Future<void> addContribution(String goalId, double amount) async {
    await _api.post(
      ApiEndpoints.personalSavingsContribution(goalId),
      data: {'amount': amount},
    );
  }

  Future<void> deleteSavingsGoal(String id) async {
    await _api.delete(ApiEndpoints.personalSavingsById(id));
  }
}
