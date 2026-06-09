import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/services/duplicate_detector.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('DuplicateDetector API contract', () {
    test('returns null when API reports no duplicate', () async {
      final api = FakeApiClient()..queueResponse({'duplicate': null});
      final detector = DuplicateDetector(apiClient: api);

      final result = await detector.checkForDuplicate(
        vendor: 'New Restaurant',
        amount: 25,
        date: DateTime(2026, 6, 1),
        userId: 'user-1',
      );

      expect(result, isNull);
      expect(api.calls.single.method, 'POST');
      expect(api.calls.single.path, ApiEndpoints.duplicateExpense);
      expect(api.calls.single.data, {
        'userId': 'user-1',
        'vendor': 'New Restaurant',
        'amount': 25.0,
        'date': '2026-06-01',
      });
    });

    test('parses duplicate returned by standalone API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'duplicate': {
            'id': 'expense-1',
            'userId': 'user-2',
            'vendor': 'Costco',
            'amount': 150,
            'category': 'Groceries',
            'date': '2026-06-01T12:00:00.000Z',
            'expenseType': 'group',
            'groupId': 'group-1',
            'createdAt': '2026-06-01T12:00:00.000Z',
            'updatedAt': '2026-06-01T12:00:00.000Z',
          },
        });
      final detector = DuplicateDetector(apiClient: api);

      final result = await detector.checkForDuplicate(
        vendor: 'Costco',
        amount: 150,
        date: DateTime(2026, 6, 1),
        userId: 'user-1',
        groupId: 'group-1',
      );

      expect(result, isNotNull);
      expect(result!.matchType, DuplicateMatchType.exact);
      expect(result.existingExpense.vendor, 'Costco');
      expect(result.warningMessage, contains('group member'));
      expect(api.calls.single.data, containsPair('groupId', 'group-1'));
    });

    test('warningMessage for personal duplicate stays descriptive', () {
      final now = Timestamp.now();
      final result = DuplicateResult(
        existingExpense: ExpenseModel(
          id: 'mock-id',
          userId: 'user-1',
          vendor: 'Tim Hortons',
          amount: 14.50,
          category: 'Meals and entertainment',
          date: now,
          expenseType: 'personal',
          createdAt: now,
          updatedAt: now,
        ),
        matchType: DuplicateMatchType.exact,
        addedBy: 'user-1',
      );

      expect(result.warningMessage, contains('You already have'));
      expect(result.warningMessage, contains('14.50'));
      expect(result.warningMessage, contains('Tim Hortons'));
    });
  });
}
