import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/expense_card.dart';
import 'package:penny_mobile/presentation/widgets/expense_confirmation_sheet.dart';

GroupModel _group(String id, String name, String role) {
  final now = Timestamp.fromDate(DateTime(2026, 11, 21));
  return GroupModel(
    id: id,
    name: name,
    createdBy: 'owner',
    createdAt: now,
    updatedAt: now,
    settings: const GroupSettings(),
    status: 'active',
    stats: const GroupStats(),
    myPermissions: GroupPermissions.forRole(role),
  );
}

const _groupHint = 'This expense will be shared with the group';
const _personalHint = 'This is a personal expense';

Future<void> _pump(
  WidgetTester tester,
  Widget form, {
  String? defaultGroupId,
}) async {
  tester.view.physicalSize = const Size(1200, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        userGroupsProvider.overrideWith(
          (ref) => Stream.value([
            _group('g-member', 'Family', 'member'),
            _group('g-viewer', 'Roommates', 'viewer'),
          ]),
        ),
        defaultGroupProvider.overrideWith(
          (ref) => Stream.value(defaultGroupId),
        ),
        budgetUsageProvider.overrideWithValue(const []),
      ],
      child: MaterialApp(
        home: Scaffold(body: SingleChildScrollView(child: form)),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  await tester.pump();
}

ParsedExpense _parsed(String date) => ParsedExpense(
  vendor: 'Tim Hortons',
  amount: 6.42,
  date: date,
  category: 'Meals and entertainment',
);

void main() {
  group('group selector', () {
    testWidgets('a default group where the user is only a viewer is not '
        'pre-selected', (tester) async {
      await _pump(
        tester,
        ExpenseConfirmationSheet(expense: _parsed('2026-11-09')),
        defaultGroupId: 'g-viewer',
      );
      expect(find.text(_personalHint), findsOneWidget);
      expect(find.text(_groupHint), findsNothing);
    });

    testWidgets('a default group the user can add to is still pre-selected', (
      tester,
    ) async {
      await _pump(
        tester,
        ExpenseConfirmationSheet(expense: _parsed('2026-11-09')),
        defaultGroupId: 'g-member',
      );
      expect(find.text(_groupHint), findsOneWidget);
    });

    testWidgets('the expense card does not list a viewer-only group', (
      tester,
    ) async {
      await _pump(tester, ExpenseCard(expense: _parsed('2026-11-09')));
      await tester.tap(find.text('Personal'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Family'), findsWidgets);
      expect(find.textContaining('Roommates'), findsNothing);
    });
  });

  group('date picker', () {
    for (final date in ['2019-03-04', '2031-01-15']) {
      testWidgets('opens for an AI date outside the allowed range ($date) '
          'on the confirmation sheet', (tester) async {
        await _pump(tester, ExpenseConfirmationSheet(expense: _parsed(date)));
        final parts = date.split('-').map(int.parse).toList();
        final label = DateFormat(
          'MMM d, yyyy',
        ).format(DateTime(parts[0], parts[1], parts[2]));

        await tester.tap(find.text(label));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byType(DatePickerDialog), findsOneWidget);
      });

      testWidgets('opens for an AI date outside the allowed range ($date) '
          'on the expense card', (tester) async {
        await _pump(tester, ExpenseCard(expense: _parsed(date)));
        final parts = date.split('-').map(int.parse).toList();
        final label = DateFormat(
          'MMM d, yyyy',
        ).format(DateTime(parts[0], parts[1], parts[2]));

        await tester.tap(find.text(label));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byType(DatePickerDialog), findsOneWidget);
      });
    }
  });
}
