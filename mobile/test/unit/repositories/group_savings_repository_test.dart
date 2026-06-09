import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/group_savings_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('GroupSavingsRepository API contract', () {
    test('watchGroupSavingsGoals reads group savings API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'savingsGoals': [
            {
              'id': 'goal-1',
              'groupId': 'group-1',
              'createdBy': 'user-1',
              'name': 'Trip',
              'category': 'travel',
              'targetAmount': 3000,
              'currentAmount': 500,
              'monthlyContribution': 100,
              'status': 'active',
              'isActive': true,
              'priority': 'medium',
              'currency': 'CAD',
              'createdAt': '2026-06-01T00:00:00.000Z',
              'updatedAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = GroupSavingsRepository(apiClient: api);

      final goals = await repo.watchGroupSavingsGoals('group-1').first;

      expect(goals.single.id, 'goal-1');
      expect(api.calls.single.path, ApiEndpoints.groupSavings);
      expect(api.calls.single.queryParameters, {
        'groupId': 'group-1',
        'status': 'active',
      });
    });

    test('addGroupContribution posts user-scoped contribution', () async {
      final api = FakeApiClient()..queueResponse({});
      final repo = GroupSavingsRepository(apiClient: api);

      await repo.addGroupContribution('goal-1', 50, 'user-1');

      expect(api.calls.single.method, 'POST');
      expect(
        api.calls.single.path,
        ApiEndpoints.groupSavingsContribution('goal-1'),
      );
      expect(api.calls.single.data, {'userId': 'user-1', 'amount': 50});
    });
  });
}
