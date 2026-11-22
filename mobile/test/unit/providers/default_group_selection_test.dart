import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/default_group_selection.dart';

GroupModel _group(String id) {
  final now = Timestamp.fromDate(DateTime(2026, 11, 21));
  return GroupModel(
    id: id,
    name: 'Group $id',
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    settings: const GroupSettings(),
    status: 'active',
    stats: const GroupStats(),
  );
}

void main() {
  group('parseDefaultGroupId', () {
    test('reads the API field defaultGroupId', () {
      expect(parseDefaultGroupId({'defaultGroupId': 'g1'}), 'g1');
    });

    test('accepts the groupId alias', () {
      expect(parseDefaultGroupId({'groupId': 'g1'}), 'g1');
    });

    test('prefers defaultGroupId when both are present', () {
      expect(
        parseDefaultGroupId({'defaultGroupId': 'g1', 'groupId': 'g2'}),
        'g1',
      );
    });

    test('returns null when no default is set', () {
      expect(parseDefaultGroupId({'defaultGroupId': null}), isNull);
      expect(parseDefaultGroupId({}), isNull);
      expect(parseDefaultGroupId({'defaultGroupId': ''}), isNull);
    });
  });

  group('resolveDefaultGroup', () {
    final groups = AsyncValue.data([_group('g1'), _group('g2')]);

    test('selects the default group once both have loaded', () {
      final result = resolveDefaultGroup(
        defaultGroup: const AsyncValue.data('g2'),
        groups: groups,
      );
      expect(result.resolved, isTrue);
      expect(result.groupId, 'g2');
    });

    test('waits for the groups list instead of giving up', () {
      final result = resolveDefaultGroup(
        defaultGroup: const AsyncValue.data('g2'),
        groups: const AsyncValue.loading(),
      );
      expect(result.resolved, isFalse);
      expect(result.groupId, isNull);
    });

    test('waits while the default group is loading', () {
      final result = resolveDefaultGroup(
        defaultGroup: const AsyncValue.loading(),
        groups: groups,
      );
      expect(result.resolved, isFalse);
    });

    test('stays Personal when no default is set, without waiting', () {
      final result = resolveDefaultGroup(
        defaultGroup: const AsyncValue.data(null),
        groups: const AsyncValue.loading(),
      );
      expect(result.resolved, isTrue);
      expect(result.groupId, isNull);
    });

    test('stays Personal when the user left the default group', () {
      final result = resolveDefaultGroup(
        defaultGroup: const AsyncValue.data('gone'),
        groups: groups,
      );
      expect(result.resolved, isTrue);
      expect(result.groupId, isNull);
    });

    test('stays Personal when either request failed', () {
      final failed = AsyncValue<String?>.error('boom', StackTrace.empty);
      expect(
        resolveDefaultGroup(defaultGroup: failed, groups: groups).groupId,
        isNull,
      );
      final groupsFailed = AsyncValue<List<GroupModel>>.error(
        'boom',
        StackTrace.empty,
      );
      final result = resolveDefaultGroup(
        defaultGroup: const AsyncValue.data('g1'),
        groups: groupsFailed,
      );
      expect(result.resolved, isTrue);
      expect(result.groupId, isNull);
    });
  });
}
