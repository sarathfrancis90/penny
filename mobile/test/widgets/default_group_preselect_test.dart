import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/expense_confirmation_sheet.dart';

GroupModel _group(String id, String name) {
  final now = Timestamp.fromDate(DateTime(2026, 11, 21));
  return GroupModel(
    id: id,
    name: name,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    settings: const GroupSettings(),
    status: 'active',
    stats: const GroupStats(),
  );
}

const _groupHint = 'This expense will be shared with the group';
const _personalHint = 'This is a personal expense';

Future<StreamController<List<GroupModel>>> _pumpSheet(
  WidgetTester tester, {
  required String? defaultGroupId,
}) async {
  final groups = StreamController<List<GroupModel>>();
  addTearDown(groups.close);
  tester.view.physicalSize = const Size(1200, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        userGroupsProvider.overrideWith((ref) => groups.stream),
        defaultGroupProvider.overrideWith(
          (ref) => Stream.value(defaultGroupId),
        ),
        budgetUsageProvider.overrideWithValue(const []),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ExpenseConfirmationSheet(
              expense: ParsedExpense(
                vendor: 'Tim Hortons',
                amount: 6.42,
                date: '2026-11-09',
                category: 'Meals and entertainment',
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return groups;
}

void main() {
  testWidgets('pre-selects the default group even when the groups list '
      'arrives after the default', (tester) async {
    final groups = await _pumpSheet(tester, defaultGroupId: 'g2');

    // Default is known, groups are still loading: nothing decided yet.
    await tester.pump();
    expect(find.text(_personalHint), findsOneWidget);

    groups.add([_group('g1', 'Family'), _group('g2', 'Roommates')]);
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(find.text(_groupHint), findsOneWidget);
    expect(find.text('Roommates'), findsWidgets);
  });

  testWidgets('stays Personal when no default group is set', (tester) async {
    final groups = await _pumpSheet(tester, defaultGroupId: null);
    groups.add([_group('g1', 'Family')]);
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(find.text(_personalHint), findsOneWidget);
    expect(find.text(_groupHint), findsNothing);
  });
}
