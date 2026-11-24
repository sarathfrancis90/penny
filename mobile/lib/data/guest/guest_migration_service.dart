import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/data/guest/guest_expense_store.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

/// Migrates guest local expenses through the standalone API when the user signs up or signs in.
class GuestMigrationService {
  static Future<int>? _running;

  /// Migrate all guest expenses through the API. Safe to call multiple times:
  /// a call made while a migration is running joins that run.
  /// Returns the number of successfully migrated expenses.
  static Future<int> migrateToAccount({
    required Ref ref,
    required String userId,
  }) {
    return _running ??= migrate(
      notifier: ref.read(guestExpenseProvider.notifier),
      expenses: ref.read(guestExpenseProvider),
      repo: ref.read(_expenseRepoProvider),
      userId: userId,
    ).whenComplete(() => _running = null);
  }

  /// Uploads [expenses] one by one. Each expense is removed from local
  /// storage only after it was saved; one that fails stays for the next
  /// attempt (the next sign-in or app start).
  @visibleForTesting
  static Future<int> migrate({
    required GuestExpenseNotifier notifier,
    required List<ExpenseModel> expenses,
    required ExpenseRepository repo,
    required String userId,
  }) async {
    int migrated = 0;

    for (final expense in List<ExpenseModel>.of(expenses)) {
      try {
        final dateStr = DateFormat('yyyy-MM-dd').format(expense.date.toDate());
        await repo.saveExpense(
          userId: userId,
          vendor: expense.vendor,
          amount: expense.amount,
          category: expense.category,
          date: dateStr,
          description: expense.description,
          clientRequestId: notifier.migrationRequestId(expense.id),
        );
        notifier.markMigrated(expense.id);
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
