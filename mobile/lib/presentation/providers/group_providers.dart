import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_activity_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream all groups the current user belongs to.
/// Groups are locked in guest mode — returns empty list.
final userGroupsProvider = StreamProvider<List<GroupModel>>((ref) {
  if (ref.watch(guestModeProvider)) return Stream.value([]);
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(groupRepositoryProvider).watchUserGroups(user.uid);
});

/// Stream members of a specific group.
final groupMembersProvider =
    StreamProvider.family<List<GroupMemberModel>, String>((ref, groupId) {
  return ref.watch(groupRepositoryProvider).watchGroupMembers(groupId);
});

/// Stream expenses for a specific group.
final groupExpensesProvider =
    StreamProvider.family<List<ExpenseModel>, String>((ref, groupId) {
  return ref.watch(expenseRepositoryProvider).watchGroupExpenses(groupId);
});

/// Get the current user's membership in a group.
final currentUserMembershipProvider =
    FutureProvider.family<GroupMemberModel?, String>((ref, groupId) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return Future.value(null);
  return ref.watch(groupRepositoryProvider).getUserMembership(groupId, user.uid);
});

/// Get a single group by ID from the cached groups list.
final groupByIdProvider =
    Provider.family<GroupModel?, String>((ref, groupId) {
  final groups = ref.watch(userGroupsProvider).valueOrNull ?? [];
  final matches = groups.where((g) => g.id == groupId);
  return matches.isEmpty ? null : matches.first;
});

/// Stream pending group expenses awaiting approval.
final pendingGroupExpensesProvider =
    StreamProvider.family<List<ExpenseModel>, String>((ref, groupId) {
  return ref.watch(expenseRepositoryProvider).watchPendingGroupExpenses(groupId);
});

/// Count of pending expenses for a group.
final pendingExpenseCountProvider =
    Provider.family<int, String>((ref, groupId) {
  return ref
          .watch(pendingGroupExpensesProvider(groupId))
          .valueOrNull
          ?.length ??
      0;
});

/// Stream recent activity for a group.
final groupActivitiesProvider =
    StreamProvider.family<List<GroupActivityModel>, String>((ref, groupId) {
  return ref.watch(groupRepositoryProvider).watchGroupActivities(groupId);
});
