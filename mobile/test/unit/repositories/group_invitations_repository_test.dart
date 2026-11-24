import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/group_repository.dart';

import '../../helpers/fake_api_client.dart';

DioException _status(int code) => DioException(
  requestOptions: RequestOptions(path: ApiEndpoints.groupInvitations),
  response: Response<Object?>(
    requestOptions: RequestOptions(path: ApiEndpoints.groupInvitations),
    statusCode: code,
  ),
  type: DioExceptionType.badResponse,
);

void main() {
  late FakeApiClient api;
  late GroupRepository repo;

  setUp(() {
    api = FakeApiClient();
    repo = GroupRepository(apiClient: api);
  });

  test('parses the pending invitations', () async {
    api.stub(
      ApiEndpoints.groupInvitations,
      () => {
        'invitations': [
          {
            'id': 'inv1',
            'groupId': 'g1',
            'groupName': 'Cottage Trip',
            'invitedBy': 'u9',
            'invitedByName': 'Priya',
            'role': 'admin',
            'createdAt': '2026-11-20T10:00:00.000Z',
            'expiresAt': null,
          },
          {
            'id': 'inv2',
            'groupId': 'g2',
            'groupName': 'Office',
            'invitedBy': 'u8',
            'invitedByName': null,
            'role': 'member',
            'createdAt': null,
            'expiresAt': '2026-12-01T00:00:00.000Z',
          },
          // Unusable without an id or a group: skipped.
          {'groupId': 'g3', 'groupName': 'Broken'},
        ],
      },
    );

    final invitations = await repo.listPendingInvitations();

    expect(api.calls.single.method, 'GET');
    expect(invitations.map((i) => i.id), ['inv1', 'inv2']);
    final first = invitations.first;
    expect(first.groupName, 'Cottage Trip');
    expect(first.inviterLabel, 'Priya');
    expect(first.roleLabel, 'Admin');
    expect(first.createdAt, DateTime.utc(2026, 11, 20, 10));
    expect(first.expiresAt, isNull);
    expect(invitations.last.inviterLabel, 'Someone');
    expect(invitations.last.expiresAt, DateTime.utc(2026, 12, 1));
  });

  test('an older API without the route (404) has no invitations', () async {
    api.stub(ApiEndpoints.groupInvitations, () => throw _status(404));

    expect(await repo.listPendingInvitations(), isEmpty);
  });

  test('other failures are reported', () async {
    api.stub(ApiEndpoints.groupInvitations, () => throw _status(500));

    expect(repo.listPendingInvitations(), throwsA(isA<DioException>()));
  });
}
