import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/services/storage_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

const _analysis = {
  'success': true,
  'data': {
    'vendor': 'Tim Hortons',
    'amount': 6.42,
    'date': '2026-11-09',
    'category': 'Meals and entertainment',
  },
};

void main() {
  late FakeApiClient api;
  late List<String> changed;
  late Directory dir;
  late File photo;

  ChatNotifier notifier({void Function(String id)? onMessagesChanged}) {
    return ChatNotifier(
      aiRepo: AiRepository(apiClient: api),
      conversationRepo: ConversationRepository(apiClient: api),
      storageService: StorageService(apiClient: api),
      userId: 'u1',
      onMessagesChanged: (id) {
        changed.add(id);
        onMessagesChanged?.call(id);
      },
    );
  }

  ChatState stateOf(ChatNotifier chat) {
    late ChatState current;
    chat.addListener((state) => current = state)();
    return current;
  }

  setUp(() async {
    api = FakeApiClient();
    changed = [];
    dir = await Directory.systemTemp.createTemp('penny_chat');
    photo = File('${dir.path}/receipt.jpg')..writeAsBytesSync([1, 2, 3]);
  });

  tearDown(() => dir.delete(recursive: true));

  int posts(String path) =>
      api.calls.where((c) => c.method == 'POST' && c.path == path).length;

  group('message list refresh', () {
    test('messages are reloaded after the assistant reply is saved', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.aiChat,
        () => {'success': true, 'message': 'You spent 40 dollars.'},
      );
      var repliesSavedAtLastRefresh = 0;
      final chat = notifier(
        onMessagesChanged: (_) => repliesSavedAtLastRefresh = posts(
          ApiEndpoints.conversationMessages('c1'),
        ),
      );

      await chat.sendMessage('How much did I spend this month?');

      expect(changed, isNotEmpty);
      expect(changed.toSet(), {'c1'});
      // The last reload happened after the assistant message was stored.
      expect(repliesSavedAtLastRefresh, 1);
    });

    test('messagesProvider refetches after a send and when a conversation is '
        'reopened', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.aiChat,
        () => {'success': true, 'message': 'Hello'},
      );
      api.stub(
        ApiEndpoints.conversationMessages('c1'),
        () => {'messages': <Object>[]},
      );
      final container = ProviderContainer(
        overrides: [
          currentUserProvider.overrideWithValue(createMockUser(uid: 'u1')),
          apiClientProvider.overrideWithValue(api),
        ],
      );
      addTearDown(container.dispose);
      final sub = container.listen(messagesProvider('c1'), (_, _) {});
      addTearDown(sub.close);
      int fetches() => api.calls
          .where(
            (c) =>
                c.method == 'GET' &&
                c.path == ApiEndpoints.conversationMessages('c1'),
          )
          .length;

      await container.read(messagesProvider('c1').future);
      expect(fetches(), 1);

      await container.read(chatProvider.notifier).sendMessage('Hi there');
      await container.read(messagesProvider('c1').future);
      expect(fetches(), greaterThan(1));

      final before = fetches();
      container.read(chatProvider.notifier).loadConversation('c1');
      await container.read(messagesProvider('c1').future);
      expect(fetches(), before + 1);
    });
  });

  group('receipt photo', () {
    test(
      'a failed photo upload keeps the analysed expense and adds a note',
      () async {
        api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
        api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
        api.stub(
          ApiEndpoints.receiptMedia,
          () => throw FakeApiClient.networkError(),
        );
        final chat = notifier();

        await chat.analyzeImage(photo);

        expect(
          stateOf(chat).pendingExpenses?.expenses.single.vendor,
          'Tim Hortons',
        );
        expect(stateOf(chat).receiptUrl, isNull);
        expect(stateOf(chat).notice, kPhotoNotAttachedMessage);
        expect(stateOf(chat).error, isNull);
        expect(stateOf(chat).isAnalyzing, isFalse);
      },
    );

    test('a failed analysis shows the friendly error even if the upload '
        'worked', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => throw FakeApiClient.networkError(),
      );
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r.jpg'},
      );
      final chat = notifier();

      await chat.analyzeImage(photo);

      expect(stateOf(chat).pendingExpenses, isNull);
      expect(stateOf(chat).error, kNetworkErrorMessage);
      expect(stateOf(chat).isAnalyzing, isFalse);
      // The uploaded photo is kept for an expense typed in this chat.
      expect(stateOf(chat).receiptUrl, 'https://cdn.test/r.jpg');
      expect(stateOf(chat).notice, kPhotoKeptMessage);
    });

    test('after a failed analysis, an expense typed in the same chat gets '
        'the uploaded photo', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => throw FakeApiClient.networkError(),
      );
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r.jpg'},
      );
      final chat = notifier();
      await chat.analyzeImage(photo);

      api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
      await chat.sendMessage(r'Tim Hortons $6.42');

      expect(
        stateOf(chat).pendingExpenses?.expenses.single.vendor,
        'Tim Hortons',
      );
      expect(stateOf(chat).receiptUrl, 'https://cdn.test/r.jpg');
      expect(stateOf(chat).notice, kPhotoWillBeAttachedMessage);
      expect(stateOf(chat).error, isNull);

      // Saved or dismissed: the photo goes with it.
      chat.clearPendingExpenses();
      expect(stateOf(chat).receiptUrl, isNull);
      expect(stateOf(chat).notice, isNull);
    });

    test('a kept photo is not carried into a new conversation', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => throw FakeApiClient.networkError(),
      );
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r.jpg'},
      );
      final chat = notifier();
      await chat.analyzeImage(photo);

      chat.newConversation();

      expect(stateOf(chat).receiptUrl, isNull);
      expect(stateOf(chat).notice, isNull);
    });

    test('a new photo replaces the note left by the previous one', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => throw FakeApiClient.networkError(),
      );
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r1.jpg'},
      );
      final chat = notifier();
      await chat.analyzeImage(photo);
      expect(stateOf(chat).notice, kPhotoKeptMessage);

      api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r2.jpg'},
      );
      await chat.analyzeImage(photo);

      expect(stateOf(chat).receiptUrl, 'https://cdn.test/r2.jpg');
      expect(stateOf(chat).notice, isNull);
      expect(stateOf(chat).error, isNull);
    });

    test('a kept photo is not attached to the expense of a later photo '
        'whose own upload failed', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => throw FakeApiClient.networkError(),
      );
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/first.jpg'},
      );
      final chat = notifier();
      await chat.analyzeImage(photo);
      expect(stateOf(chat).receiptUrl, 'https://cdn.test/first.jpg');

      api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
      api.stub(
        ApiEndpoints.receiptMedia,
        () => throw FakeApiClient.networkError(),
      );
      await chat.analyzeImage(photo);

      expect(stateOf(chat).pendingExpenses, isNotNull);
      expect(stateOf(chat).receiptUrl, isNull);
      expect(stateOf(chat).notice, kPhotoNotAttachedMessage);
    });

    test('a receipt with no expense in it shows a message instead of an '
        'empty panel', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => {'success': true, 'multiExpense': true, 'data': <Object>[]},
      );
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r.jpg'},
      );
      final chat = notifier();

      await chat.analyzeImage(photo);

      expect(stateOf(chat).pendingExpenses, isNull);
      expect(stateOf(chat).error, kNoExpenseFoundMessage);
      expect(stateOf(chat).receiptUrl, 'https://cdn.test/r.jpg');
      expect(stateOf(chat).isAnalyzing, isFalse);
    });

    test('both succeed: expense and receipt url, no note', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r.jpg'},
      );
      final chat = notifier();

      await chat.analyzeImage(photo);

      expect(stateOf(chat).receiptUrl, 'https://cdn.test/r.jpg');
      expect(stateOf(chat).notice, isNull);
    });

    test(
      'a new photo can be analysed as soon as the previous one is done',
      () async {
        api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
        api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
        api.stub(
          ApiEndpoints.receiptMedia,
          () => {'url': 'https://cdn.test/r'},
        );
        final chat = notifier();

        await chat.analyzeImage(photo);
        chat.clearPendingExpenses();
        await chat.analyzeImage(photo);

        expect(posts(ApiEndpoints.analyzeExpense), 2);
      },
    );
  });

  group('in-flight guard', () {
    test('a second rapid send does not start a second conversation', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.aiChat,
        () => {'success': true, 'message': 'Hello'},
      );
      final chat = notifier();

      final first = chat.sendMessage('How much did I spend this month?');
      final second = chat.sendMessage('How much did I spend this month?');
      await Future.wait([first, second]);

      expect(posts(ApiEndpoints.conversations), 1);
      expect(posts(ApiEndpoints.aiChat), 1);
    });

    test('a second photo while one is analysing is ignored', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(ApiEndpoints.analyzeExpense, () => _analysis);
      api.stub(ApiEndpoints.receiptMedia, () => {'url': 'https://cdn.test/r'});
      final chat = notifier();

      await Future.wait([chat.analyzeImage(photo), chat.analyzeImage(photo)]);

      expect(posts(ApiEndpoints.conversations), 1);
      expect(posts(ApiEndpoints.analyzeExpense), 1);
    });
  });

  group('multi-expense receipt', () {
    test('removing a saved expense keeps the others pending', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      api.stub(
        ApiEndpoints.analyzeExpense,
        () => {
          'success': true,
          'multiExpense': true,
          'data': [
            {'vendor': 'A', 'amount': 1.0, 'date': '2026-11-09'},
            {'vendor': 'B', 'amount': 2.0, 'date': '2026-11-09'},
          ],
        },
      );
      final chat = notifier();
      await chat.sendMessage(r'A $1 and B $2');
      final pending = stateOf(chat).pendingExpenses!.expenses;
      expect(pending, hasLength(2));

      chat.removePendingExpense(pending.first);
      expect(stateOf(chat).pendingExpenses!.expenses.single.vendor, 'B');

      chat.removePendingExpense(pending.last);
      expect(stateOf(chat).pendingExpenses, isNull);
    });
  });

  group('switching conversation while a request is running', () {
    test('a late chat reply is stored in its own conversation and does not '
        'touch the new one', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      final reply = Completer<Object?>();
      api.stub(ApiEndpoints.aiChat, () => reply);
      final chat = notifier();

      final sending = chat.sendMessage('How much did I spend this month?');
      await pumpEventQueue();
      expect(stateOf(chat).isLoading, isTrue);

      chat.newConversation();
      expect(stateOf(chat).isLoading, isFalse);

      reply.complete({'success': true, 'message': 'You spent 40 dollars.'});
      await sending;

      final state = stateOf(chat);
      expect(state.conversationId, isNull);
      expect(state.isLoading, isFalse);
      expect(state.isAnalyzing, isFalse);
      expect(state.error, isNull);
      // The reply still went to the original conversation.
      expect(posts(ApiEndpoints.conversationMessages('c1')), 1);
    });

    test('a late expense analysis does not put its expense in another '
        'conversation', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      final analysis = Completer<Object?>();
      api.stub(ApiEndpoints.analyzeExpense, () => analysis);
      final chat = notifier();

      final sending = chat.sendMessage(r'Tim Hortons $6.42');
      await pumpEventQueue();
      expect(stateOf(chat).isAnalyzing, isTrue);

      chat.loadConversation('c2');
      analysis.complete(_analysis);
      await sending;

      final state = stateOf(chat);
      expect(state.conversationId, 'c2');
      expect(state.pendingExpenses, isNull);
      expect(state.isLoading, isFalse);
      expect(state.isAnalyzing, isFalse);
      expect(posts(ApiEndpoints.conversationMessages('c1')), 1);
      expect(posts(ApiEndpoints.conversationMessages('c2')), 0);
    });

    test(
      'a late failure does not show its error in the new conversation',
      () async {
        api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
        final reply = Completer<Object?>();
        api.stub(ApiEndpoints.aiChat, () => reply);
        final chat = notifier();

        final sending = chat.sendMessage('How much did I spend this month?');
        await pumpEventQueue();
        chat.newConversation();
        reply.completeError(FakeApiClient.networkError());
        await sending;

        expect(stateOf(chat).error, isNull);
        expect(stateOf(chat).isLoading, isFalse);
      },
    );

    test('a conversation created by a late first message is not opened in '
        'the new chat', () async {
      final created = Completer<Object?>();
      api.stub(ApiEndpoints.conversations, () => created);
      api.stub(
        ApiEndpoints.aiChat,
        () => {'success': true, 'message': 'Hello'},
      );
      final chat = notifier();

      final sending = chat.sendMessage('How much did I spend this month?');
      await pumpEventQueue();
      chat.newConversation();
      created.complete({'conversationId': 'c1'});
      await sending;

      expect(stateOf(chat).conversationId, isNull);
      // The reply was still saved with its question.
      expect(posts(ApiEndpoints.conversationMessages('c1')), 1);
    });

    test('a late photo analysis does not touch the new conversation', () async {
      api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
      final analysis = Completer<Object?>();
      api.stub(ApiEndpoints.analyzeExpense, () => analysis);
      api.stub(
        ApiEndpoints.receiptMedia,
        () => {'url': 'https://cdn.test/r.jpg'},
      );
      final chat = notifier();

      final analysing = chat.analyzeImage(photo);
      await pumpEventQueue();
      expect(stateOf(chat).isAnalyzing, isTrue);

      chat.newConversation();
      analysis.complete(_analysis);
      await analysing;

      final state = stateOf(chat);
      expect(state.pendingExpenses, isNull);
      expect(state.receiptUrl, isNull);
      expect(state.notice, isNull);
      expect(state.isAnalyzing, isFalse);
      expect(posts(ApiEndpoints.conversationMessages('c1')), 1);
    });

    test('the new conversation can be used right away and the old request '
        'does not end its loading state', () async {
      final first = Completer<Object?>();
      final second = Completer<Object?>();
      final replies = [first, second];
      var conv = 0;
      api.stub(
        ApiEndpoints.conversations,
        () => {'conversationId': 'c${++conv}'},
      );
      api.stub(ApiEndpoints.aiChat, () => replies.removeAt(0));
      final chat = notifier();

      final oldSend = chat.sendMessage('How much did I spend this month?');
      await pumpEventQueue();
      chat.newConversation();
      final newSend = chat.sendMessage('And last month?');
      await pumpEventQueue();
      expect(stateOf(chat).conversationId, 'c2');
      expect(stateOf(chat).isLoading, isTrue);

      first.complete({'success': true, 'message': 'Old answer'});
      await oldSend;
      expect(stateOf(chat).isLoading, isTrue, reason: 'new request still on');

      second.complete({'success': true, 'message': 'New answer'});
      await newSend;
      expect(stateOf(chat).conversationId, 'c2');
      expect(stateOf(chat).isLoading, isFalse);
      expect(posts(ApiEndpoints.conversationMessages('c1')), 1);
      expect(posts(ApiEndpoints.conversationMessages('c2')), 1);
    });
  });

  test('a reply that arrives after the notifier was disposed (sign-out) is '
      'dropped without an error', () async {
    final reply = Completer<Object?>();
    api.queuePending(reply);
    final chat = notifier();

    final sending = chat.sendMessage('How much did I spend this month?');
    await Future<void>.delayed(Duration.zero);
    chat.dispose();
    reply.complete({'conversationId': 'c1'});

    await expectLater(sending, completes);
  });
}
