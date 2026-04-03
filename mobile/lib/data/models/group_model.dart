import 'package:cloud_firestore/cloud_firestore.dart';

class GroupModel {
  GroupModel({
    required this.id,
    required this.name,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
    required this.settings,
    required this.status,
    required this.stats,
    this.description,
    this.color,
    this.icon,
  });

  final String id;
  final String name;
  final String createdBy;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final GroupSettings settings;
  final String status; // active, archived, deleted
  final GroupStats stats;
  final String? description;
  final String? color;
  final String? icon;

  factory GroupModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return GroupModel(
      id: doc.id,
      name: data['name'] as String,
      createdBy: data['createdBy'] as String,
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
      settings: GroupSettings.fromMap(
          Map<String, dynamic>.from(data['settings'] as Map? ?? {})),
      status: data['status'] as String? ?? 'active',
      stats: GroupStats.fromMap(
          Map<String, dynamic>.from(data['stats'] as Map? ?? {})),
      description: data['description'] as String?,
      color: data['color'] as String?,
      icon: data['icon'] as String?,
    );
  }
}

class GroupSettings {
  const GroupSettings({
    this.defaultCategory,
    this.budget,
    this.budgetPeriod,
    this.requireApproval = false,
    this.allowMemberInvites = true,
    this.currency,
  });

  final String? defaultCategory;
  final double? budget;
  final String? budgetPeriod;
  final bool requireApproval;
  final bool allowMemberInvites;
  final String? currency;

  factory GroupSettings.fromMap(Map<String, dynamic> map) {
    return GroupSettings(
      defaultCategory: map['defaultCategory'] as String?,
      budget: (map['budget'] as num?)?.toDouble(),
      budgetPeriod: map['budgetPeriod'] as String?,
      requireApproval: map['requireApproval'] as bool? ?? false,
      allowMemberInvites: map['allowMemberInvites'] as bool? ?? true,
      currency: map['currency'] as String?,
    );
  }

  Map<String, dynamic> toMap() => {
        if (defaultCategory != null) 'defaultCategory': defaultCategory,
        if (budget != null) 'budget': budget,
        if (budgetPeriod != null) 'budgetPeriod': budgetPeriod,
        'requireApproval': requireApproval,
        'allowMemberInvites': allowMemberInvites,
        if (currency != null) 'currency': currency,
      };
}

class GroupStats {
  const GroupStats({
    this.memberCount = 0,
    this.expenseCount = 0,
    this.totalAmount = 0,
    this.lastActivityAt,
  });

  final int memberCount;
  final int expenseCount;
  final double totalAmount;
  final Timestamp? lastActivityAt;

  factory GroupStats.fromMap(Map<String, dynamic> map) {
    return GroupStats(
      memberCount: map['memberCount'] as int? ?? 0,
      expenseCount: map['expenseCount'] as int? ?? 0,
      totalAmount: (map['totalAmount'] as num?)?.toDouble() ?? 0,
      lastActivityAt: map['lastActivityAt'] as Timestamp?,
    );
  }
}
