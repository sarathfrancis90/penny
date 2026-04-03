import 'package:cloud_firestore/cloud_firestore.dart';

class BudgetModel {
  BudgetModel({
    required this.id,
    required this.userId,
    required this.category,
    required this.monthlyLimit,
    required this.period,
    required this.settings,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String category;
  final double monthlyLimit;
  final BudgetPeriod period;
  final BudgetSettings settings;
  final Timestamp createdAt;
  final Timestamp updatedAt;

  factory BudgetModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return BudgetModel(
      id: doc.id,
      userId: data['userId'] as String,
      category: data['category'] as String,
      monthlyLimit: (data['monthlyLimit'] as num).toDouble(),
      period: BudgetPeriod.fromMap(data['period'] as Map<String, dynamic>),
      settings:
          BudgetSettings.fromMap(data['settings'] as Map<String, dynamic>? ?? {}),
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'category': category,
      'monthlyLimit': monthlyLimit,
      'period': period.toMap(),
      'settings': settings.toMap(),
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
}

class BudgetPeriod {
  const BudgetPeriod({required this.month, required this.year});

  final int month; // 1-12
  final int year;

  factory BudgetPeriod.fromMap(Map<String, dynamic> map) {
    return BudgetPeriod(
      month: map['month'] as int,
      year: map['year'] as int,
    );
  }

  factory BudgetPeriod.current() {
    final now = DateTime.now();
    return BudgetPeriod(month: now.month, year: now.year);
  }

  Map<String, dynamic> toMap() => {'month': month, 'year': year};

  @override
  bool operator ==(Object other) =>
      other is BudgetPeriod && month == other.month && year == other.year;

  @override
  int get hashCode => month.hashCode ^ year.hashCode;
}

class BudgetSettings {
  const BudgetSettings({
    this.rollover = false,
    this.alertThreshold = 80,
    this.notificationsEnabled = true,
  });

  final bool rollover;
  final double alertThreshold;
  final bool notificationsEnabled;

  factory BudgetSettings.fromMap(Map<String, dynamic> map) {
    return BudgetSettings(
      rollover: map['rollover'] as bool? ?? false,
      alertThreshold: (map['alertThreshold'] as num?)?.toDouble() ?? 80,
      notificationsEnabled: map['notificationsEnabled'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toMap() => {
        'rollover': rollover,
        'alertThreshold': alertThreshold,
        'notificationsEnabled': notificationsEnabled,
      };
}

/// Computed budget usage (not stored in Firestore).
class BudgetUsage {
  const BudgetUsage({
    required this.category,
    required this.budgetLimit,
    required this.totalSpent,
    required this.remainingAmount,
    required this.percentageUsed,
    required this.status,
    required this.expenseCount,
  });

  final String category;
  final double budgetLimit;
  final double totalSpent;
  final double remainingAmount;
  final double percentageUsed;
  final BudgetStatus status;
  final int expenseCount;

  static BudgetStatus computeStatus(double percentageUsed) {
    if (percentageUsed >= 100) return BudgetStatus.over;
    if (percentageUsed >= 90) return BudgetStatus.critical;
    if (percentageUsed >= 75) return BudgetStatus.warning;
    return BudgetStatus.safe;
  }
}

enum BudgetStatus { safe, warning, critical, over }
