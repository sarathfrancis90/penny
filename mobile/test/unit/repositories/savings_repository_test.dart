import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/savings_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('SavingsRepository API contract', () {
    test('watchSavingsGoals reads personal savings API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'savingsGoals': [
            {
              'id': 'goal-1',
              'userId': 'user-1',
              'name': 'Emergency Fund',
              'category': 'emergency_fund',
              'targetAmount': 10000,
              'currentAmount': 500,
              'monthlyContribution': 250,
              'status': 'active',
              'isActive': true,
              'priority': 'high',
              'currency': 'CAD',
              'startDate': '2026-06-01T00:00:00.000Z',
              'createdAt': '2026-06-01T00:00:00.000Z',
              'updatedAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = SavingsRepository(apiClient: api);

      final goals = await repo.watchSavingsGoals('user-1').first;

      expect(goals.single.id, 'goal-1');
      expect(api.calls.single.path, ApiEndpoints.personalSavings);
      expect(api.calls.single.queryParameters, {
        'userId': 'user-1',
        'status': 'active',
      });
    });

    test(
      'addContribution posts to personal savings contribution API',
      () async {
        final api = FakeApiClient()..queueResponse({});
        final repo = SavingsRepository(apiClient: api);

        await repo.addContribution('goal-1', 125);

        expect(api.calls.single.method, 'POST');
        expect(
          api.calls.single.path,
          ApiEndpoints.personalSavingsContribution('goal-1'),
        );
        expect(api.calls.single.data, {'amount': 125});
      },
    );
  });
}
