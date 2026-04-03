import 'package:cloud_firestore/cloud_firestore.dart';

class IncomeSourceModel {
  IncomeSourceModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.category,
    required this.amount,
    required this.frequency,
    required this.isRecurring,
    required this.isActive,
    required this.taxable,
    required this.currency,
    required this.startDate,
    required this.createdAt,
    required this.updatedAt,
    this.recurringDate,
    this.endDate,
    this.description,
    this.netAmount,
    this.lastReceivedAt,
  });

  final String id;
  final String userId;
  final String name;
  final String category; // salary, freelance, bonus, investment, rental, side_hustle, gift, other
  final double amount;
  final String frequency; // monthly, biweekly, weekly, once, yearly
  final bool isRecurring;
  final bool isActive;
  final bool taxable;
  final String currency;
  final Timestamp startDate;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final int? recurringDate; // day of month 1-31
  final Timestamp? endDate;
  final String? description;
  final double? netAmount;
  final Timestamp? lastReceivedAt;

  factory IncomeSourceModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return IncomeSourceModel(
      id: doc.id,
      userId: data['userId'] as String,
      name: data['name'] as String,
      category: data['category'] as String,
      amount: (data['amount'] as num).toDouble(),
      frequency: data['frequency'] as String,
      isRecurring: data['isRecurring'] as bool? ?? false,
      isActive: data['isActive'] as bool? ?? true,
      taxable: data['taxable'] as bool? ?? true,
      currency: data['currency'] as String? ?? 'CAD',
      startDate: data['startDate'] as Timestamp,
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
      recurringDate: data['recurringDate'] as int?,
      endDate: data['endDate'] as Timestamp?,
      description: data['description'] as String?,
      netAmount: (data['netAmount'] as num?)?.toDouble(),
      lastReceivedAt: data['lastReceivedAt'] as Timestamp?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'name': name,
      'category': category,
      'amount': amount,
      'frequency': frequency,
      'isRecurring': isRecurring,
      'isActive': isActive,
      'taxable': taxable,
      'currency': currency,
      'startDate': startDate,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      if (recurringDate != null) 'recurringDate': recurringDate,
      if (endDate != null) 'endDate': endDate,
      if (description != null) 'description': description,
      if (netAmount != null) 'netAmount': netAmount,
      if (lastReceivedAt != null) 'lastReceivedAt': lastReceivedAt,
    };
  }

  String get frequencyLabel {
    return switch (frequency) {
      'monthly' => '/mo',
      'biweekly' => '/2wk',
      'weekly' => '/wk',
      'yearly' => '/yr',
      'once' => 'one-time',
      _ => '',
    };
  }
}
