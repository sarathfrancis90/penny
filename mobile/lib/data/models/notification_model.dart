import 'package:cloud_firestore/cloud_firestore.dart';

class NotificationModel {
  NotificationModel({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.body,
    required this.priority,
    required this.category,
    required this.read,
    required this.delivered,
    required this.isGrouped,
    required this.createdAt,
    this.icon,
    this.readAt,
    this.actionUrl,
    this.relatedId,
    this.relatedType,
    this.groupId,
    this.actorName,
    this.actorAvatar,
    this.groupCount,
    this.metadata,
  });

  final String id;
  final String userId;
  final String type;
  final String title;
  final String body;
  final String priority; // low, medium, high, critical
  final String category; // group, budget, system, social, income, savings
  final bool read;
  final bool delivered;
  final bool isGrouped;
  final Timestamp createdAt;
  final String? icon;
  final Timestamp? readAt;
  final String? actionUrl;
  final String? relatedId;
  final String? relatedType;
  final String? groupId;
  final String? actorName;
  final String? actorAvatar;
  final int? groupCount;
  final Map<String, dynamic>? metadata;

  factory NotificationModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return NotificationModel(
      id: doc.id,
      userId: data['userId'] as String,
      type: data['type'] as String,
      title: data['title'] as String,
      body: data['body'] as String,
      priority: data['priority'] as String? ?? 'medium',
      category: data['category'] as String? ?? 'system',
      read: data['read'] as bool? ?? false,
      delivered: data['delivered'] as bool? ?? false,
      isGrouped: data['isGrouped'] as bool? ?? false,
      createdAt: data['createdAt'] as Timestamp,
      icon: data['icon'] as String?,
      readAt: data['readAt'] as Timestamp?,
      actionUrl: data['actionUrl'] as String?,
      relatedId: data['relatedId'] as String?,
      relatedType: data['relatedType'] as String?,
      groupId: data['groupId'] as String?,
      actorName: data['actorName'] as String?,
      actorAvatar: data['actorAvatar'] as String?,
      groupCount: data['groupCount'] as int?,
      metadata: data['metadata'] != null
          ? Map<String, dynamic>.from(data['metadata'] as Map)
          : null,
    );
  }

  String get defaultIcon => switch (category) {
        'budget' => '📊',
        'group' => '👥',
        'income' => '💰',
        'savings' => '🎯',
        _ => '🔔',
      };

  String get timeAgo {
    final now = DateTime.now();
    final diff = now.difference(createdAt.toDate());
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${(diff.inDays / 7).floor()}w ago';
  }
}
