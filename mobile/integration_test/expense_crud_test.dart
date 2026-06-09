import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';

import 'helpers/api_backed_test_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(preparePennyIntegrationTest);
  tearDown(resetPennyIntegrationErrorWidget);

  group('API-backed expenses', () {
    testWidgets('dashboard renders expenses returned by the standalone API', (
      tester,
    ) async {
      final harness = PennyIntegrationHarness();

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await tester.tap(find.text('Dashboard').last);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Dashboard'), findsWidgets);
      expect(find.text('Total Spent'), findsOneWidget);
      expect(find.text('Spending Trend'), findsOneWidget);
      await _scrollUntilVisible(tester, 'Tim Hortons');
      expect(find.text('Tim Hortons'), findsOneWidget);
      await _scrollUntilVisible(tester, 'Staples');
      expect(find.text('Staples'), findsOneWidget);
      expect(
        harness.api.calls.where((call) => call.path == ApiEndpoints.expenses),
        isNotEmpty,
      );
    });

    testWidgets('expense detail opens from API-backed dashboard data', (
      tester,
    ) async {
      final harness = PennyIntegrationHarness();

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await tester.tap(find.text('Dashboard').last);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await _scrollUntilVisible(tester, 'Tim Hortons');
      await tester.tap(find.text('Tim Hortons').first);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Expense'), findsWidgets);
      expect(find.text('Meals and entertainment'), findsOneWidget);
      expect(find.text('Client coffee'), findsOneWidget);
      expect(find.text('Delete Expense'), findsOneWidget);
    });
  });
}

Future<void> _scrollUntilVisible(WidgetTester tester, String text) async {
  await tester.dragUntilVisible(
    find.text(text),
    find.byType(Scrollable).last,
    const Offset(0, -300),
  );
  await tester.pumpAndSettle();
}
