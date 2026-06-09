import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';

import 'helpers/api_backed_test_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(preparePennyIntegrationTest);
  tearDown(resetPennyIntegrationErrorWidget);

  group('API-backed auth and pushed screens', () {
    testWidgets('signed-out user sees the login screen', (tester) async {
      final harness = PennyIntegrationHarness(signedIn: false);

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Penny'), findsWidgets);
      expect(find.text('AI Expense Tracker'), findsOneWidget);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
    });

    testWidgets('notifications and settings render through API providers', (
      tester,
    ) async {
      final harness = PennyIntegrationHarness();

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Notifications'), findsWidgets);
      expect(find.text('Budget Warning'), findsOneWidget);
      expect(find.text('New group expense'), findsOneWidget);
      expect(
        harness.api.calls.any(
          (call) => call.path == ApiEndpoints.notifications,
        ),
        isTrue,
      );

      await tester.pageBack();
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Settings'), findsWidgets);
      expect(find.text('Currency'), findsOneWidget);
      expect(find.text('Fiscal Year End'), findsOneWidget);
      expect(find.text('Notification Preferences'), findsOneWidget);
      expect(find.text('Delete Account'), findsOneWidget);
      expect(
        harness.api.calls.any(
          (call) => call.path == ApiEndpoints.userPreferences,
        ),
        isTrue,
      );
    });

    testWidgets('group detail renders membership and group finance endpoints', (
      tester,
    ) async {
      final harness = PennyIntegrationHarness();

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      await tester.tap(find.text('Groups').last);
      await tester.pumpAndSettle(const Duration(seconds: 1));
      await tester.tap(find.text('Family Expenses'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Family Expenses'), findsWidgets);
      expect(find.text('Shared household spending'), findsOneWidget);
      expect(find.text('Partner User'), findsOneWidget);
      expect(
        harness.api.calls.any(
          (call) =>
              call.path == ApiEndpoints.expenses &&
              call.queryParameters?['groupId'] == integrationGroupId,
        ),
        isTrue,
      );
      expect(
        harness.api.calls.any(
          (call) => call.path == ApiEndpoints.groupMembers(integrationGroupId),
        ),
        isTrue,
      );
      expect(
        harness.api.calls.any((call) => call.path == ApiEndpoints.groupBudgets),
        isTrue,
      );
      expect(
        harness.api.calls.any((call) => call.path == ApiEndpoints.groupIncome),
        isTrue,
      );
      expect(
        harness.api.calls.any((call) => call.path == ApiEndpoints.groupSavings),
        isTrue,
      );
    });
  });
}
