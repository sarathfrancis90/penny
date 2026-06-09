import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('ExpenseRepository API contract', () {
    late FakeApiClient api;
    late ExpenseRepository repo;

    setUp(() {
      api = FakeApiClient();
      repo = ExpenseRepository(apiClient: api);
    });

    test('savePersonalExpense creates through standalone API', () async {
      api.queueResponse({'id': 'expense-1'});

      final id = await repo.savePersonalExpense(
        userId: 'user-1',
        vendor: 'Tim Hortons',
        amount: 14.50,
        category: 'Meals and entertainment',
        date: '2026-04-03',
        description: 'Lunch',
      );

      expect(id, 'expense-1');
      expect(api.calls.single.method, 'POST');
      expect(api.calls.single.path, ApiEndpoints.expenses);
      expect(api.calls.single.data, containsPair('userId', 'user-1'));
      expect(api.calls.single.data, containsPair('vendor', 'Tim Hortons'));
    });

    test('watchAllExpenses lists through standalone API', () async {
      api.queueResponse({
        'expenses': [
          {
            'id': 'expense-1',
            'userId': 'user-1',
            'vendor': 'Store',
            'amount': 10,
            'category': 'Office expenses',
            'date': '2026-04-03T12:00:00.000Z',
            'expenseType': 'personal',
            'createdAt': '2026-04-03T12:00:00.000Z',
            'updatedAt': '2026-04-03T12:00:00.000Z',
          },
        ],
      });

      final expenses = await repo.watchAllExpenses('user-1').first;

      expect(expenses.single.id, 'expense-1');
      expect(api.calls.single.method, 'GET');
      expect(api.calls.single.path, ApiEndpoints.expenses);
      expect(api.calls.single.queryParameters, {
        'scope': 'all',
        'userId': 'user-1',
      });
    });

    test('update and delete use API expense resource', () async {
      api.queueResponse({});
      api.queueResponse({});

      await repo.updateExpense(
        expenseId: 'expense-1',
        userId: 'user-1',
        updates: {'amount': 16.50},
      );
      await repo.deleteExpense('expense-1');

      expect(api.calls[0].method, 'PATCH');
      expect(api.calls[0].path, ApiEndpoints.expenseById('expense-1'));
      expect(api.calls[0].data, {'userId': 'user-1', 'amount': 16.50});
      expect(api.calls[1].method, 'DELETE');
      expect(api.calls[1].path, ApiEndpoints.expenseById('expense-1'));
    });
  });
}
