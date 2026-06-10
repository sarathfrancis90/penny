import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/group_savings_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class GroupSavingsRepository {
  GroupSavingsRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<GroupSavingsGoalModel>> watchGroupSavingsGoals(String groupId) {
    return Stream.fromFuture(_listGroupSavings(groupId));
  }

  Future<List<GroupSavingsGoalModel>> _listGroupSavings(String groupId) async {
    final response = await _api.get(
      ApiEndpoints.groupSavings,
      queryParameters: {'groupId': groupId, 'status': 'active'},
    );
    return listValue(responseMap(response)['savingsGoals'])
        .map((json) => GroupSavingsGoalModel.fromFirestore(apiDocument(json)))
        .toList();
  }

  Future<String> createGroupSavingsGoal({
    required String groupId,
    required String createdBy,
    required String name,
    required String category,
    required double targetAmount,
    required double monthlyContribution,
    required String priority,
    String currency = 'CAD',
    String contributionType = 'equal',
    String? description,
    String? emoji,
    DateTime? targetDate,
  }) async {
    final response = await _api.post(
      ApiEndpoints.groupSavings,
      data: {
        'groupId': groupId,
        'userId': createdBy,
        'createdBy': createdBy,
        'name': name,
        'category': category,
        'targetAmount': targetAmount,
        'monthlyContribution': monthlyContribution,
        'priority': priority,
        'currency': currency,
        'contributionType': contributionType,
        'description': ?description,
        'emoji': ?emoji,
        if (targetDate != null) 'targetDate': targetDate.toIso8601String(),
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateGroupSavingsGoal(
    String id,
    Map<String, dynamic> updates,
  ) async {
    await _api.patch(ApiEndpoints.groupSavingsById(id), data: updates);
  }

  Future<void> addGroupContribution(
    String goalId,
    double amount,
    String userId,
  ) async {
    await _api.post(
      ApiEndpoints.groupSavingsContribution(goalId),
      data: {'userId': userId, 'amount': amount},
    );
  }

  Future<void> deleteGroupSavingsGoal(String id) async {
    await _api.delete(ApiEndpoints.groupSavingsById(id));
  }
}
