import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_activity_model.dart';
import 'package:penny_mobile/data/models/group_invitation_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

/// Stream all groups the current user belongs to.
/// Groups are locked in guest mode — returns empty list.
final userGroupsProvider = StreamProvider.autoDispose<List<GroupModel>>((ref) {
  keepForCurrentSession(ref);
  if (ref.watch(guestModeProvider)) return Stream.value([]);
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(groupRepositoryProvider).watchUserGroups(user.uid);
});

/// Groups the current user may add expenses to. A group where the user is
/// only a viewer is left out; if the permissions are unknown the group stays
/// (the server enforces the rule).
final addableGroupsProvider =
    Provider.autoDispose<AsyncValue<List<GroupModel>>>((ref) {
      return ref
          .watch(userGroupsProvider)
          .whenData((groups) => groups.where((g) => g.canAddExpenses).toList());
    });

// The per-group list providers below watch the signed-in user's id and are
// `autoDispose`: they reload when the user changes, and their cached data is
// dropped as soon as no screen shows it (which is the case after sign-out),
// so the next user on the device can never be shown the previous user's
// group data.
final _currentUserIdProvider = currentUserIdProvider;

/// Stream members of a specific group.
final groupMembersProvider = StreamProvider.autoDispose
    .family<List<GroupMemberModel>, String>((ref, groupId) {
      if (ref.watch(_currentUserIdProvider) == null) {
        return const Stream.empty();
      }
      return ref.watch(groupRepositoryProvider).watchGroupMembers(groupId);
    });

/// Stream expenses for a specific group.
final groupExpensesProvider = StreamProvider.autoDispose
    .family<List<ExpenseModel>, String>((ref, groupId) {
      if (ref.watch(_currentUserIdProvider) == null) {
        return const Stream.empty();
      }
      return ref.watch(expenseRepositoryProvider).watchGroupExpenses(groupId);
    });

/// Get the current user's membership in a group.
final currentUserMembershipProvider = FutureProvider.autoDispose
    .family<GroupMemberModel?, String>((ref, groupId) {
      keepForCurrentSession(ref);
      final user = ref.watch(currentUserProvider);
      if (user == null) return Future.value(null);
      return ref
          .watch(groupRepositoryProvider)
          .getUserMembership(groupId, user.uid);
    });

/// Stream a single group by ID so detail/header/stats update in real time.
final groupByIdProvider = StreamProvider.autoDispose
    .family<GroupModel?, String>((ref, groupId) {
      keepForCurrentSession(ref);
      if (ref.watch(guestModeProvider)) return Stream.value(null);
      final user = ref.watch(currentUserProvider);
      if (user == null) return const Stream.empty();
      return ref.watch(groupRepositoryProvider).watchGroup(groupId);
    });

/// Stream pending group expenses awaiting approval.
final pendingGroupExpensesProvider = StreamProvider.autoDispose
    .family<List<ExpenseModel>, String>((ref, groupId) {
      if (ref.watch(_currentUserIdProvider) == null) {
        return const Stream.empty();
      }
      return ref
          .watch(expenseRepositoryProvider)
          .watchPendingGroupExpenses(groupId);
    });

/// Count of pending expenses for a group.
final pendingExpenseCountProvider = Provider.autoDispose.family<int, String>((
  ref,
  groupId,
) {
  return ref.watch(pendingGroupExpensesProvider(groupId)).valueOrNull?.length ??
      0;
});

/// Stream recent activity for a group.
final groupActivitiesProvider = StreamProvider.autoDispose
    .family<List<GroupActivityModel>, String>((ref, groupId) {
      if (ref.watch(_currentUserIdProvider) == null) {
        return const Stream.empty();
      }
      return ref.watch(groupRepositoryProvider).watchGroupActivities(groupId);
    });

/// The signed-in user's pending group invitations (none in guest mode or
/// when signed out). Shown at the top of the Groups screen, so an invitation
/// can be answered even if its notification never arrived.
final pendingInvitationsProvider =
    FutureProvider.autoDispose<List<GroupInvitationModel>>((ref) {
      keepForCurrentSession(ref);
      if (ref.watch(guestModeProvider)) return const [];
      if (ref.watch(_currentUserIdProvider) == null) return const [];
      return ref.watch(groupRepositoryProvider).listPendingInvitations();
    });
