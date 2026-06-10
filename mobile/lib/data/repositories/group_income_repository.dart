import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/group_income_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class GroupIncomeRepository {
  GroupIncomeRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<GroupIncomeSourceModel>> watchGroupIncomeSources(String groupId) {
    return Stream.fromFuture(_listGroupIncome(groupId));
  }

  Future<List<GroupIncomeSourceModel>> _listGroupIncome(String groupId) async {
    final response = await _api.get(
      ApiEndpoints.groupIncome,
      queryParameters: {'groupId': groupId},
    );
    return listValue(responseMap(response)['incomeSources'])
        .map((json) => GroupIncomeSourceModel.fromFirestore(apiDocument(json)))
        .toList();
  }

  Future<String> createGroupIncomeSource({
    required String groupId,
    required String addedBy,
    required String name,
    required String category,
    required double amount,
    required String frequency,
    required bool isRecurring,
    required bool taxable,
    String currency = 'CAD',
    String? description,
    String? contributedBy,
    String splitType = 'equal',
    int? recurringDate,
  }) async {
    final response = await _api.post(
      ApiEndpoints.groupIncome,
      data: {
        'groupId': groupId,
        'userId': addedBy,
        'addedBy': addedBy,
        'name': name,
        'category': category,
        'amount': amount,
        'frequency': frequency,
        'isRecurring': isRecurring,
        'isActive': true,
        'taxable': taxable,
        'currency': currency,
        'splitType': splitType,
        'description': ?description,
        'contributedBy': ?contributedBy,
        'recurringDate': ?recurringDate,
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateGroupIncomeSource(
    String id,
    Map<String, dynamic> updates,
  ) async {
    await _api.patch(ApiEndpoints.groupIncomeById(id), data: updates);
  }

  Future<void> deleteGroupIncomeSource(String id) async {
    await _api.delete(ApiEndpoints.groupIncomeById(id));
  }
}
