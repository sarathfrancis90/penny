import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/group_income_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('GroupIncomeRepository API contract', () {
    test('watchGroupIncomeSources reads group income API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'incomeSources': [
            {
              'id': 'income-1',
              'groupId': 'group-1',
              'addedBy': 'user-1',
              'name': 'Consulting',
              'category': 'freelance',
              'amount': 5000,
              'frequency': 'monthly',
              'isRecurring': true,
              'isActive': true,
              'taxable': true,
              'currency': 'CAD',
              'createdAt': '2026-06-01T00:00:00.000Z',
              'updatedAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = GroupIncomeRepository(apiClient: api);

      final sources = await repo.watchGroupIncomeSources('group-1').first;

      expect(sources.single.id, 'income-1');
      expect(api.calls.single.path, ApiEndpoints.groupIncome);
      expect(api.calls.single.queryParameters, {'groupId': 'group-1'});
    });

    test('createGroupIncomeSource posts group income payload', () async {
      final api = FakeApiClient()..queueResponse({'id': 'income-2'});
      final repo = GroupIncomeRepository(apiClient: api);

      final id = await repo.createGroupIncomeSource(
        groupId: 'group-1',
        addedBy: 'user-1',
        name: 'Salary',
        category: 'salary',
        amount: 8000,
        frequency: 'monthly',
        isRecurring: true,
        taxable: true,
      );

      expect(id, 'income-2');
      expect(api.calls.single.method, 'POST');
      expect(api.calls.single.path, ApiEndpoints.groupIncome);
      expect(api.calls.single.data, containsPair('groupId', 'group-1'));
    });
  });
}
