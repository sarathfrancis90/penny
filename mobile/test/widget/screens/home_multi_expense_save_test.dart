import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/home/home_screen.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

void main() {
  testWidgets('Confirm & Save saves every pending expense, removes only the '
      'saved ones and keeps a failed one on screen with its error', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 5000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final api = FakeApiClient();
    var failVendorB = true;
    api.stub(ApiEndpoints.conversations, () => {'conversationId': 'c1'});
    api.stub(
      ApiEndpoints.conversationMessages('c1'),
      () => {'messages': <Object>[]},
    );
    api.stub(
      ApiEndpoints.analyzeExpense,
      () => {
        'success': true,
        'multiExpense': true,
        'data': [
          for (final vendor in ['Vendor A', 'Vendor B', 'Vendor C'])
            {
              'vendor': vendor,
              'amount': 10.0,
              'date': '2026-11-09',
              'category': 'Groceries',
            },
        ],
      },
    );
    api.stub(ApiEndpoints.expenses, () {
      final body = api.calls.last.data! as Map;
      if (failVendorB && body['vendor'] == 'Vendor B') {
        throw FakeApiClient.networkError();
      }
      return {'id': 'saved-${body['vendor']}'};
    });

    late ProviderContainer container;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          guestModeProvider.overrideWith((ref) => false),
          currentUserProvider.overrideWithValue(createMockUser(uid: 'u1')),
          apiClientProvider.overrideWithValue(api),
          userGroupsProvider.overrideWith(
            (ref) => Stream.value(const <GroupModel>[]),
          ),
          defaultGroupProvider.overrideWith((ref) => Stream.value(null)),
          budgetUsageProvider.overrideWithValue(const []),
          notificationsProvider.overrideWith(
            (ref) => Stream.value(const <NotificationModel>[]),
          ),
          allExpensesProvider.overrideWith(
            (ref) => Stream.value(const <ExpenseModel>[]),
          ),
        ],
        child: Consumer(
          builder: (context, ref, _) {
            container = ProviderScope.containerOf(context);
            return const MaterialApp(home: HomeScreen());
          },
        ),
      ),
    );

    Future<void> settle() async {
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    List<Map> savePosts() => [
      for (final call in api.calls)
        if (call.method == 'POST' && call.path == ApiEndpoints.expenses)
          call.data! as Map,
    ];

    await container
        .read(chatProvider.notifier)
        .sendMessage(r'Vendor A $10, Vendor B $10, Vendor C $10');
    await settle();
    expect(find.text('3 expenses detected'), findsOneWidget);

    await tester.tap(find.text('Confirm & Save'));
    await settle();
    // Let the summary overlay close itself.
    await tester.pump(const Duration(seconds: 2));
    await settle();

    // All three were attempted — not just the last card.
    expect(savePosts().map((b) => b['vendor']), [
      'Vendor A',
      'Vendor B',
      'Vendor C',
    ]);
    // Only the failed one is still pending, with an error on its card.
    final pending = container.read(chatProvider).pendingExpenses!.expenses;
    expect(pending.single.vendor, 'Vendor B');
    expect(find.textContaining("Couldn't save."), findsWidgets);
    expect(find.widgetWithText(TextField, 'Vendor B'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Vendor A'), findsNothing);

    // Each save carries its own clientRequestId.
    final ids = savePosts().map((b) => b['clientRequestId']).toList();
    expect(ids.toSet(), hasLength(3));
    for (final id in ids) {
      expect(id, matches(RegExp(r'^[a-z0-9]{32}$')));
    }

    // Retry: the same save reuses its id, and the panel closes.
    failVendorB = false;
    // The error snackbar floats over the button for a few seconds.
    await tester.pump(const Duration(seconds: 5));
    await settle();
    await tester.tap(find.text('Confirm & Save'));
    await settle();
    await tester.pump(const Duration(seconds: 2));
    await settle();

    expect(savePosts(), hasLength(4));
    expect(savePosts().last['vendor'], 'Vendor B');
    expect(savePosts().last['clientRequestId'], ids[1]);
    expect(container.read(chatProvider).pendingExpenses, isNull);
  });
}
