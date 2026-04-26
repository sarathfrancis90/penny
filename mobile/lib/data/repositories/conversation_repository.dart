import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/conversation_model.dart';
import 'package:penny_mobile/data/models/message_model.dart';

class ConversationRepository {
  ConversationRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Stream all conversations for a user.
  Stream<List<ConversationModel>> watchConversations(String userId) {
    return _db
        .collection('conversations')
        .where('userId', isEqualTo: userId)
        .where('status', isEqualTo: 'active')
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(ConversationModel.fromFirestore).toList());
  }

  /// Create a new conversation and its first message. The placeholder title
  /// is the first 6 words of [firstMessage] capped at 50 chars; the lazy AI
  /// title flow upgrades it later. Receipt uploads (messages starting with
  /// 📷) get the friendly placeholder "Receipt scan".
  Future<String> createConversation({
    required String userId,
    required String firstMessage,
    required String firstMessageRole,
  }) async {
    final now = Timestamp.now();
    final title = placeholderTitleFor(firstMessage);

    final docRef = await _db.collection('conversations').add({
      'userId': userId,
      'title': title,
      'createdAt': now,
      'updatedAt': now,
      'lastMessagePreview': firstMessage.length > 100
          ? '${firstMessage.substring(0, 100)}...'
          : firstMessage,
      'messageCount': 1,
      'status': 'active',
      'totalExpensesCreated': 0,
      'metadata': {
        'firstMessageTimestamp': now,
        'lastAccessedAt': now,
        'isPinned': false,
        'aiTitleGenerated': false,
      },
    });

    // Add the first message to the subcollection
    await _db
        .collection('conversations')
        .doc(docRef.id)
        .collection('messages')
        .add({
      'conversationId': docRef.id,
      'role': firstMessageRole,
      'content': firstMessage,
      'timestamp': now,
      'status': 'sent',
    });

    return docRef.id;
  }

  /// Build the placeholder title used at conversation creation time. Mirrors
  /// the web's `/api/conversations` POST handler: first 6 words, capped at
  /// 50 chars, with "…" appended when truncated. The 📷 prefix used by the
  /// mobile chat for receipt uploads gets a friendlier label.
  static String placeholderTitleFor(String firstMessage) {
    final trimmed = firstMessage.trim();
    if (trimmed.startsWith('📷')) return 'Receipt scan';
    final words = trimmed.split(RegExp(r'\s+'));
    final first6 = words.take(6).join(' ');
    if (first6.length <= 50) {
      return first6.isEmpty ? 'New chat' : first6;
    }
    return '${first6.substring(0, 50)}…';
  }

  /// Fetch a single conversation. Returns null when the document does not
  /// exist (e.g. it was just deleted, or the id is wrong).
  Future<ConversationModel?> getConversation(String conversationId) async {
    final doc =
        await _db.collection('conversations').doc(conversationId).get();
    if (!doc.exists) return null;
    return ConversationModel.fromFirestore(doc);
  }

  /// Add a message to an existing conversation.
  Future<void> addMessage({
    required String conversationId,
    required String role,
    required String content,
    List<Map<String, dynamic>>? attachments,
    Map<String, dynamic>? expenseData,
  }) async {
    final now = Timestamp.now();

    await _db
        .collection('conversations')
        .doc(conversationId)
        .collection('messages')
        .add({
      'conversationId': conversationId,
      'role': role,
      'content': content,
      'timestamp': now,
      'status': 'sent',
      if (attachments != null) 'attachments': attachments,
      if (expenseData != null) 'expenseData': expenseData,
    });

    // Update conversation metadata
    await _db.collection('conversations').doc(conversationId).update({
      'updatedAt': now,
      'lastMessagePreview':
          content.length > 100 ? '${content.substring(0, 100)}...' : content,
      'messageCount': FieldValue.increment(1),
      'metadata.lastAccessedAt': now,
    });
  }

  /// Update a conversation with arbitrary fields.
  Future<void> updateConversation(
      String conversationId, Map<String, dynamic> updates) async {
    await _db.collection('conversations').doc(conversationId).update({
      ...updates,
      'updatedAt': Timestamp.now(),
    });
  }

  /// Pin or unpin a conversation.
  Future<void> pinConversation(String conversationId, bool isPinned) =>
      updateConversation(conversationId, {'metadata.isPinned': isPinned});

  /// Archive a conversation (sets status to 'archived').
  Future<void> archiveConversation(String conversationId) =>
      updateConversation(conversationId, {'status': 'archived'});

  /// Rename a conversation.
  Future<void> renameConversation(String conversationId, String title) =>
      updateConversation(conversationId, {'title': title});

  /// Delete a conversation and all its messages.
  Future<void> deleteConversation(String conversationId) async {
    // Delete all messages in subcollection first
    final messages = await _db
        .collection('conversations')
        .doc(conversationId)
        .collection('messages')
        .get();
    final batch = _db.batch();
    for (final doc in messages.docs) {
      batch.delete(doc.reference);
    }
    batch.delete(_db.collection('conversations').doc(conversationId));
    await batch.commit();
  }

  /// Stream messages for a conversation.
  Stream<List<MessageModel>> watchMessages(String conversationId) {
    return _db
        .collection('conversations')
        .doc(conversationId)
        .collection('messages')
        .orderBy('timestamp', descending: false)
        .snapshots()
        .map((snap) =>
            snap.docs.map(MessageModel.fromFirestore).toList());
  }
}
