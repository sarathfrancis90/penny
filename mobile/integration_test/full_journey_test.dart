import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';

import 'helpers/api_backed_test_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(preparePennyIntegrationTest);
  tearDown(resetPennyIntegrationErrorWidget);

  group('API-backed full journey', () {
    testWidgets('regular user renders every primary tab from API data', (
      tester,
    ) async {
      final harness = PennyIntegrationHarness();

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Track an expense'), findsOneWidget);
      expect(
        harness.api.calls.any(
          (call) => call.path == ApiEndpoints.notifications,
        ),
        isTrue,
      );

      await _tapTab(tester, 'Dashboard');
      expect(find.text('Dashboard'), findsWidgets);
      expect(find.text('Total Spent'), findsOneWidget);
      expect(find.text('Spending Trend'), findsOneWidget);
      expect(
        harness.api.calls.any((call) => call.path == ApiEndpoints.expenses),
        isTrue,
      );

      await _tapTab(tester, 'Finances');
      expect(find.text('Finances'), findsWidgets);
      expect(find.text('Income'), findsWidgets);
      expect(find.text('Budgets'), findsWidgets);
      expect(find.text('Savings'), findsWidgets);
      expect(
        harness.api.calls.any(
          (call) => call.path == ApiEndpoints.personalIncome,
        ),
        isTrue,
      );
      expect(
        harness.api.calls.any(
          (call) => call.path == ApiEndpoints.personalSavings,
        ),
        isTrue,
      );

      await _tapTab(tester, 'Groups');
      expect(find.text('Groups'), findsWidgets);
      expect(find.text('Family Expenses'), findsOneWidget);
      expect(find.text('Business Trip'), findsOneWidget);
      expect(
        harness.api.calls.any((call) => call.path == ApiEndpoints.groups),
        isTrue,
      );

      await _tapTab(tester, 'Profile');
      expect(find.text('Profile'), findsWidgets);
      expect(find.text(integrationUserName), findsOneWidget);
      expect(find.text(integrationUserEmail), findsOneWidget);
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
    });
  });
}

Future<void> _tapTab(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle(const Duration(seconds: 1));
}
