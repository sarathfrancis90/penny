import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/data/guest/guest_expense_store.dart';
import 'package:penny_mobile/data/guest/guest_migration_service.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';

import '../../helpers/fake_api_client.dart';

List<ExpenseModel> _stateOf(GuestExpenseNotifier notifier) {
  late List<ExpenseModel> current;
  notifier.addListener((state) => current = state)();
  return current;
}

void main() {
  late Directory dir;
  late Box box;
  late GuestExpenseNotifier notifier;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('penny_guest_migration');
    Hive.init(dir.path);
    box = await Hive.openBox('guest_expenses');
    notifier = GuestExpenseNotifier(box);
    for (final vendor in ['Coffee', 'Lunch', 'Taxi']) {
      notifier.add(
        vendor: vendor,
        amount: 10,
        category: 'Meals and entertainment',
        date: DateTime(2026, 11, 20),
      );
      // Guest ids are millisecond based; keep them distinct.
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
  });

  tearDown(() async {
    await Hive.close();
    await dir.delete(recursive: true);
  });

  test('an expense that fails to upload is kept for a later retry', () async {
    final api = FakeApiClient()
      ..queueResponse({'id': 'e1'})
      ..queueError(FakeApiClient.networkError())
      ..queueResponse({'id': 'e3'});

    final migrated = await GuestMigrationService.migrate(
      notifier: notifier,
      expenses: _stateOf(notifier),
      repo: ExpenseRepository(apiClient: api),
      userId: 'u1',
    );

    expect(migrated, 2);
    expect(_stateOf(notifier).map((e) => e.vendor), ['Lunch']);
    // Survives an app restart.
    expect(_stateOf(GuestExpenseNotifier(box)).map((e) => e.vendor), ['Lunch']);
  });

  test(
    'the retry reuses the same clientRequestId, then clears local data',
    () async {
      final api = FakeApiClient()..queueError(FakeApiClient.networkError());
      final repo = ExpenseRepository(apiClient: api);

      await GuestMigrationService.migrate(
        notifier: notifier,
        expenses: _stateOf(notifier),
        repo: repo,
        userId: 'u1',
      );
      expect(notifier.count, 1);
      final firstId = (api.calls.first.data! as Map)['clientRequestId'];
      expect(firstId, matches(RegExp(r'^[a-z0-9]{32}$')));

      await GuestMigrationService.migrate(
        notifier: notifier,
        expenses: _stateOf(notifier),
        repo: repo,
        userId: 'u1',
      );
      expect(notifier.count, 0);
      expect((api.calls.last.data! as Map)['clientRequestId'], firstId);
      expect((api.calls.last.data! as Map)['vendor'], 'Coffee');
    },
  );
}
