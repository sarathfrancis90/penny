import 'package:cloud_firestore/cloud_firestore.dart';

class GroupMemberModel {
  GroupMemberModel({
    required this.id,
    required this.groupId,
    required this.userId,
    required this.userEmail,
    required this.role,
    required this.status,
    required this.permissions,
    required this.invitedAt,
    required this.invitedBy,
    this.userName,
    this.joinedAt,
    this.lastActivityAt,
  });

  final String id;
  final String groupId;
  final String userId;
  final String userEmail;
  final String role; // owner, admin, member, viewer
  final String status; // active, invited, left, removed
  final GroupPermissions permissions;
  final Timestamp invitedAt;
  final String invitedBy;
  final String? userName;
  final Timestamp? joinedAt;
  final Timestamp? lastActivityAt;

  factory GroupMemberModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return GroupMemberModel(
      id: doc.id,
      groupId: data['groupId'] as String,
      userId: data['userId'] as String,
      userEmail: data['userEmail'] as String,
      role: data['role'] as String,
      status: data['status'] as String? ?? 'active',
      permissions: GroupPermissions.fromMap(
          Map<String, dynamic>.from(data['permissions'] as Map? ?? {})),
      invitedAt: data['invitedAt'] as Timestamp,
      invitedBy: data['invitedBy'] as String,
      userName: data['userName'] as String?,
      joinedAt: data['joinedAt'] as Timestamp?,
      lastActivityAt: data['lastActivityAt'] as Timestamp?,
    );
  }

  bool get isOwner => role == 'owner';
  bool get isAdmin => role == 'owner' || role == 'admin';
}

class GroupPermissions {
  const GroupPermissions({
    this.canAddExpenses = false,
    this.canEditOwnExpenses = false,
    this.canEditAllExpenses = false,
    this.canDeleteExpenses = false,
    this.canApproveExpenses = false,
    this.canInviteMembers = false,
    this.canRemoveMembers = false,
    this.canViewReports = false,
    this.canExportData = false,
    this.canManageSettings = false,
  });

  final bool canAddExpenses;
  final bool canEditOwnExpenses;
  final bool canEditAllExpenses;
  final bool canDeleteExpenses;
  final bool canApproveExpenses;
  final bool canInviteMembers;
  final bool canRemoveMembers;
  final bool canViewReports;
  final bool canExportData;
  final bool canManageSettings;

  factory GroupPermissions.fromMap(Map<String, dynamic> map) {
    return GroupPermissions(
      canAddExpenses: map['canAddExpenses'] as bool? ?? false,
      canEditOwnExpenses: map['canEditOwnExpenses'] as bool? ?? false,
      canEditAllExpenses: map['canEditAllExpenses'] as bool? ?? false,
      canDeleteExpenses: map['canDeleteExpenses'] as bool? ?? false,
      canApproveExpenses: map['canApproveExpenses'] as bool? ?? false,
      canInviteMembers: map['canInviteMembers'] as bool? ?? false,
      canRemoveMembers: map['canRemoveMembers'] as bool? ?? false,
      canViewReports: map['canViewReports'] as bool? ?? false,
      canExportData: map['canExportData'] as bool? ?? false,
      canManageSettings: map['canManageSettings'] as bool? ?? false,
    );
  }

  /// Default permissions for each role (mirrors DEFAULT_ROLE_PERMISSIONS in types.ts).
  static GroupPermissions forRole(String role) {
    return switch (role) {
      'owner' => const GroupPermissions(
          canAddExpenses: true, canEditOwnExpenses: true,
          canEditAllExpenses: true, canDeleteExpenses: true,
          canApproveExpenses: true, canInviteMembers: true,
          canRemoveMembers: true, canViewReports: true,
          canExportData: true, canManageSettings: true),
      'admin' => const GroupPermissions(
          canAddExpenses: true, canEditOwnExpenses: true,
          canEditAllExpenses: true, canDeleteExpenses: true,
          canApproveExpenses: true, canInviteMembers: true,
          canRemoveMembers: true, canViewReports: true,
          canExportData: true),
      'member' => const GroupPermissions(
          canAddExpenses: true, canEditOwnExpenses: true,
          canViewReports: true),
      'viewer' => const GroupPermissions(canViewReports: true),
      _ => const GroupPermissions(),
    };
  }
}
