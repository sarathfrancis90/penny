import 'package:cloud_firestore/cloud_firestore.dart';

class GroupActivityModel {
  GroupActivityModel({
    required this.id,
    required this.groupId,
    required this.userId,
    required this.action,
    required this.createdAt,
    this.userName,
    this.details,
    this.metadata,
  });

  final String id;
  final String groupId;
  final String userId;
  final String action;
  final Timestamp createdAt;
  final String? userName;
  final String? details;
  final Map<String, dynamic>? metadata;

  factory GroupActivityModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return GroupActivityModel(
      id: doc.id,
      groupId: data['groupId'] as String? ?? '',
      userId: data['userId'] as String? ?? '',
      action: data['action'] as String? ?? '',
      createdAt: data['createdAt'] as Timestamp? ?? Timestamp.now(),
      userName: data['userName'] as String?,
      details: data['details'] as String?,
      metadata: data['metadata'] != null
          ? Map<String, dynamic>.from(data['metadata'] as Map)
          : null,
    );
  }

  String get icon => switch (action) {
        'group_created' => '🎉',
        'member_invited' => '📨',
        'member_joined' => '👋',
        'member_left' => '👤',
        'member_removed' => '❌',
        'member_role_changed' => '🔄',
        'expense_added' => '💵',
        'expense_updated' => '✏️',
        'expense_deleted' => '🗑️',
        'expense_approved' => '✅',
        'expense_rejected' => '❌',
        'settings_updated' => '⚙️',
        _ => '📝',
      };

  String get displayText =>
      details ?? '${userName ?? "Someone"} performed $action';

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
