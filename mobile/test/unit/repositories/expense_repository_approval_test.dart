import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('ExpenseRepository approval API contract', () {
    test(
      'approveExpense and rejectExpense use standalone API actions',
      () async {
        final api = FakeApiClient()
          ..queueResponse({})
          ..queueResponse({});
        final repo = ExpenseRepository(apiClient: api);

        await repo.approveExpense(expenseId: 'expense-1', userId: 'admin-1');
        await repo.rejectExpense(
          expenseId: 'expense-2',
          userId: 'admin-1',
          reason: 'Duplicate',
        );

        expect(api.calls[0].method, 'POST');
        expect(api.calls[0].path, ApiEndpoints.approveExpense('expense-1'));
        expect(api.calls[0].data, {'userId': 'admin-1'});
        expect(api.calls[1].method, 'POST');
        expect(api.calls[1].path, ApiEndpoints.rejectExpense('expense-2'));
        expect(api.calls[1].data, {'userId': 'admin-1', 'reason': 'Duplicate'});
      },
    );
  });
}
