import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/group_invitation_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/group_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/groups/groups_screen.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

GroupModel _group(String id, String name) {
  final now = Timestamp.fromDate(DateTime(2026, 11, 21));
  return GroupModel(
    id: id,
    name: name,
    createdBy: 'owner',
    createdAt: now,
    updatedAt: now,
    settings: const GroupSettings(),
    status: 'active',
    stats: const GroupStats(),
  );
}

const _invite = GroupInvitationModel(
  id: 'inv1',
  groupId: 'g1',
  groupName: 'Cottage Trip',
  invitedBy: 'owner-1',
  invitedByName: 'Priya',
  role: 'member',
);

/// A group repository whose invitations and groups live in memory.
class _FakeGroupRepository extends GroupRepository {
  _FakeGroupRepository(FakeApiClient api) : super(apiClient: api);

  List<GroupInvitationModel> invitations = [];
  List<GroupModel> groups = [];
  Object? listError;
  int listCalls = 0;
  int groupListCalls = 0;
  final accepted = <String?>[];
  final declined = <String>[];

  @override
  Future<List<GroupInvitationModel>> listPendingInvitations() async {
    listCalls++;
    if (listError != null) throw listError!;
    return List.of(invitations);
  }

  @override
  Stream<List<GroupModel>> watchUserGroups(String userId) {
    groupListCalls++;
    return Stream.value(List.of(groups));
  }

  @override
  Future<Map<String, dynamic>> acceptInvitation({
    String? token,
    String? invitationId,
    required String userId,
    required String userEmail,
    String? userName,
  }) async {
    accepted.add(invitationId);
    invitations.removeWhere((i) => i.id == invitationId);
    groups = [...groups, _group('g1', 'Cottage Trip')];
    return {'success': true, 'groupId': 'g1'};
  }

  @override
  Future<void> declineInvitation({required String invitationId}) async {
    declined.add(invitationId);
    invitations.removeWhere((i) => i.id == invitationId);
  }
}

/// The empty-groups animation loops, so pumpAndSettle would never finish.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  late FakeApiClient api;
  late _FakeGroupRepository repo;

  setUp(() {
    api = FakeApiClient();
    api.stub(
      ApiEndpoints.notifications,
      () => {
        'notifications': [
          {
            'id': 'n1',
            'type': 'group_invitation',
            'title': 'Invitation',
            'body': 'Join Cottage Trip',
            'read': false,
            'metadata': {'invitationId': 'inv1', 'groupId': 'g1'},
          },
        ],
      },
    );
    repo = _FakeGroupRepository(api);
  });

  Future<void> pumpScreen(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          guestModeProvider.overrideWith((ref) => false),
          currentUserProvider.overrideWithValue(createMockUser(uid: 'u1')),
          apiClientProvider.overrideWithValue(api),
          groupRepositoryProvider.overrideWithValue(repo),
        ],
        child: const MaterialApp(home: GroupsScreen()),
      ),
    );
    await settle(tester);
  }

  int notificationLoads() => api.calls
      .where((c) => c.method == 'GET' && c.path == ApiEndpoints.notifications)
      .length;

  testWidgets('shows a pending invitation with group, inviter and role', (
    tester,
  ) async {
    repo.invitations = [_invite];
    await pumpScreen(tester);

    expect(find.text('Pending invitation'), findsOneWidget);
    expect(find.text('Cottage Trip'), findsOneWidget);
    expect(find.text('Priya invited you to join as Member'), findsOneWidget);
    expect(find.text('Accept'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    // The empty groups state is still shown below it.
    expect(find.text('No groups yet'), findsOneWidget);
  });

  testWidgets('an invitation without an inviter name still reads well', (
    tester,
  ) async {
    repo.invitations = [
      const GroupInvitationModel(
        id: 'inv2',
        groupId: 'g2',
        groupName: 'Office',
        invitedBy: 'x',
        role: 'viewer',
      ),
    ];
    await pumpScreen(tester);

    expect(find.text('Someone invited you to join as Viewer'), findsOneWidget);
  });

  testWidgets('the section is hidden when there are no invitations', (
    tester,
  ) async {
    await pumpScreen(tester);

    expect(repo.listCalls, 1);
    expect(find.textContaining('Pending invitation'), findsNothing);
    expect(find.text('Accept'), findsNothing);
  });

  testWidgets('the section is hidden and the groups still show when the '
      'invitations cannot be loaded', (tester) async {
    repo.listError = FakeApiClient.networkError();
    repo.groups = [_group('g9', 'Household')];
    await pumpScreen(tester);

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Pending invitation'), findsNothing);
    expect(find.text('Household'), findsOneWidget);
  });

  testWidgets('Accept joins by invitation id and refreshes invitations, '
      'groups and notifications', (tester) async {
    repo.invitations = [_invite];
    await pumpScreen(tester);
    final groupLoads = repo.groupListCalls;
    final listLoads = repo.listCalls;

    await tester.tap(find.text('Accept'));
    await settle(tester);

    expect(repo.accepted, ['inv1']);
    expect(repo.listCalls, greaterThan(listLoads));
    expect(repo.groupListCalls, greaterThan(groupLoads));
    expect(find.text('You joined Cottage Trip.'), findsOneWidget);
    expect(find.textContaining('Pending invitation'), findsNothing);
    // The new group is listed.
    expect(find.text('Cottage Trip'), findsOneWidget);
    // Its notification was marked read and the notifications reloaded.
    expect(
      api.calls.where(
        (c) =>
            c.method == 'PATCH' &&
            c.path == ApiEndpoints.notificationRead('n1'),
      ),
      isNotEmpty,
    );
    expect(notificationLoads(), greaterThanOrEqualTo(1));
  });

  testWidgets('Decline declines it and hides the section', (tester) async {
    repo.invitations = [_invite];
    await pumpScreen(tester);

    await tester.tap(find.text('Decline'));
    await settle(tester);

    expect(repo.declined, ['inv1']);
    expect(repo.accepted, isEmpty);
    expect(find.text('Invitation declined'), findsOneWidget);
    expect(find.textContaining('Pending invitation'), findsNothing);
  });
}
