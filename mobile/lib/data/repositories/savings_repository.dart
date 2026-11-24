import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/savings_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class SavingsRepository {
  SavingsRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  static const _visibleStatuses = {'active', 'achieved', 'paused'};

  Stream<List<SavingsGoalModel>> watchSavingsGoals(String userId) {
    return Stream.fromFuture(_listSavings(userId));
  }

  Future<List<SavingsGoalModel>> _listSavings(String userId) async {
    final response = await _api.get(
      ApiEndpoints.personalSavings,
      queryParameters: {'userId': userId},
    );
    // A contribution that reaches the target marks the goal "achieved" on the
    // server. Asking only for active goals made it vanish, together with its
    // money in the totals, so keep achieved and paused goals too.
    return parseList(
      responseMap(response)['savingsGoals'],
      SavingsGoalModel.fromFirestore,
    ).where((goal) => _visibleStatuses.contains(goal.status)).toList();
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
