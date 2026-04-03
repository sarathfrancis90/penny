import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/group_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream all groups the current user belongs to.
final userGroupsProvider = StreamProvider<List<GroupModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(groupRepositoryProvider).watchUserGroups(user.uid);
});

/// Stream members of a specific group.
final groupMembersProvider =
    StreamProvider.family<List<GroupMemberModel>, String>((ref, groupId) {
  return ref.watch(groupRepositoryProvider).watchGroupMembers(groupId);
});

/// Get a single group by ID from the cached groups list.
final groupByIdProvider =
    Provider.family<GroupModel?, String>((ref, groupId) {
  final groups = ref.watch(userGroupsProvider).valueOrNull ?? [];
  final matches = groups.where((g) => g.id == groupId);
  return matches.isEmpty ? null : matches.first;
});
