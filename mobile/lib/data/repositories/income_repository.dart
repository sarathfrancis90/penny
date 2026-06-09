import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/income_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class IncomeRepository {
  IncomeRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<IncomeSourceModel>> watchIncomeSources(String userId) {
    return Stream.fromFuture(_listIncome(userId));
  }

  Future<List<IncomeSourceModel>> _listIncome(String userId) async {
    final response = await _api.get(
      ApiEndpoints.personalIncome,
      queryParameters: {'userId': userId},
    );
    return listValue(responseMap(response)['incomeSources'])
        .map((json) => IncomeSourceModel.fromFirestore(apiDocument(json)))
        .toList();
  }

  Future<String> createIncomeSource({
    required String userId,
    required String name,
    required String category,
    required double amount,
    required String frequency,
    required bool isRecurring,
    required bool taxable,
    String currency = 'CAD',
    String? description,
    int? recurringDate,
  }) async {
    final response = await _api.post(
      ApiEndpoints.personalIncome,
      data: {
        'userId': userId,
        'name': name,
        'category': category,
        'amount': amount,
        'frequency': frequency,
        'isRecurring': isRecurring,
        'isActive': true,
        'taxable': taxable,
        'currency': currency,
        if (description != null) 'description': description,
        if (recurringDate != null) 'recurringDate': recurringDate,
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateIncomeSource(
    String id,
    Map<String, dynamic> updates,
  ) async {
    await _api.patch(ApiEndpoints.personalIncomeById(id), data: updates);
  }

  Future<void> deleteIncomeSource(String id) async {
    await _api.delete(ApiEndpoints.personalIncomeById(id));
  }
}
