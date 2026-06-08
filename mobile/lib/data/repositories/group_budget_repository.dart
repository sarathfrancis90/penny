import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/budget_model.dart';

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

  factory GroupBudgetModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return GroupBudgetModel(
      id: doc.id,
      groupId: data['groupId'] as String,
      category: data['category'] as String,
      monthlyLimit: (data['monthlyLimit'] as num).toDouble(),
      period: BudgetPeriod.fromMap(data['period'] as Map<String, dynamic>),
      settings: BudgetSettings.fromMap(data['settings'] as Map<String, dynamic>? ?? {}),
      setBy: data['setBy'] as String? ?? '',
      setByRole: data['setByRole'] as String?,
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
    );
  }
}

class GroupBudgetRepository {
  GroupBudgetRepository({
    required ApiClient apiClient,
    FirebaseFirestore? firestore,
  })  : _api = apiClient,
        _db = firestore ?? FirebaseFirestore.instance;

  final ApiClient _api;
  final FirebaseFirestore _db;

  /// Stream group budgets for a group and period.
  Stream<List<GroupBudgetModel>> watchGroupBudgets(String groupId, BudgetPeriod period) {
    return _db
        .collection('budgets_group')
        .where('groupId', isEqualTo: groupId)
        .where('period.month', isEqualTo: period.month)
        .where('period.year', isEqualTo: period.year)
        .snapshots()
        .map((snap) => snap.docs.map(GroupBudgetModel.fromFirestore).toList());
  }

  /// Create a group budget.
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
    final data = response.data as Map<String, dynamic>;
    return data['id'] as String;
  }

  /// Update a group budget.
  Future<void> updateGroupBudget(String budgetId, Map<String, dynamic> updates) {
    return _api
        .put(ApiEndpoints.groupBudgetById(budgetId), data: updates)
        .then((_) => null);
  }

  /// Delete a group budget.
  Future<void> deleteGroupBudget(String budgetId) {
    return _api.delete(ApiEndpoints.groupBudgetById(budgetId)).then((_) => null);
  }
}
