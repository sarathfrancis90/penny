import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';
import 'package:penny_mobile/presentation/providers/default_group_selection.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';

GroupModel _group(String id, {Map<String, dynamic>? myPermissions}) {
  return GroupModel.fromFirestore(
    apiDocument({
      'id': id,
      'name': id,
      'createdBy': 'owner',
      'myPermissions': ?myPermissions,
    }),
  );
}

void main() {
  test('GroupModel reads myPermissions from the groups list', () {
    expect(_group('g').myPermissions, isNull);
    expect(_group('g').canAddExpenses, isTrue);
    expect(
      _group('g', myPermissions: {'canAddExpenses': true}).canAddExpenses,
      isTrue,
    );
    expect(
      _group('g', myPermissions: {'canViewReports': true}).canAddExpenses,
      isFalse,
    );
  });

  test('viewer-only groups are not offered, and a default group the user '
      'can no longer add to falls back to Personal', () async {
    final container = ProviderContainer(
      overrides: [
        userGroupsProvider.overrideWith(
          (ref) => Stream.value([
            _group('member', myPermissions: {'canAddExpenses': true}),
            _group('viewer', myPermissions: {'canViewReports': true}),
            _group('unknown'),
          ]),
        ),
      ],
    );
    addTearDown(container.dispose);
    await container.read(userGroupsProvider.future);

    final addable = container.read(addableGroupsProvider);
    expect(addable.value!.map((g) => g.id), ['member', 'unknown']);

    expect(
      resolveDefaultGroup(
        defaultGroup: const AsyncData('viewer'),
        groups: addable,
      ).groupId,
      isNull,
    );
    expect(
      resolveDefaultGroup(
        defaultGroup: const AsyncData('member'),
        groups: addable,
      ).groupId,
      'member',
    );
  });
}
