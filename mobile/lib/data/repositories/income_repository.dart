import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/income_model.dart';

class IncomeRepository {
  IncomeRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  Stream<List<IncomeSourceModel>> watchIncomeSources(String userId) {
    return _db
        .collection('income_sources_personal')
        .where('userId', isEqualTo: userId)
        .snapshots()
        .map((snap) =>
            snap.docs.map(IncomeSourceModel.fromFirestore).toList());
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
    final now = Timestamp.now();
    final doc = await _db.collection('income_sources_personal').add({
      'userId': userId,
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
      if (description != null) 'description': description,
      if (recurringDate != null) 'recurringDate': recurringDate,
    });
    return doc.id;
  }

  Future<void> updateIncomeSource(String id, Map<String, dynamic> updates) {
    return _db.collection('income_sources_personal').doc(id).update({
      ...updates,
      'updatedAt': Timestamp.now(),
    });
  }

  Future<void> deleteIncomeSource(String id) {
    return _db.collection('income_sources_personal').doc(id).delete();
  }
}
