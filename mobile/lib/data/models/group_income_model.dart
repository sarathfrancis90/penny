import 'package:cloud_firestore/cloud_firestore.dart';

class GroupIncomeSourceModel {
  GroupIncomeSourceModel({
    required this.id,
    required this.groupId,
    required this.addedBy,
    required this.name,
    required this.category,
    required this.amount,
    required this.frequency,
    required this.isRecurring,
    required this.isActive,
    required this.taxable,
    required this.currency,
    required this.createdAt,
    required this.updatedAt,
    this.contributedBy,
    this.splitType = 'equal',
    this.description,
    this.netAmount,
    this.startDate,
    this.recurringDate,
  });

  final String id;
  final String groupId;
  final String addedBy;
  final String name;
  final String category; // salary, freelance, bonus, investment, rental, side_hustle, gift, other
  final double amount;
  final String frequency; // monthly, biweekly, weekly, yearly, once
  final bool isRecurring;
  final bool isActive;
  final bool taxable;
  final String currency;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final String? contributedBy;
  final String? splitType; // equal, proportional, custom
  final String? description;
  final double? netAmount;
  final Timestamp? startDate;
  final int? recurringDate;

  factory GroupIncomeSourceModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return GroupIncomeSourceModel(
      id: doc.id,
      groupId: data['groupId'] as String? ?? '',
      addedBy: data['addedBy'] as String? ?? '',
      name: data['name'] as String? ?? '',
      category: data['category'] as String? ?? 'other',
      amount: (data['amount'] as num?)?.toDouble() ?? 0,
      frequency: data['frequency'] as String? ?? 'monthly',
      isRecurring: data['isRecurring'] as bool? ?? true,
      isActive: data['isActive'] as bool? ?? true,
      taxable: data['taxable'] as bool? ?? true,
      currency: data['currency'] as String? ?? 'CAD',
      createdAt: data['createdAt'] as Timestamp? ?? Timestamp.now(),
      updatedAt: data['updatedAt'] as Timestamp? ?? Timestamp.now(),
      contributedBy: data['contributedBy'] as String?,
      splitType: data['splitType'] as String? ?? 'equal',
      description: data['description'] as String?,
      netAmount: (data['netAmount'] as num?)?.toDouble(),
      startDate: data['startDate'] as Timestamp?,
      recurringDate: data['recurringDate'] as int?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'groupId': groupId,
      'addedBy': addedBy,
      'name': name,
      'category': category,
      'amount': amount,
      'frequency': frequency,
      'isRecurring': isRecurring,
      'isActive': isActive,
      'taxable': taxable,
      'currency': currency,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      if (contributedBy != null) 'contributedBy': contributedBy,
      if (splitType != null) 'splitType': splitType,
      if (description != null) 'description': description,
      if (netAmount != null) 'netAmount': netAmount,
      if (startDate != null) 'startDate': startDate,
      if (recurringDate != null) 'recurringDate': recurringDate,
    };
  }

  String get frequencyLabel => switch (frequency) {
        'monthly' => '/mo',
        'biweekly' => '/2wk',
        'weekly' => '/wk',
        'yearly' => '/yr',
        'once' => 'one-time',
        _ => '',
      };

  double get monthlyAmount => switch (frequency) {
        'monthly' => amount,
        'biweekly' => amount * 26 / 12,
        'weekly' => amount * 52 / 12,
        'yearly' => amount / 12,
        _ => amount,
      };
}
