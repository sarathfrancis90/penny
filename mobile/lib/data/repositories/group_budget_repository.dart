import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class GroupBudgetModel {
  GroupBudgetModel({
    required this.id,
    required this.groupId,
    required this.category,
    required this.monthlyLimit,
    required this.period,
    required this.settings,
    required this.setBy,
    this.setByRole,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String groupId;
  final String category;
  final double monthlyLimit;
  final BudgetPeriod period;
  final BudgetSettings settings;
  final String setBy;
  final String? setByRole;
  final Timestamp createdAt;
  final Timestamp updatedAt;

  factory GroupBudgetModel.fromJson(Map<String, dynamic> data) {
    return GroupBudgetModel(
      id: (data['id'] ?? '').toString(),
      groupId: data['groupId'] as String? ?? '',
      category: data['category'] as String? ?? '',
      monthlyLimit: (data['monthlyLimit'] as num?)?.toDouble() ?? 0,
      period: BudgetPeriod.fromMap(mapValue(data['period'])),
      settings: BudgetSettings.fromMap(mapValue(data['settings'])),
      setBy: data['setBy'] as String? ?? data['userId'] as String? ?? '',
      setByRole: data['setByRole'] as String?,
      createdAt: Timestamp.fromJson(data['createdAt']),
      updatedAt: Timestamp.fromJson(data['updatedAt']),
    );
  }
}

class GroupBudgetRepository {
  GroupBudgetRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<GroupBudgetModel>> watchGroupBudgets(
    String groupId,
    BudgetPeriod period,
  ) {
    return Stream.fromFuture(_listGroupBudgets(groupId, period));
  }

  Future<List<GroupBudgetModel>> _listGroupBudgets(
    String groupId,
    BudgetPeriod period,
  ) async {
    final response = await _api.get(
      ApiEndpoints.groupBudgets,
      queryParameters: {
        'groupId': groupId,
        'month': period.month,
        'year': period.year,
      },
    );
    return listValue(
      responseMap(response)['budgets'],
    ).map(GroupBudgetModel.fromJson).toList();
  }

  Future<String> createGroupBudget({
    required String groupId,
    required String category,
    required double monthlyLimit,
    required BudgetPeriod period,
    required String setBy,
    required String setByRole,
    BudgetSettings settings = const BudgetSettings(),
  }) async {
    final response = await _api.post(
      ApiEndpoints.groupBudgets,
      data: {
        'groupId': groupId,
        'userId': setBy,
        'category': category,
        'monthlyLimit': monthlyLimit,
        'period': period.toMap(),
        'settings': settings.toMap(),
        'setByRole': setByRole,
      },
    );
    return (responseMap(response)['id'] ?? '').toString();
  }

  Future<void> updateGroupBudget(
    String budgetId,
    Map<String, dynamic> updates,
  ) async {
    await _api.put(ApiEndpoints.groupBudgetById(budgetId), data: updates);
  }

  Future<void> deleteGroupBudget(String budgetId) async {
    await _api.delete(ApiEndpoints.groupBudgetById(budgetId));
  }
}
