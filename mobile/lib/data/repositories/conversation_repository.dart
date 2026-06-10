import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/conversation_model.dart';
import 'package:penny_mobile/data/models/message_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class ConversationRepository {
  ConversationRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<ConversationModel>> watchConversations(String userId) {
    return Stream.fromFuture(_listConversations(userId));
  }

  Future<List<ConversationModel>> _listConversations(String userId) async {
    final response = await _api.get(
      ApiEndpoints.conversations,
      queryParameters: {'userId': userId, 'limit': 100},
    );
    final data = responseMap(response);
    return listValue(data['conversations'])
        .map((json) => ConversationModel.fromFirestore(apiDocument(json)))
        .toList();
  }

  Future<String> createConversation({
    required String userId,
    required String firstMessage,
    required String firstMessageRole,
  }) async {
    final response = await _api.post(
      ApiEndpoints.conversations,
      data: {
        'userId': userId,
        'title': placeholderTitleFor(firstMessage),
        'firstMessage': firstMessage,
        'firstMessageRole': firstMessageRole,
      },
    );
    return (responseMap(response)['conversationId'] ?? '').toString();
  }

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

  Future<ConversationModel?> getConversation(String conversationId) async {
    final response = await _api.get(
      ApiEndpoints.conversationById(conversationId),
    );
    final conversation = responseMap(response)['conversation'];
    if (conversation == null) return null;
    return ConversationModel.fromFirestore(apiDocument(mapValue(conversation)));
  }

  Future<void> addMessage({
    required String conversationId,
    required String role,
    required String content,
    List<Map<String, dynamic>>? attachments,
    Map<String, dynamic>? expenseData,
  }) async {
    await _api.post(
      ApiEndpoints.conversationMessages(conversationId),
      data: {
        'role': role,
        'content': content,
        'attachments': ?attachments,
        'expenseData': ?expenseData,
      },
    );
  }

  Future<void> updateConversation(
    String conversationId,
    Map<String, dynamic> updates,
  ) async {
    final data = <String, dynamic>{};
    if (updates['title'] != null) data['title'] = updates['title'];
    if (updates['summary'] != null) data['summary'] = updates['summary'];
    if (updates['status'] != null) data['status'] = updates['status'];
    if (updates['metadata.isPinned'] != null) {
      data['isPinned'] = updates['metadata.isPinned'];
    }
    if (data.isEmpty) return;
    await _api.patch(ApiEndpoints.conversationById(conversationId), data: data);
  }

  Future<void> pinConversation(String conversationId, bool isPinned) =>
      updateConversation(conversationId, {'metadata.isPinned': isPinned});

  Future<void> archiveConversation(String conversationId) =>
      updateConversation(conversationId, {'status': 'archived'});

  Future<void> renameConversation(String conversationId, String title) =>
      updateConversation(conversationId, {'title': title});

  Future<void> deleteConversation(String conversationId) async {
    await _api.delete(ApiEndpoints.conversationById(conversationId));
  }

  Stream<List<MessageModel>> watchMessages(String conversationId) {
    return Stream.fromFuture(_listMessages(conversationId));
  }

  Future<List<MessageModel>> _listMessages(String conversationId) async {
    final response = await _api.get(
      ApiEndpoints.conversationMessages(conversationId),
      queryParameters: {'limit': 100},
    );
    final data = responseMap(response);
    return listValue(
      data['messages'],
    ).map((json) => MessageModel.fromFirestore(apiDocument(json))).toList();
  }
}
