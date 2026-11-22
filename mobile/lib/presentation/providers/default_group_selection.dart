import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/group_model.dart';

/// Reads the default group id from a `GET /api/user/default-group` response.
///
/// The API's field is `defaultGroupId`; `groupId` is accepted as an alias.
String? parseDefaultGroupId(Map<String, dynamic> data) {
  final id = data['defaultGroupId'] ?? data['groupId'];
  return id is String && id.isNotEmpty ? id : null;
}

/// Which group a new expense form should start in.
class DefaultGroupSelection {
  const DefaultGroupSelection.pending() : resolved = false, groupId = null;
  const DefaultGroupSelection.resolved(this.groupId) : resolved = true;

  /// False while the default group or the groups list is still loading.
  final bool resolved;

  /// The group to pre-select, or `null` for "Personal".
  final String? groupId;
}

/// Decides the pre-selected group once both the saved default and the user's
/// groups are known. The default only applies if the user is still a member.
DefaultGroupSelection resolveDefaultGroup({
  required AsyncValue<String?> defaultGroup,
  required AsyncValue<List<GroupModel>> groups,
}) {
  if (defaultGroup.isLoading) return const DefaultGroupSelection.pending();
  if (defaultGroup.hasError) return const DefaultGroupSelection.resolved(null);
  final id = defaultGroup.valueOrNull;
  if (id == null) return const DefaultGroupSelection.resolved(null);

  if (groups.isLoading) return const DefaultGroupSelection.pending();
  final list = groups.valueOrNull;
  if (list == null) return const DefaultGroupSelection.resolved(null);
  return DefaultGroupSelection.resolved(
    list.any((group) => group.id == id) ? id : null,
  );
}
