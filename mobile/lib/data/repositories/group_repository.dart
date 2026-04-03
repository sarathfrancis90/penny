import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';

class GroupRepository {
  GroupRepository({
    required ApiClient apiClient,
    FirebaseFirestore? firestore,
  })  : _api = apiClient,
        _db = firestore ?? FirebaseFirestore.instance;

  final ApiClient _api;
  final FirebaseFirestore _db;

  // ====== Firestore Reads (real-time) ======

  /// Stream groups where user is an active member.
  Stream<List<GroupModel>> watchUserGroups(String userId) {
    // First get the user's group memberships
    return _db
        .collection('groupMembers')
        .where('userId', isEqualTo: userId)
        .where('status', isEqualTo: 'active')
        .snapshots()
        .asyncMap((memberSnap) async {
      if (memberSnap.docs.isEmpty) return <GroupModel>[];

      final groupIds =
          memberSnap.docs.map((d) => d.data()['groupId'] as String).toList();

      // Firestore 'in' query limited to 10
      final batches = <List<String>>[];
      for (var i = 0; i < groupIds.length; i += 10) {
        batches.add(groupIds.sublist(
            i, i + 10 > groupIds.length ? groupIds.length : i + 10));
      }

      final groups = <GroupModel>[];
      for (final batch in batches) {
        final snap = await _db
            .collection('groups')
            .where(FieldPath.documentId, whereIn: batch)
            .where('status', isEqualTo: 'active')
            .get();
        groups.addAll(snap.docs.map(GroupModel.fromFirestore));
      }

      return groups;
    });
  }

  /// Stream members of a specific group.
  Stream<List<GroupMemberModel>> watchGroupMembers(String groupId) {
    return _db
        .collection('groupMembers')
        .where('groupId', isEqualTo: groupId)
        .where('status', isEqualTo: 'active')
        .snapshots()
        .map((snap) =>
            snap.docs.map(GroupMemberModel.fromFirestore).toList());
  }

  /// Get the current user's role in a group.
  Future<GroupMemberModel?> getUserMembership(
      String groupId, String userId) async {
    final docId = '${groupId}_$userId';
    final doc = await _db.collection('groupMembers').doc(docId).get();
    if (!doc.exists) return null;
    return GroupMemberModel.fromFirestore(doc);
  }

  // ====== API Writes (server-side for atomicity) ======

  /// Create a group via API (atomically creates group + owner membership + activity log).
  Future<String> createGroup({
    required String userId,
    required String name,
    String? description,
    String? color,
    String? icon,
    bool requireApproval = false,
    String? userEmail,
    String? userName,
  }) async {
    final response = await _api.post(
      ApiEndpoints.groups,
      data: {
        'name': name,
        'userId': userId,
        if (description != null) 'description': description,
        if (color != null) 'color': color,
        if (icon != null) 'icon': icon,
        'settings': {
          'requireApproval': requireApproval,
          'allowMemberInvites': true,
          'currency': 'CAD',
        },
        if (userEmail != null) 'userEmail': userEmail,
        if (userName != null) 'userName': userName,
      },
    );

    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to create group');
    }
    return data['groupId'] as String;
  }

  /// Invite a member via API (generates secure token).
  Future<void> inviteMember({
    required String groupId,
    required String email,
    required String role,
    required String userId,
  }) async {
    final response = await _api.post(
      ApiEndpoints.groupMembers(groupId),
      data: {
        'email': email,
        'role': role,
        'userId': userId,
      },
    );

    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to invite member');
    }
  }

  /// Update group settings via API.
  Future<void> updateGroup({
    required String groupId,
    required String userId,
    required Map<String, dynamic> updates,
  }) async {
    await _api.patch(
      ApiEndpoints.groupById(groupId),
      data: {'userId': userId, ...updates},
    );
  }

  /// Delete (soft-delete) group via API.
  Future<void> deleteGroup(String groupId, String userId) async {
    await _api.delete('${ApiEndpoints.groupById(groupId)}?userId=$userId');
  }
}
