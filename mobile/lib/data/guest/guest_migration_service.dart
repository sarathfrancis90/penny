import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/data/guest/guest_expense_store.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

/// Migrates guest local expenses through the standalone API when the user signs up or signs in.
class GuestMigrationService {
  /// Migrate all guest expenses through the API. Idempotent — safe to call multiple times.
  /// Returns the number of successfully migrated expenses.
  static Future<int> migrateToAccount({
    required Ref ref,
    required String userId,
  }) async {
    final notifier = ref.read(guestExpenseProvider.notifier);
    if (notifier.count == 0) return 0;

    // Atomically consume all expenses (clears Hive)
    final expenses = notifier.consumeForMigration();
    final repo = ref.read(_expenseRepoProvider);
    int migrated = 0;

    for (final expense in expenses) {
      try {
        final dateStr = DateFormat('yyyy-MM-dd').format(expense.date.toDate());
        await repo.savePersonalExpense(
          userId: userId,
          vendor: expense.vendor,
          amount: expense.amount,
          category: expense.category,
          date: dateStr,
          description: expense.description,
        );
        migrated++;
      } catch (e) {
        debugPrint(
          '[GuestMigration] Failed to migrate expense ${expense.vendor}: $e',
        );
      }
    }

    debugPrint(
      '[GuestMigration] Migrated $migrated of ${expenses.length} expenses for user $userId',
    );
    return migrated;
  }
}

/// Internal provider reference for ExpenseRepository.
final _expenseRepoProvider = Provider<ExpenseRepository>(
  (ref) =>
      ExpenseRepository(apiClient: ApiClient(baseUrl: EnvConfig.apiBaseUrl)),
);
