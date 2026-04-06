import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/group_income_model.dart';

class GroupIncomeRepository {
  GroupIncomeRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  Stream<List<GroupIncomeSourceModel>> watchGroupIncomeSources(String groupId) {
    return _db
        .collection('income_sources_group')
        .where('groupId', isEqualTo: groupId)
        .where('isActive', isEqualTo: true)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(GroupIncomeSourceModel.fromFirestore).toList());
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
    final now = Timestamp.now();
    final doc = await _db.collection('income_sources_group').add({
      'groupId': groupId,
      'addedBy': addedBy,
      'name': name,
      'category': category,
      'amount': amount,
      'frequency': frequency,
      'isRecurring': isRecurring,
      'isActive': true,
      'taxable': taxable,
      'currency': currency,
      'startDate': now,
      'createdAt': now,
      'updatedAt': now,
      'splitType': splitType,
      if (description != null) 'description': description,
      if (contributedBy != null) 'contributedBy': contributedBy,
      if (recurringDate != null) 'recurringDate': recurringDate,
    });
    return doc.id;
  }

  Future<void> updateGroupIncomeSource(
      String id, Map<String, dynamic> updates) {
    return _db.collection('income_sources_group').doc(id).update({
      ...updates,
      'updatedAt': Timestamp.now(),
    });
  }

  Future<void> deleteGroupIncomeSource(String id) {
    return _db.collection('income_sources_group').doc(id).delete();
  }
}
