import 'package:cloud_firestore/cloud_firestore.dart';

class GroupSavingsGoalModel {
  GroupSavingsGoalModel({
    required this.id,
    required this.groupId,
    required this.createdBy,
    required this.name,
    required this.category,
    required this.targetAmount,
    required this.currentAmount,
    required this.monthlyContribution,
    required this.status,
    required this.isActive,
    required this.priority,
    required this.currency,
    required this.createdAt,
    required this.updatedAt,
    this.contributionType = 'equal',
    this.targetDate,
    this.startDate,
    this.achievedDate,
    this.progressPercentage = 0,
    this.description,
    this.emoji,
    this.lastContributionAt,
  });

  final String id;
  final String groupId;
  final String createdBy;
  final String name;
  final String category; // emergency_fund, travel, education, health, house_down_payment, car, wedding, retirement, investment, custom
  final double targetAmount;
  final double currentAmount;
  final double monthlyContribution;
  final String status; // active, achieved, paused, cancelled
  final bool isActive;
  final String priority; // low, medium, high, critical
  final String currency;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final String contributionType; // equal, proportional, custom
  final Timestamp? targetDate;
  final Timestamp? startDate;
  final Timestamp? achievedDate;
  final double progressPercentage;
  final String? description;
  final String? emoji;
  final Timestamp? lastContributionAt;

  factory GroupSavingsGoalModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return GroupSavingsGoalModel(
      id: doc.id,
      groupId: data['groupId'] as String,
      createdBy: data['createdBy'] as String,
      name: data['name'] as String,
      category: data['category'] as String,
      targetAmount: (data['targetAmount'] as num).toDouble(),
      currentAmount: (data['currentAmount'] as num).toDouble(),
      monthlyContribution: (data['monthlyContribution'] as num).toDouble(),
      status: data['status'] as String? ?? 'active',
      isActive: data['isActive'] as bool? ?? true,
      priority: data['priority'] as String? ?? 'medium',
      currency: data['currency'] as String? ?? 'CAD',
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
      contributionType: data['contributionType'] as String? ?? 'equal',
      targetDate: data['targetDate'] as Timestamp?,
      startDate: data['startDate'] as Timestamp?,
      achievedDate: data['achievedDate'] as Timestamp?,
      progressPercentage:
          (data['progressPercentage'] as num?)?.toDouble() ?? 0,
      description: data['description'] as String?,
      emoji: data['emoji'] as String?,
      lastContributionAt: data['lastContributionAt'] as Timestamp?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'groupId': groupId,
      'createdBy': createdBy,
      'name': name,
      'category': category,
      'targetAmount': targetAmount,
      'currentAmount': currentAmount,
      'monthlyContribution': monthlyContribution,
      'status': status,
      'isActive': isActive,
      'priority': priority,
      'currency': currency,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'contributionType': contributionType,
      'progressPercentage': progressPercentage,
      if (targetDate != null) 'targetDate': targetDate,
      if (startDate != null) 'startDate': startDate,
      if (achievedDate != null) 'achievedDate': achievedDate,
      if (description != null) 'description': description,
      if (emoji != null) 'emoji': emoji,
      if (lastContributionAt != null) 'lastContributionAt': lastContributionAt,
    };
  }

  double get computedProgress =>
      targetAmount > 0 ? (currentAmount / targetAmount * 100).clamp(0, 100) : 0;

  String get defaultEmoji => switch (category) {
        'emergency_fund' => '\u{1F6E1}\u{FE0F}',
        'travel' => '\u{2708}\u{FE0F}',
        'education' => '\u{1F4DA}',
        'health' => '\u{1F3E5}',
        'house_down_payment' => '\u{1F3E0}',
        'car' => '\u{1F697}',
        'wedding' => '\u{1F48D}',
        'retirement' => '\u{1F3D6}\u{FE0F}',
        'investment' => '\u{1F4C8}',
        _ => '\u{1F3AF}',
      };
}
