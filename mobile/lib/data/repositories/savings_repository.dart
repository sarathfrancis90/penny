import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/savings_model.dart';

class SavingsRepository {
  SavingsRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  Stream<List<SavingsGoalModel>> watchSavingsGoals(String userId) {
    return _db
        .collection('savings_goals_personal')
        .where('userId', isEqualTo: userId)
        .where('isActive', isEqualTo: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(SavingsGoalModel.fromFirestore).toList());
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
    final now = Timestamp.now();
    final doc = await _db.collection('savings_goals_personal').add({
      'userId': userId,
      'name': name,
      'category': category,
      'targetAmount': targetAmount,
      'currentAmount': 0,
      'monthlyContribution': monthlyContribution,
      'status': 'active',
      'isActive': true,
      'priority': priority,
      'currency': currency,
      'startDate': now,
      'createdAt': now,
      'updatedAt': now,
      'progressPercentage': 0,
      'onTrack': true,
      if (description != null) 'description': description,
      if (emoji != null) 'emoji': emoji,
      if (targetDate != null) 'targetDate': Timestamp.fromDate(targetDate),
    });
    return doc.id;
  }

  Future<void> updateSavingsGoal(String id, Map<String, dynamic> updates) {
    return _db.collection('savings_goals_personal').doc(id).update({
      ...updates,
      'updatedAt': Timestamp.now(),
    });
  }

  Future<void> addContribution(String goalId, double amount) async {
    final goalRef = _db.collection('savings_goals_personal').doc(goalId);
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

  Future<void> deleteSavingsGoal(String id) {
    return _db.collection('savings_goals_personal').doc(id).delete();
  }
}
