/// A pending invitation for the signed-in user to join a group, as listed by
/// `GET /api/groups/invitations`.
class GroupInvitationModel {
  const GroupInvitationModel({
    required this.id,
    required this.groupId,
    required this.groupName,
    required this.invitedBy,
    required this.role,
    this.invitedByName,
    this.createdAt,
    this.expiresAt,
  });

  final String id;
  final String groupId;
  final String groupName;

  /// User id of whoever sent the invitation.
  final String invitedBy;
  final String? invitedByName;

  /// Role the user gets on accepting: owner, admin, member or viewer.
  final String role;
  final DateTime? createdAt;
  final DateTime? expiresAt;

  /// `null` when the item has no id or group (it could not be accepted).
  static GroupInvitationModel? tryParse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final groupId = _string(json['groupId']);
    if (id == null || groupId == null) return null;
    return GroupInvitationModel(
      id: id,
      groupId: groupId,
      groupName: _string(json['groupName']) ?? 'a group',
      invitedBy: _string(json['invitedBy']) ?? '',
      invitedByName: _string(json['invitedByName']),
      role: _string(json['role']) ?? 'member',
      createdAt: _date(json['createdAt']),
      expiresAt: _date(json['expiresAt']),
    );
  }

  /// Who sent it, for display.
  String get inviterLabel => invitedByName ?? 'Someone';

  /// The role with a capital first letter, for display.
  String get roleLabel =>
      role.isEmpty ? role : '${role[0].toUpperCase()}${role.substring(1)}';

  static String? _string(Object? value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static DateTime? _date(Object? value) =>
      value is String ? DateTime.tryParse(value) : null;
}
