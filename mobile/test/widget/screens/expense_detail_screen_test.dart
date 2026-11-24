import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_detail_screen.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

ExpenseModel _expense({String userId = 'u1', bool group = false}) {
  final ts = Timestamp.fromDate(DateTime(2026, 11, 9, 12));
  return ExpenseModel(
    id: 'e1',
    userId: userId,
    vendor: 'Metro',
    amount: 87.25,
    category: 'Groceries',
    date: ts,
    expenseType: group ? 'group' : 'personal',
    createdAt: ts,
    updatedAt: ts,
    description: 'Weekly shop',
    groupId: group ? 'g1' : null,
    groupMetadata: group ? const {'approvalStatus': 'approved'} : null,
  );
}

GroupMemberModel _member(String role) {
  final ts = Timestamp.fromDate(DateTime(2026, 1, 1));
  return GroupMemberModel(
    id: 'g1_u1',
    groupId: 'g1',
    userId: 'u1',
    userEmail: 'u1@test.dev',
    role: role,
    status: 'active',
    permissions: GroupPermissions.forRole(role),
    invitedAt: ts,
    invitedBy: 'owner',
  );
}

void main() {
  late FakeApiClient api;

  setUp(() {
    api = FakeApiClient();
    api.stub(
      ApiEndpoints.expenses,
      () => {'id': 'new', 'expenses': <Object>[]},
    );
  });

  Future<ProviderContainer> open(
    WidgetTester tester,
    ExpenseModel expense, {
    String? role,
  }) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    late ProviderContainer container;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          guestModeProvider.overrideWith((ref) => false),
          currentUserProvider.overrideWithValue(createMockUser(uid: 'u1')),
          apiClientProvider.overrideWithValue(api),
          currentUserMembershipProvider.overrideWith(
            (ref, groupId) async => role == null ? null : _member(role),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Consumer(
              builder: (context, ref, _) {
                container = ProviderScope.containerOf(context);
                // Something is listening to the expense list, like the
                // dashboard under the detail screen.
                ref.watch(allExpensesProvider);
                return Center(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ExpenseDetailScreen(expense: expense),
                      ),
                    ),
                    child: const Text('open'),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    return container;
  }

  Future<void> confirmDelete(WidgetTester tester) async {
    await tester.tap(find.byTooltip('Delete expense'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
  }

  int count(String method, String path) =>
      api.calls.where((c) => c.method == method && c.path == path).length;

  testWidgets('a failed delete shows a friendly message and stays on the '
      'expense', (tester) async {
    api.stub(
      ApiEndpoints.expenseById('e1'),
      () => throw FakeApiClient.networkError(),
    );
    await open(tester, _expense());

    await confirmDelete(tester);

    expect(tester.takeException(), isNull);
    expect(find.text("Couldn't delete. $kNetworkErrorMessage"), findsOneWidget);
    expect(find.text('Expense'), findsOneWidget); // still on the detail screen
  });

  testWidgets('delete refreshes the list; Undo restores a group expense as a '
      'group expense', (tester) async {
    await open(tester, _expense(group: true), role: 'admin');
    final listLoads = count('GET', ApiEndpoints.expenses);

    await confirmDelete(tester);

    expect(count('DELETE', ApiEndpoints.expenseById('e1')), 1);
    expect(count('GET', ApiEndpoints.expenses), listLoads + 1);
    expect(find.text('open'), findsOneWidget); // back on the list
    expect(find.text('Metro deleted'), findsOneWidget);

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();

    final post = api.calls.lastWhere((c) => c.method == 'POST').data! as Map;
    expect(post['groupId'], 'g1');
    expect(post['expenseType'], 'group');
    expect(post['vendor'], 'Metro');
    expect(post['amount'], 87.25);
    expect(post['date'], '2026-11-09');
    expect(post['clientRequestId'], matches(RegExp(r'^[a-z0-9]{32}$')));
    expect(count('GET', ApiEndpoints.expenses), listLoads + 2);
  });

  testWidgets('a failed Undo tells the user', (tester) async {
    await open(tester, _expense());
    await confirmDelete(tester);
    api.stub(ApiEndpoints.expenses, () => throw FakeApiClient.networkError());

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      find.text("Couldn't restore Metro. $kNetworkErrorMessage"),
      findsOneWidget,
    );
  });

  testWidgets('a viewer sees no Edit or Delete on a group expense', (
    tester,
  ) async {
    await open(
      tester,
      _expense(userId: 'someone-else', group: true),
      role: 'viewer',
    );

    expect(find.byTooltip('Edit expense'), findsNothing);
    expect(find.byTooltip('Delete expense'), findsNothing);
    expect(find.text('Delete Expense'), findsNothing);
    expect(find.byTooltip('Share expense'), findsOneWidget);
  });

  testWidgets('a member can edit and delete their own group expense but not '
      "someone else's", (tester) async {
    await open(tester, _expense(group: true), role: 'member');
    expect(find.byTooltip('Edit expense'), findsOneWidget);
    expect(find.byTooltip('Delete expense'), findsOneWidget);
  });

  testWidgets('the edit sheet shows a field error for a bad amount and '
      'accepts "1,234.50"', (tester) async {
    await open(tester, _expense());
    final listLoads = count('GET', ApiEndpoints.expenses);
    await tester.tap(find.byTooltip('Edit expense'));
    await tester.pumpAndSettle();

    final amountField = find.widgetWithText(TextField, '87.25');
    await tester.enterText(amountField, 'abc');
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a valid amount'), findsOneWidget);
    expect(count('PATCH', ApiEndpoints.expenseById('e1')), 0);

    await tester.enterText(find.widgetWithText(TextField, 'abc'), '1,234.50');
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();

    final patch = api.calls.lastWhere((c) => c.method == 'PATCH').data! as Map;
    expect(patch['amount'], 1234.5);
    expect(count('GET', ApiEndpoints.expenses), listLoads + 1);
    expect(find.text('open'), findsOneWidget); // back on the refreshed list
  });

  test('expenseActionsFor', () {
    final own = _expense(group: true);
    final other = _expense(userId: 'someone-else', group: true);
    ({bool canEdit, bool canDelete}) actions(ExpenseModel e, String? role) {
      return expenseActionsFor(
        expense: e,
        userId: 'u1',
        permissions: role == null ? null : GroupPermissions.forRole(role),
      );
    }

    expect(actions(_expense(), 'viewer'), (canEdit: true, canDelete: true));
    expect(actions(other, null), (canEdit: true, canDelete: true));
    expect(actions(other, 'viewer'), (canEdit: false, canDelete: false));
    expect(actions(own, 'viewer'), (canEdit: false, canDelete: false));
    expect(actions(other, 'member'), (canEdit: false, canDelete: false));
    expect(actions(own, 'member'), (canEdit: true, canDelete: true));
    expect(actions(other, 'admin'), (canEdit: true, canDelete: true));
  });
}
