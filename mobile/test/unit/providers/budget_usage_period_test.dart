import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/budget_repository.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

import '../../helpers/fake_api_client.dart';

ExpenseModel _expense(String id, double amount, DateTime date) {
  final ts = Timestamp.fromDate(date);
  return ExpenseModel(
    id: id,
    userId: 'u1',
    vendor: id,
    amount: amount,
    category: 'Groceries',
    date: ts,
    expenseType: 'personal',
    createdAt: ts,
    updatedAt: ts,
  );
}

void main() {
  test(
    'budget usage follows the selected period, not always this month',
    () async {
      final now = DateTime.now();
      final lastMonth = DateTime(now.year, now.month - 1, 10, 12);
      final ts = Timestamp.fromDate(now);
      final container = ProviderContainer(
        overrides: [
          guestModeProvider.overrideWith((ref) => false),
          budgetRepositoryProvider.overrideWithValue(
            BudgetRepository(apiClient: FakeApiClient()),
          ),
          budgetsProvider.overrideWith(
            (ref) => Stream.value([
              BudgetModel(
                id: 'b1',
                userId: 'u1',
                category: 'Groceries',
                monthlyLimit: 500,
                period: BudgetPeriod(
                  month: lastMonth.month,
                  year: lastMonth.year,
                ),
                settings: const BudgetSettings(),
                createdAt: ts,
                updatedAt: ts,
              ),
            ]),
          ),
          allExpensesProvider.overrideWith(
            (ref) => Stream.value([
              _expense('this-month', 40, DateTime(now.year, now.month, 1, 12)),
              _expense('last-month', 125, lastMonth),
            ]),
          ),
        ],
      );
      addTearDown(container.dispose);
      await container.read(budgetsProvider.future);
      await container.read(allExpensesProvider.future);

      expect(container.read(budgetUsageProvider).single.totalSpent, 40);

      container.read(budgetPeriodProvider.notifier).state = BudgetPeriod(
        month: lastMonth.month,
        year: lastMonth.year,
      );
      expect(container.read(budgetUsageProvider).single.totalSpent, 125);
      expect(container.read(totalBudgetSpentProvider), 125);
    },
  );
}
