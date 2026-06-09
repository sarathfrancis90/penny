import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/income_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('IncomeRepository API contract', () {
    test('watchIncomeSources reads personal income API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'incomeSources': [
            {
              'id': 'income-1',
              'userId': 'user-1',
              'name': 'Freelance',
              'category': 'freelance',
              'amount': 2000,
              'frequency': 'monthly',
              'isRecurring': true,
              'isActive': true,
              'taxable': true,
              'currency': 'CAD',
              'startDate': '2026-06-01T00:00:00.000Z',
              'createdAt': '2026-06-01T00:00:00.000Z',
              'updatedAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = IncomeRepository(apiClient: api);

      final income = await repo.watchIncomeSources('user-1').first;

      expect(income.single.id, 'income-1');
      expect(api.calls.single.path, ApiEndpoints.personalIncome);
      expect(api.calls.single.queryParameters, {'userId': 'user-1'});
    });

    test('createIncomeSource posts personal income payload', () async {
      final api = FakeApiClient()..queueResponse({'id': 'income-2'});
      final repo = IncomeRepository(apiClient: api);

      final id = await repo.createIncomeSource(
        userId: 'user-1',
        name: 'Salary',
        category: 'salary',
        amount: 5000,
        frequency: 'monthly',
        isRecurring: true,
        taxable: true,
      );

      expect(id, 'income-2');
      expect(api.calls.single.method, 'POST');
      expect(api.calls.single.path, ApiEndpoints.personalIncome);
    });
  });
}
