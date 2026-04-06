import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/group_savings_model.dart';

class GroupSavingsRepository {
  GroupSavingsRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  Stream<List<GroupSavingsGoalModel>> watchGroupSavingsGoals(String groupId) {
    return _db
        .collection('savings_goals_group')
        .where('groupId', isEqualTo: groupId)
        .where('isActive', isEqualTo: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(GroupSavingsGoalModel.fromFirestore).toList());
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
    final now = Timestamp.now();
    final doc = await _db.collection('savings_goals_group').add({
      'groupId': groupId,
      'createdBy': createdBy,
      'name': name,
      'category': category,
      'targetAmount': targetAmount,
      'currentAmount': 0,
      'monthlyContribution': monthlyContribution,
      'status': 'active',
      'isActive': true,
      'priority': priority,
      'currency': currency,
      'contributionType': contributionType,
      'startDate': now,
      'createdAt': now,
      'updatedAt': now,
      'progressPercentage': 0,
      if (description != null) 'description': description,
      if (emoji != null) 'emoji': emoji,
      if (targetDate != null) 'targetDate': Timestamp.fromDate(targetDate),
    });
    return doc.id;
  }

  Future<void> updateGroupSavingsGoal(
      String id, Map<String, dynamic> updates) {
    return _db.collection('savings_goals_group').doc(id).update({
      ...updates,
      'updatedAt': Timestamp.now(),
    });
  }

  Future<void> addGroupContribution(
      String goalId, double amount, String userId) async {
    final goalRef = _db.collection('savings_goals_group').doc(goalId);
    final doc = await goalRef.get();
    if (!doc.exists) return;

    final data = doc.data()!;
    final currentAmount = (data['currentAmount'] as num).toDouble() + amount;
    final targetAmount = (data['targetAmount'] as num).toDouble();
    final progress =
        targetAmount > 0 ? (currentAmount / targetAmount * 100) : 0.0;

    await goalRef.update({
      'currentAmount': currentAmount,
      'progressPercentage': progress,
      'status': progress >= 100 ? 'achieved' : 'active',
      'lastContributionAt': Timestamp.now(),
      'updatedAt': Timestamp.now(),
    });
  }

  Future<void> deleteGroupSavingsGoal(String id) {
    return _db.collection('savings_goals_group').doc(id).delete();
  }
}
