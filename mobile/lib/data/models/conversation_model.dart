import 'package:cloud_firestore/cloud_firestore.dart';

class ConversationModel {
  ConversationModel({
    required this.id,
    required this.userId,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    required this.lastMessagePreview,
    required this.messageCount,
    required this.status,
    required this.totalExpensesCreated,
    required this.metadata,
  });

  final String id;
  final String userId;
  final String title;
  final Timestamp createdAt;
  final Timestamp updatedAt;
  final String lastMessagePreview;
  final int messageCount;
  final String status; // 'active' | 'archived'
  final int totalExpensesCreated;
  final ConversationMetadata metadata;

  factory ConversationModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return ConversationModel(
      id: doc.id,
      userId: data['userId'] as String,
      title: data['title'] as String? ?? 'New Chat',
      createdAt: data['createdAt'] as Timestamp,
      updatedAt: data['updatedAt'] as Timestamp,
      lastMessagePreview: data['lastMessagePreview'] as String? ?? '',
      messageCount: data['messageCount'] as int? ?? 0,
      status: data['status'] as String? ?? 'active',
      totalExpensesCreated: data['totalExpensesCreated'] as int? ?? 0,
      metadata: ConversationMetadata.fromMap(
        data['metadata'] as Map<String, dynamic>? ?? {},
      ),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'title': title,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'lastMessagePreview': lastMessagePreview,
      'messageCount': messageCount,
      'status': status,
      'totalExpensesCreated': totalExpensesCreated,
      'metadata': metadata.toMap(),
    };
  }
}

class ConversationMetadata {
  ConversationMetadata({
    this.firstMessageTimestamp,
    required this.lastAccessedAt,
    required this.isPinned,
    this.aiTitleGenerated = false,
  });

  final Timestamp? firstMessageTimestamp;
  final Timestamp lastAccessedAt;
  final bool isPinned;

  /// True once the lazy AI title-generation flow has produced a Gemini title
  /// for this conversation. Prevents repeated regeneration on every new
  /// message past the threshold.
  final bool aiTitleGenerated;

  factory ConversationMetadata.fromMap(Map<String, dynamic> map) {
    return ConversationMetadata(
      firstMessageTimestamp: map['firstMessageTimestamp'] as Timestamp?,
      lastAccessedAt:
          map['lastAccessedAt'] as Timestamp? ?? Timestamp.now(),
      isPinned: map['isPinned'] as bool? ?? false,
      aiTitleGenerated: map['aiTitleGenerated'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (firstMessageTimestamp != null)
        'firstMessageTimestamp': firstMessageTimestamp,
      'lastAccessedAt': lastAccessedAt,
      'isPinned': isPinned,
      'aiTitleGenerated': aiTitleGenerated,
    };
  }
}
