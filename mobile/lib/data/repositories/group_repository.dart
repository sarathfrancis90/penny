import 'package:dio/dio.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/group_activity_model.dart';
import 'package:penny_mobile/data/models/group_invitation_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class GroupRepository {
  GroupRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<GroupModel?> watchGroup(String groupId) {
    return Stream.fromFuture(getGroup(groupId));
  }

  Future<GroupModel?> getGroup(String groupId) async {
    final response = await _api.get(ApiEndpoints.groupById(groupId));
    final group = responseMap(response)['group'];
    if (group == null) return null;
    return GroupModel.fromFirestore(apiDocument(mapValue(group)));
  }

  Stream<List<GroupModel>> watchUserGroups(String userId) {
    return Stream.fromFuture(_listGroups(userId));
  }

  Future<List<GroupModel>> _listGroups(String userId) async {
    final response = await _api.get(
      ApiEndpoints.groups,
      queryParameters: {'userId': userId},
    );
    final data = responseMap(response);
    return parseList(data['groups'], GroupModel.fromFirestore);
  }

  Stream<List<GroupMemberModel>> watchGroupMembers(String groupId) {
    return Stream.fromFuture(_listMembers(groupId));
  }

  Future<List<GroupMemberModel>> _listMembers(String groupId) async {
    final response = await _api.get(ApiEndpoints.groupMembers(groupId));
    final data = responseMap(response);
    return parseList(data['members'], GroupMemberModel.fromFirestore);
  }

  Future<GroupMemberModel?> getUserMembership(
    String groupId,
    String userId,
  ) async {
    final response = await _api.get(ApiEndpoints.myGroupMembership(groupId));
    final membership = responseMap(response)['membership'];
    if (membership == null) return null;
    return GroupMemberModel.fromFirestore(apiDocument(mapValue(membership)));
  }

  Stream<List<GroupActivityModel>> watchGroupActivities(
    String groupId, {
    int limit = 50,
  }) {
    return Stream.fromFuture(_listActivities(groupId, limit: limit));
  }

  Future<List<GroupActivityModel>> _listActivities(
    String groupId, {
    int limit = 50,
  }) async {
    final response = await _api.get(
      ApiEndpoints.groupActivities(groupId),
      queryParameters: {'limit': limit},
    );
    final data = responseMap(response);
    return parseList(data['activities'], GroupActivityModel.fromFirestore);
  }

  /// The signed-in user's pending group invitations. An older API without
  /// this route (404) has none to show.
  Future<List<GroupInvitationModel>> listPendingInvitations() async {
    final Response<dynamic> response;
    try {
      response = await _api.get(ApiEndpoints.groupInvitations);
    } on DioException catch (error) {
      if (error.response?.statusCode == 404) return const [];
      rethrow;
    }
    return [
      for (final json in listValue(responseMap(response)['invitations']))
        ?GroupInvitationModel.tryParse(json),
    ];
  }

  /// Accepts by [token], or by [invitationId] when the notification that
  /// brought the user here has no token.
  Future<Map<String, dynamic>> acceptInvitation({
    String? token,
    String? invitationId,
    required String userId,
    required String userEmail,
    String? userName,
  }) async {
    final response = await _api.post(
      ApiEndpoints.acceptInvitation,
      data: {
        'token': ?token,
        'invitationId': ?invitationId,
        'userId': userId,
        'userEmail': userEmail,
        'userName': ?userName,
      },
    );
    return responseMap(response);
  }

  Future<void> declineInvitation({required String invitationId}) async {
    await _api.post(ApiEndpoints.declineInvitation(invitationId));
  }

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
        'description': ?description,
        'color': ?color,
        'icon': ?icon,
        'settings': {
          'requireApproval': requireApproval,
          'allowMemberInvites': true,
          'currency': 'CAD',
        },
        'userEmail': ?userEmail,
        'userName': ?userName,
      },
    );
    final data = responseMap(response);
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Failed to create group');
    }
    return data['groupId'] as String;
  }

  Future<void> inviteMember({
    required String groupId,
    required String email,
    required String role,
    required String userId,
  }) async {
    await _api.post(
      ApiEndpoints.groupMembers(groupId),
      data: {'email': email, 'role': role, 'userId': userId},
    );
  }

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

  Future<void> deleteGroup(String groupId, String userId) async {
    await _api.delete(
      ApiEndpoints.groupById(groupId),
      queryParameters: {'userId': userId},
    );
  }

  Future<void> leaveGroup(String groupId, String userId) async {
    await _api.post(ApiEndpoints.groupLeave(groupId), data: {'userId': userId});
  }
}
