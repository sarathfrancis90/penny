import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/expense_card.dart';
import 'package:penny_mobile/presentation/widgets/expense_confirmation_sheet.dart';
import 'package:penny_mobile/presentation/widgets/quick_add_expense.dart';
import 'package:penny_mobile/presentation/widgets/success_overlay.dart';

import '../helpers/fake_api_client.dart';
import '../helpers/test_helpers.dart';

ParsedExpense _parsed() => ParsedExpense(
  vendor: 'Tim Hortons',
  amount: 6.42,
  date: '2026-11-09',
  category: 'Meals and entertainment',
);

void main() {
  late FakeApiClient api;

  setUp(() {
    api = FakeApiClient();
    api.stub(ApiEndpoints.expenses, () => {'id': 'e1'});
  });

  int savePosts() => api.calls
      .where((c) => c.method == 'POST' && c.path == ApiEndpoints.expenses)
      .length;

  Future<void> pumpApp(WidgetTester tester, Widget home) async {
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          guestModeProvider.overrideWith((ref) => false),
          currentUserProvider.overrideWithValue(createMockUser(uid: 'u1')),
          apiClientProvider.overrideWithValue(api),
          userGroupsProvider.overrideWith(
            (ref) => Stream.value(const <GroupModel>[]),
          ),
          defaultGroupProvider.overrideWith((ref) => Stream.value(null)),
          budgetUsageProvider.overrideWithValue(const []),
          allExpensesProvider.overrideWith(
            (ref) => Stream.value(const <ExpenseModel>[]),
          ),
        ],
        child: MaterialApp(home: home),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  Future<void> frames(WidgetTester tester, [int count = 10]) async {
    for (var i = 0; i < count; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  group('saved confirmation', () {
    testWidgets('does not block taps on the screen behind it and goes away '
        'by itself', (tester) async {
      var taps = 0;
      await pumpApp(
        tester,
        Scaffold(
          body: Builder(
            builder: (context) => Column(
              children: [
                const SizedBox(height: 600),
                TextButton(
                  onPressed: () => SuccessOverlay.show(
                    context,
                    title: 'Tim Hortons',
                    subtitle: r'$6.42 saved',
                  ),
                  child: const Text('show'),
                ),
                TextButton(
                  onPressed: () => taps++,
                  child: const Text('behind'),
                ),
              ],
            ),
          ),
        ),
      );

      await tester.tap(find.text('show'));
      await frames(tester, 4);
      expect(find.text(r'$6.42 saved'), findsOneWidget);

      await tester.tap(find.text('behind'));
      await tester.pump();
      expect(taps, 1, reason: 'the confirmation must not absorb taps');
      expect(find.text(r'$6.42 saved'), findsOneWidget);

      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
      expect(find.text(r'$6.42 saved'), findsNothing);
    });

    testWidgets('a second confirmation replaces the first', (tester) async {
      await pumpApp(
        tester,
        Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => SuccessOverlay.show(
                  context,
                  title: 'Saved',
                  subtitle: 'again',
                ),
                child: const Text('show'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('show'));
      await frames(tester, 2);
      await tester.tap(find.text('show'));
      await frames(tester, 2);
      expect(find.text('again'), findsOneWidget);

      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
      expect(find.text('again'), findsNothing);
    });
  });

  group('quick add', () {
    Future<void> openAndFill(WidgetTester tester) async {
      await pumpApp(
        tester,
        Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => const QuickAddExpense(),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextField, 'Vendor / Merchant'),
        'Tim Hortons',
      );
      await tester.enterText(find.widgetWithText(TextField, 'Amount'), '6.42');
      await tester.tap(find.text('Category'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Groceries').last);
      await tester.pumpAndSettle();
    }

    testWidgets('saves even when the duplicate check fails, closes right '
        'away and shows the confirmation', (tester) async {
      api.stub(
        ApiEndpoints.duplicateExpense,
        () => throw FakeApiClient.networkError(),
      );
      await openAndFill(tester);

      await tester.tap(find.widgetWithText(ElevatedButton, 'Add Expense'));
      await frames(tester);

      expect(tester.takeException(), isNull);
      expect(savePosts(), 1);
      // The sheet is gone while the confirmation is still showing.
      expect(find.byType(QuickAddExpense), findsNothing);
      expect(find.text(r'$6.42 saved'), findsOneWidget);

      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
    });

    testWidgets('a second tap while the duplicate check runs does not save '
        'twice', (tester) async {
      await openAndFill(tester);

      final save = find.widgetWithText(ElevatedButton, 'Add Expense');
      await tester.tap(save);
      await tester.tap(save, warnIfMissed: false);
      await frames(tester);

      final checks = api.calls
          .where((c) => c.path == ApiEndpoints.duplicateExpense)
          .length;
      expect(checks, 1);
      expect(savePosts(), 1);

      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
    });
  });

  testWidgets('the confirmation sheet saves even when the duplicate check '
      'fails', (tester) async {
    api.stub(
      ApiEndpoints.duplicateExpense,
      () => throw FakeApiClient.networkError(),
    );
    bool? result;
    await pumpApp(
      tester,
      Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: TextButton(
              onPressed: () async {
                result = await ExpenseConfirmationSheet.show(
                  context,
                  expense: _parsed(),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Confirm & Save'));
    await frames(tester);

    expect(tester.takeException(), isNull);
    expect(savePosts(), 1);
    expect(result, isTrue);
    expect(find.byType(ExpenseConfirmationSheet), findsNothing);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
  });

  testWidgets('a pending expense card saves even when the duplicate check '
      'fails', (tester) async {
    api.stub(
      ApiEndpoints.duplicateExpense,
      () => throw FakeApiClient.networkError(),
    );
    final controller = ExpenseSaveController();
    addTearDown(controller.dispose);
    await pumpApp(
      tester,
      Scaffold(
        body: SingleChildScrollView(
          child: ExpenseCard(expense: _parsed(), saveController: controller),
        ),
      ),
    );

    final result = await controller.saveAll();
    await frames(tester);

    expect(result.saved, 1);
    expect(savePosts(), 1);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
  });
}
