import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/notifications/notifications_screen.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

void main() {
  late FakeApiClient api;
  late List<Map<String, Object?>> serverNotifications;

  setUp(() {
    api = FakeApiClient();
    serverNotifications = [];
    api.stub(
      ApiEndpoints.notifications,
      () => {'notifications': serverNotifications},
    );
    api.stub(ApiEndpoints.groups, () => {'groups': <Object>[]});
  });

  Future<ProviderContainer> pumpScreen(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, _) => const NotificationsScreen()),
        GoRoute(
          path: '/budgets',
          builder: (_, _) => const Scaffold(body: Text('budgets page')),
        ),
        GoRoute(
          path: '/groups/:id',
          builder: (_, state) =>
              Scaffold(body: Text('group ${state.pathParameters['id']}')),
        ),
      ],
    );
    addTearDown(router.dispose);
    late ProviderContainer container;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          guestModeProvider.overrideWith((ref) => false),
          currentUserProvider.overrideWithValue(createMockUser(uid: 'u1')),
          apiClientProvider.overrideWithValue(api),
        ],
        child: Consumer(
          builder: (context, ref, _) {
            container = ProviderScope.containerOf(context);
            // Like the groups tab and the unread badge elsewhere in the app.
            ref.watch(userGroupsProvider);
            ref.watch(unreadCountProvider);
            return MaterialApp.router(routerConfig: router);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  int count(String method, String path) =>
      api.calls.where((c) => c.method == method && c.path == path).length;

  testWidgets('opening a notification clears the unread badge', (tester) async {
    serverNotifications = [
      {
        'id': 'n1',
        'type': 'budget_warning',
        'title': 'Budget alert',
        'body': 'x',
      },
    ];
    api.stub(ApiEndpoints.notificationRead('n1'), () {
      serverNotifications = [
        {...serverNotifications.single, 'read': true},
      ];
      return <String, Object?>{};
    });
    final container = await pumpScreen(tester);
    expect(container.read(unreadCountProvider), 1);

    await tester.tap(find.text('Budget alert'));
    await tester.pumpAndSettle();

    expect(container.read(unreadCountProvider), 0);
    expect(find.text('budgets page'), findsOneWidget);
  });

  testWidgets('the notification still opens when marking it read fails', (
    tester,
  ) async {
    serverNotifications = [
      {
        'id': 'n1',
        'type': 'budget_warning',
        'title': 'Budget alert',
        'body': 'x',
      },
    ];
    api.stub(
      ApiEndpoints.notificationRead('n1'),
      () => throw FakeApiClient.networkError(),
    );
    await pumpScreen(tester);

    await tester.tap(find.text('Budget alert'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('budgets page'), findsOneWidget);
  });

  testWidgets('accepting an invitation reloads the groups list, even if '
      'marking the notification read fails', (tester) async {
    serverNotifications = [
      {
        'id': 'n1',
        'type': 'group_invitation',
        'title': 'Join Family',
        'body': 'x',
        'metadata': {'invitationToken': 'tok', 'groupId': 'g1'},
      },
    ];
    api.stub(ApiEndpoints.acceptInvitation, () => {'groupId': 'g1'});
    api.stub(
      ApiEndpoints.notificationRead('n1'),
      () => throw FakeApiClient.networkError(),
    );
    await pumpScreen(tester);
    final groupLoads = count('GET', ApiEndpoints.groups);

    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(count('GET', ApiEndpoints.groups), groupLoads + 1);
    expect(find.text('group g1'), findsOneWidget);
    expect(find.textContaining("Couldn't accept"), findsNothing);
  });

  testWidgets('an invitation without a token is accepted by its id', (
    tester,
  ) async {
    serverNotifications = [
      {
        'id': 'n1',
        'type': 'group_invitation',
        'title': 'Join Family',
        'body': 'x',
        'metadata': {'invitationId': 'inv-1', 'groupId': 'g1'},
      },
    ];
    api.stub(ApiEndpoints.acceptInvitation, () => {'groupId': 'g1'});
    await pumpScreen(tester);

    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();

    final accept = api.calls.singleWhere(
      (c) => c.method == 'POST' && c.path == ApiEndpoints.acceptInvitation,
    );
    final body = accept.data as Map;
    expect(body['invitationId'], 'inv-1');
    expect(body.containsKey('token'), isFalse);
    expect(find.textContaining("Couldn't accept"), findsNothing);
    expect(find.text('group g1'), findsOneWidget);
  });

  testWidgets('declining shows a friendly message when it fails', (
    tester,
  ) async {
    serverNotifications = [
      {
        'id': 'n1',
        'type': 'group_invitation',
        'title': 'Join Family',
        'body': 'x',
        'metadata': {'invitationId': 'inv-1', 'groupId': 'g1'},
      },
    ];
    api.stub(
      ApiEndpoints.declineInvitation('inv-1'),
      () => throw FakeApiClient.networkError(),
    );
    await pumpScreen(tester);

    await tester.tap(find.text('Decline'));
    await tester.pumpAndSettle();

    expect(find.textContaining('DioException'), findsNothing);
    expect(find.textContaining("Couldn't decline"), findsOneWidget);
  });
}
