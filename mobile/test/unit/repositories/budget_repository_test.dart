import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/repositories/budget_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('BudgetRepository API contract', () {
    test('watchBudgets calls personal budget API with period query', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'budgets': [
            {
              'id': 'budget-1',
              'userId': 'user-1',
              'category': 'Office expenses',
              'monthlyLimit': 500,
              'period': {'month': 6, 'year': 2026},
              'isActive': true,
              'createdAt': '2026-06-01T00:00:00.000Z',
              'updatedAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = BudgetRepository(apiClient: api);

      final budgets = await repo
          .watchBudgets('user-1', const BudgetPeriod(month: 6, year: 2026))
          .first;

      expect(budgets.single.id, 'budget-1');
      expect(api.calls.single.path, ApiEndpoints.personalBudgets);
      expect(api.calls.single.queryParameters, {
        'userId': 'user-1',
        'month': 6,
        'year': 2026,
      });
    });

    test('createBudget posts to personal budget API', () async {
      final api = FakeApiClient()..queueResponse({'id': 'budget-2'});
      final repo = BudgetRepository(apiClient: api);

      final id = await repo.createBudget(
        userId: 'user-1',
        category: 'Meals and entertainment',
        monthlyLimit: 250,
        period: const BudgetPeriod(month: 6, year: 2026),
      );

      expect(id, 'budget-2');
      expect(api.calls.single.method, 'POST');
      expect(api.calls.single.path, ApiEndpoints.personalBudgets);
    });
  });
}
