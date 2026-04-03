import 'package:cloud_firestore/cloud_firestore.dart';

class SavingsGoalModel {
  SavingsGoalModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.category,
    required this.targetAmount,
    required this.currentAmount,
    required this.monthlyContribution,
    required this.status,
    required this.isActive,
    required this.priority,
    required this.currency,
    required this.startDate,
    required this.createdAt,
    required this.updatedAt,
    this.targetDate,
    this.achievedDate,
    this.progressPercentage = 0,
    this.monthsToGoal,
    this.onTrack = false,
    this.description,
    this.emoji,
    this.lastContributionAt,
  });

  final String id;
  final String userId;
  final String name;
  final String category; // emergency_fund, travel, education, health, house_down_payment, car, wedding, retirement, investment, custom
  final double targetAmount;
  final double currentAmount;
  final double monthlyContribution;
  final String status; // active, achieved, paused, cancelled
  final bool isActive;
  final String priority; // low, medium, high, critical
  final String currency;
  final Timestamp startDate;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final Timestamp? targetDate;
  final Timestamp? achievedDate;
  final double progressPercentage;
  final int? monthsToGoal;
  final bool onTrack;
  final String? description;
  final String? emoji;
  final Timestamp? lastContributionAt;

  factory SavingsGoalModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return SavingsGoalModel(
      id: doc.id,
      userId: data['userId'] as String,
      name: data['name'] as String,
      category: data['category'] as String,
      targetAmount: (data['targetAmount'] as num).toDouble(),
      currentAmount: (data['currentAmount'] as num).toDouble(),
      monthlyContribution: (data['monthlyContribution'] as num).toDouble(),
      status: data['status'] as String? ?? 'active',
      isActive: data['isActive'] as bool? ?? true,
      priority: data['priority'] as String? ?? 'medium',
      currency: data['currency'] as String? ?? 'CAD',
      startDate: data['startDate'] as Timestamp,
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
      targetDate: data['targetDate'] as Timestamp?,
      achievedDate: data['achievedDate'] as Timestamp?,
      progressPercentage:
          (data['progressPercentage'] as num?)?.toDouble() ?? 0,
      monthsToGoal: data['monthsToGoal'] as int?,
      onTrack: data['onTrack'] as bool? ?? false,
      description: data['description'] as String?,
      emoji: data['emoji'] as String?,
      lastContributionAt: data['lastContributionAt'] as Timestamp?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'name': name,
      'category': category,
      'targetAmount': targetAmount,
      'currentAmount': currentAmount,
      'monthlyContribution': monthlyContribution,
      'status': status,
      'isActive': isActive,
      'priority': priority,
      'currency': currency,
      'startDate': startDate,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      if (targetDate != null) 'targetDate': targetDate,
      if (achievedDate != null) 'achievedDate': achievedDate,
      'progressPercentage': progressPercentage,
      if (monthsToGoal != null) 'monthsToGoal': monthsToGoal,
      'onTrack': onTrack,
      if (description != null) 'description': description,
      if (emoji != null) 'emoji': emoji,
      if (lastContributionAt != null) 'lastContributionAt': lastContributionAt,
    };
  }

  String get defaultEmoji {
    return switch (category) {
      'emergency_fund' => '💰',
      'travel' => '✈️',
      'education' => '🎓',
      'health' => '💊',
      'house_down_payment' => '🏠',
      'car' => '🚗',
      'wedding' => '💍',
      'retirement' => '🏖️',
      'investment' => '📈',
      _ => '🎯',
    };
  }
}
