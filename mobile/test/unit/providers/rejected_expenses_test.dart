import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';

ExpenseModel _expense(String id, double amount, {String? approval}) {
  final now = DateTime.now();
  final ts = Timestamp.fromDate(DateTime(now.year, now.month, now.day, 12));
  return ExpenseModel(
    id: id,
    userId: 'u1',
    vendor: id,
    amount: amount,
    category: 'Groceries',
    date: ts,
    expenseType: approval == null ? 'personal' : 'group',
    createdAt: ts,
    updatedAt: ts,
    groupId: approval == null ? null : 'g1',
    groupMetadata: approval == null ? null : {'approvalStatus': approval},
  );
}

void main() {
  test('rejected group expenses are left out of totals and breakdowns, '
      'pending ones stay in', () async {
    final container = ProviderContainer(
      overrides: [
        guestModeProvider.overrideWith((ref) => false),
        allExpensesProvider.overrideWith(
          (ref) => Stream.value([
            _expense('personal', 10),
            _expense('approved', 20, approval: 'approved'),
            _expense('pending', 30, approval: 'pending'),
            _expense('rejected', 400, approval: 'rejected'),
          ]),
        ),
        activeIncomeSourcesProvider.overrideWithValue(const []),
      ],
    );
    addTearDown(container.dispose);
    await container.read(allExpensesProvider.future);

    expect(container.read(currentMonthTotalProvider), 60);
    expect(container.read(categoryBreakdownProvider).single.amount, 60);
    expect(container.read(filteredCategoryBreakdownProvider).single.amount, 60);
    expect(container.read(dailySpendingProvider).single.amount, 60);
    expect(container.read(cashFlowProvider).last.expenses, 60);
    expect(
      container.read(filteredCountedExpensesProvider).map((e) => e.id),
      isNot(contains('rejected')),
    );
    // The list itself still shows the rejected expense (with its badge).
    expect(
      container.read(filteredExpensesProvider).map((e) => e.id),
      contains('rejected'),
    );
  });
}
