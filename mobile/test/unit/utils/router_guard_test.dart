import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/router/app_router.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

void main() {
  final ts = Timestamp.fromDate(DateTime(2026, 11, 9));
  final expense = ExpenseModel(
    id: 'e1',
    userId: 'u1',
    vendor: 'Metro',
    amount: 10,
    category: 'Groceries',
    date: ts,
    expenseType: 'personal',
    createdAt: ts,
    updatedAt: ts,
  );

  test('expenseDetailRedirect sends a missing expense to the dashboard', () {
    expect(expenseDetailRedirect(null), '/dashboard');
    expect(expenseDetailRedirect('not an expense'), '/dashboard');
    expect(expenseDetailRedirect(expense), isNull);
  });

  testWidgets('a route guarded this way lands on the dashboard instead of '
      'building the detail page without its expense', (tester) async {
    final router = GoRouter(
      initialLocation: '/expenses/detail', // e.g. restored without `extra`
      routes: [
        GoRoute(path: '/dashboard', builder: (_, _) => const Text('dashboard')),
        GoRoute(
          path: '/expenses/detail',
          redirect: (context, state) => expenseDetailRedirect(state.extra),
          builder: (_, state) =>
              Text('detail ${(state.extra! as ExpenseModel).vendor}'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('dashboard'), findsOneWidget);

    router.push('/expenses/detail', extra: expense);
    await tester.pumpAndSettle();
    expect(find.text('detail Metro'), findsOneWidget);
  });
}
