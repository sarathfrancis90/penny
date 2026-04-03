import 'package:cloud_firestore/cloud_firestore.dart';

class ExpenseModel {
  ExpenseModel({
    required this.id,
    required this.userId,
    required this.vendor,
    required this.amount,
    required this.category,
    required this.date,
    required this.expenseType,
    required this.createdAt,
    required this.updatedAt,
    this.description,
    this.receiptUrl,
    this.notes,
    this.syncStatus,
    this.localId,
    this.groupId,
    this.groupMetadata,
    this.history,
  });

  final String id;
  final String userId;
  final String vendor;
  final double amount;
  final String category;
  final Timestamp date;
  final String expenseType; // 'personal' | 'group'
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final String? description;
  final String? receiptUrl;
  final String? notes;
  final String? syncStatus;
  final String? localId;
  final String? groupId;
  final Map<String, dynamic>? groupMetadata;
  final List<Map<String, dynamic>>? history;

  factory ExpenseModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return ExpenseModel(
      id: doc.id,
      userId: data['userId'] as String,
      vendor: data['vendor'] as String,
      amount: (data['amount'] as num).toDouble(),
      category: data['category'] as String,
      date: data['date'] as Timestamp,
      expenseType: data['expenseType'] as String? ?? 'personal',
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
      description: data['description'] as String?,
      receiptUrl: data['receiptUrl'] as String?,
      notes: data['notes'] as String?,
      syncStatus: data['syncStatus'] as String?,
      localId: data['localId'] as String?,
      groupId: data['groupId'] as String?,
      groupMetadata: data['groupMetadata'] as Map<String, dynamic>?,
      history: (data['history'] as List<dynamic>?)
          ?.map((e) => e as Map<String, dynamic>)
          .toList(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'vendor': vendor,
      'amount': amount,
      'category': category,
      'date': date,
      'expenseType': expenseType,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      if (description != null) 'description': description,
      if (receiptUrl != null) 'receiptUrl': receiptUrl,
      if (notes != null) 'notes': notes,
      'syncStatus': syncStatus ?? 'synced',
      if (localId != null) 'localId': localId,
      if (groupId != null) 'groupId': groupId,
      if (groupMetadata != null) 'groupMetadata': groupMetadata,
      if (history != null) 'history': history,
    };
  }
}
