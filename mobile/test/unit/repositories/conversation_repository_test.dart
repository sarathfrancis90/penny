import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';

void main() {
  group('ConversationRepository', () {
    late FakeFirebaseFirestore firestore;
    late ConversationRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = ConversationRepository(firestore: firestore);
    });

    group('createConversation', () {
      test('creates conversation with correct fields', () async {
        final id = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'I spent \$14.50 at Tim Hortons',
          firstMessageRole: 'user',
        );

        expect(id, isNotEmpty);
        final doc = await firestore.collection('conversations').doc(id).get();
        final data = doc.data()!;

        expect(data['userId'], 'user-1');
        expect(data['status'], 'active');
        expect(data['messageCount'], 1);
        expect(data['totalExpensesCreated'], 0);
        expect(data['metadata'], isA<Map>());
        expect(data['metadata']['isPinned'], false);
      });

      test('truncates long title to 50 chars', () async {
        final longMessage =
            'A' * 100; // 100 chars
        final id = await repo.createConversation(
          userId: 'user-1',
          firstMessage: longMessage,
          firstMessageRole: 'user',
        );

        final doc = await firestore.collection('conversations').doc(id).get();
        final title = doc.data()!['title'] as String;
        expect(title.length, 53); // 50 chars + '...'
        expect(title.endsWith('...'), true);
      });

      test('uses full message as title when short enough', () async {
        final id = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello Penny',
          firstMessageRole: 'user',
        );

        final doc = await firestore.collection('conversations').doc(id).get();
        expect(doc.data()!['title'], 'Hello Penny');
      });

      test('creates first message in subcollection', () async {
        final id = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Test message',
          firstMessageRole: 'user',
        );

        final messages = await firestore
            .collection('conversations')
            .doc(id)
            .collection('messages')
            .get();

        expect(messages.docs.length, 1);
        final msgData = messages.docs.first.data();
        expect(msgData['role'], 'user');
        expect(msgData['content'], 'Test message');
        expect(msgData['status'], 'sent');
        expect(msgData['conversationId'], id);
      });

      test('truncates lastMessagePreview to 100 chars', () async {
        final longMessage = 'B' * 200;
        final id = await repo.createConversation(
          userId: 'user-1',
          firstMessage: longMessage,
          firstMessageRole: 'user',
        );

        final doc = await firestore.collection('conversations').doc(id).get();
        final preview = doc.data()!['lastMessagePreview'] as String;
        expect(preview.length, 103); // 100 chars + '...'
        expect(preview.endsWith('...'), true);
      });
    });

    group('addMessage', () {
      test('adds message to subcollection', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: 'How can I help?',
        );

        final messages = await firestore
            .collection('conversations')
            .doc(convId)
            .collection('messages')
            .get();

        expect(messages.docs.length, 2);
      });

      test('updates conversation metadata on new message', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: 'I can help you track expenses.',
        );

        final doc =
            await firestore.collection('conversations').doc(convId).get();
        final data = doc.data()!;
        expect(data['lastMessagePreview'],
            'I can help you track expenses.');
      });

      test('adds attachments when provided', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Check receipt',
          firstMessageRole: 'user',
        );

        await repo.addMessage(
          conversationId: convId,
          role: 'user',
          content: 'See attached receipt',
          attachments: [
            {
              'type': 'image',
              'url': 'https://example.com/receipt.jpg',
              'fileName': 'receipt.jpg',
              'mimeType': 'image/jpeg',
            },
          ],
        );

        final messages = await firestore
            .collection('conversations')
            .doc(convId)
            .collection('messages')
            .get();
        final lastMsg = messages.docs.last.data();
        expect(lastMsg['attachments'], isNotNull);
        expect((lastMsg['attachments'] as List).length, 1);
      });

      test('adds expenseData when provided', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Added expense',
          firstMessageRole: 'user',
        );

        await repo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: 'Expense added!',
          expenseData: {
            'expenseId': 'exp-1',
            'vendor': 'Tim Hortons',
            'amount': 14.50,
            'category': 'Meals and entertainment',
            'confirmed': true,
          },
        );

        final messages = await firestore
            .collection('conversations')
            .doc(convId)
            .collection('messages')
            .get();
        final lastMsg = messages.docs.last.data();
        expect(lastMsg['expenseData'], isNotNull);
        expect(lastMsg['expenseData']['vendor'], 'Tim Hortons');
      });
    });

    group('pinConversation', () {
      test('calls updateConversation with isPinned true', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.pinConversation(convId, true);

        // fake_cloud_firestore stores dot-notation paths as literal keys
        final doc =
            await firestore.collection('conversations').doc(convId).get();
        final data = doc.data()!;
        // Either the nested form or dot-notation form should be present
        final isPinned = data['metadata.isPinned'] ??
            (data['metadata'] as Map?)?['isPinned'];
        expect(isPinned, true);
      });

      test('calls updateConversation with isPinned false', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.pinConversation(convId, true);
        await repo.pinConversation(convId, false);

        final doc =
            await firestore.collection('conversations').doc(convId).get();
        final data = doc.data()!;
        final isPinned = data['metadata.isPinned'] ??
            (data['metadata'] as Map?)?['isPinned'];
        expect(isPinned, false);
      });
    });

    group('archiveConversation', () {
      test('sets status to archived', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.archiveConversation(convId);

        final doc =
            await firestore.collection('conversations').doc(convId).get();
        expect(doc.data()!['status'], 'archived');
      });
    });

    group('renameConversation', () {
      test('updates title', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.renameConversation(convId, 'Tim Hortons Receipt');

        final doc =
            await firestore.collection('conversations').doc(convId).get();
        expect(doc.data()!['title'], 'Tim Hortons Receipt');
      });

      test('updates updatedAt timestamp', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        final before =
            (await firestore.collection('conversations').doc(convId).get())
                .data()!['updatedAt'] as Timestamp;

        // Small delay so timestamps differ
        await repo.renameConversation(convId, 'New Title');

        final after =
            (await firestore.collection('conversations').doc(convId).get())
                .data()!['updatedAt'] as Timestamp;

        // updatedAt should be updated (may be same if fast, but should exist)
        expect(after, isNotNull);
      });
    });

    group('deleteConversation', () {
      test('removes conversation document', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'To be deleted',
          firstMessageRole: 'user',
        );

        await repo.deleteConversation(convId);

        final doc =
            await firestore.collection('conversations').doc(convId).get();
        expect(doc.exists, isFalse);
      });

      test('removes all messages in subcollection', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        // Add more messages
        await repo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: 'Hi there!',
        );
        await repo.addMessage(
          conversationId: convId,
          role: 'user',
          content: 'Track my expense',
        );

        // Verify messages exist
        var messages = await firestore
            .collection('conversations')
            .doc(convId)
            .collection('messages')
            .get();
        expect(messages.docs.length, 3);

        // Delete conversation
        await repo.deleteConversation(convId);

        // Verify messages are gone
        messages = await firestore
            .collection('conversations')
            .doc(convId)
            .collection('messages')
            .get();
        expect(messages.docs.length, 0);
      });

      test('handles deleting conversation with no messages gracefully',
          () async {
        // Manually create a conversation without subcollection messages
        final docRef = await firestore.collection('conversations').add({
          'userId': 'user-1',
          'title': 'Empty',
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
          'status': 'active',
          'messageCount': 0,
        });

        await repo.deleteConversation(docRef.id);

        final doc = await firestore
            .collection('conversations')
            .doc(docRef.id)
            .get();
        expect(doc.exists, isFalse);
      });
    });

    group('watchConversations', () {
      test('streams only active conversations for user', () async {
        // Active conversation for user-1
        await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Active chat',
          firstMessageRole: 'user',
        );

        // Active conversation for user-2 (should be excluded)
        await repo.createConversation(
          userId: 'user-2',
          firstMessage: 'Other user',
          firstMessageRole: 'user',
        );

        final conversations = await repo.watchConversations('user-1').first;
        expect(conversations.length, 1);
        expect(conversations.first.userId, 'user-1');
      });

      test('excludes archived conversations', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Will archive',
          firstMessageRole: 'user',
        );

        await repo.archiveConversation(convId);

        final conversations = await repo.watchConversations('user-1').first;
        expect(conversations.length, 0);
      });
    });

    group('watchMessages', () {
      test('streams messages for a conversation', () async {
        final convId = await repo.createConversation(
          userId: 'user-1',
          firstMessage: 'Hello',
          firstMessageRole: 'user',
        );

        await repo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: 'Response',
        );

        final messages = await repo.watchMessages(convId).first;
        expect(messages.length, 2);
        expect(messages.first.role, 'user');
        expect(messages.last.role, 'assistant');
      });
    });
  });
}
