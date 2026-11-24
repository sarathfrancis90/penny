import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/screens/dashboard/dashboard_screen.dart';

Future<ProviderContainer> _pumpDashboard(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1200, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  late ProviderContainer container;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        guestModeProvider.overrideWith((ref) => false),
        allExpensesProvider.overrideWith(
          (ref) => Stream.value(const <ExpenseModel>[]),
        ),
        userGroupsProvider.overrideWith(
          (ref) => Stream.value(const <GroupModel>[]),
        ),
        totalMonthlyIncomeProvider.overrideWithValue(0),
      ],
      child: Consumer(
        builder: (context, ref, _) {
          container = ProviderScope.containerOf(context);
          return const MaterialApp(home: DashboardScreen());
        },
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets('the calendar button reopens the range picker when a custom '
      'range is already active', (tester) async {
    final container = await _pumpDashboard(tester);
    final calendar = find.byIcon(Icons.date_range);

    // First custom range: open the picker and save.
    await tester.tap(calendar);
    await tester.pumpAndSettle();
    expect(find.byType(DateRangePickerDialog), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.byType(DateRangePickerDialog), findsNothing);
    expect(container.read(dashboardPeriodProvider), DashboardPeriod.custom);

    // Second custom range: the same button must open the picker again,
    // without first switching to another period.
    await tester.tap(calendar);
    await tester.pumpAndSettle();
    expect(find.byType(DateRangePickerDialog), findsOneWidget);
  });

  testWidgets('tapping the shown range also reopens the picker', (
    tester,
  ) async {
    final container = await _pumpDashboard(tester);
    container.read(customDateRangeProvider.notifier).state = DateTimeRange(
      start: DateTime(2025, 3, 1),
      end: DateTime(2025, 3, 31),
    );
    container.read(dashboardPeriodProvider.notifier).state =
        DashboardPeriod.custom;
    await tester.pumpAndSettle();

    await tester.tap(find.text('Mar 1 – Mar 31, 2025'));
    await tester.pumpAndSettle();
    expect(find.byType(DateRangePickerDialog), findsOneWidget);
  });

  testWidgets('shows both years when the range crosses a year', (tester) async {
    final container = await _pumpDashboard(tester);
    container.read(customDateRangeProvider.notifier).state = DateTimeRange(
      start: DateTime(2024, 12, 15),
      end: DateTime(2025, 1, 15),
    );
    container.read(dashboardPeriodProvider.notifier).state =
        DashboardPeriod.custom;
    await tester.pumpAndSettle();

    expect(find.text('Dec 15, 2024 – Jan 15, 2025'), findsOneWidget);
  });

  testWidgets('tapping the selected preset period changes nothing', (
    tester,
  ) async {
    final container = await _pumpDashboard(tester);
    await tester.tap(find.text('M'));
    await tester.pumpAndSettle();

    expect(find.byType(DateRangePickerDialog), findsNothing);
    expect(container.read(dashboardPeriodProvider), DashboardPeriod.thisMonth);
  });
}
