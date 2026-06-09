import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('ConversationRepository API contract', () {
    test('watchConversations reads conversation API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'conversations': [
            {
              'id': 'conversation-1',
              'userId': 'user-1',
              'title': 'Lunch',
              'status': 'active',
              'messageCount': 1,
              'createdAt': '2026-06-01T00:00:00.000Z',
              'updatedAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = ConversationRepository(apiClient: api);

      final conversations = await repo.watchConversations('user-1').first;

      expect(conversations.single.id, 'conversation-1');
      expect(api.calls.single.path, ApiEndpoints.conversations);
      expect(api.calls.single.queryParameters, {
        'userId': 'user-1',
        'limit': 100,
      });
    });

    test('createConversation posts first message payload', () async {
      final api = FakeApiClient()
        ..queueResponse({'conversationId': 'conversation-2'});
      final repo = ConversationRepository(apiClient: api);

      final id = await repo.createConversation(
        userId: 'user-1',
        firstMessage: 'Lunch at Tim Hortons',
        firstMessageRole: 'user',
      );

      expect(id, 'conversation-2');
      expect(api.calls.single.method, 'POST');
      expect(api.calls.single.path, ApiEndpoints.conversations);
      expect(api.calls.single.data, containsPair('userId', 'user-1'));
      expect(api.calls.single.data, containsPair('firstMessageRole', 'user'));
    });

    test('messages and mutations use conversation API resources', () async {
      final api = FakeApiClient()
        ..queueResponse({})
        ..queueResponse({})
        ..queueResponse({
          'messages': [
            {
              'id': 'message-1',
              'conversationId': 'conversation-1',
              'role': 'user',
              'content': 'Hello',
              'timestamp': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = ConversationRepository(apiClient: api);

      await repo.addMessage(
        conversationId: 'conversation-1',
        role: 'user',
        content: 'Hello',
      );
      await repo.renameConversation('conversation-1', 'Renamed');
      final messages = await repo.watchMessages('conversation-1').first;

      expect(messages.single.id, 'message-1');
      expect(api.calls[0].method, 'POST');
      expect(
        api.calls[0].path,
        ApiEndpoints.conversationMessages('conversation-1'),
      );
      expect(api.calls[1].method, 'PATCH');
      expect(
        api.calls[1].path,
        ApiEndpoints.conversationById('conversation-1'),
      );
      expect(api.calls[1].data, {'title': 'Renamed'});
      expect(api.calls[2].method, 'GET');
      expect(
        api.calls[2].path,
        ApiEndpoints.conversationMessages('conversation-1'),
      );
    });
  });
}
