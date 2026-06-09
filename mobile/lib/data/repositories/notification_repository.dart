import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class NotificationRepository {
  NotificationRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Stream<List<NotificationModel>> watchNotifications(String userId) {
    return Stream.fromFuture(_listNotifications(userId));
  }

  Future<List<NotificationModel>> _listNotifications(String userId) async {
    final response = await _api.get(
      ApiEndpoints.notifications,
      queryParameters: {'userId': userId},
    );
    return listValue(responseMap(response)['notifications'])
        .map((json) => NotificationModel.fromFirestore(apiDocument(json)))
        .toList();
  }

  Future<void> markAsRead(String notificationId) async {
    await _api.patch(ApiEndpoints.notificationRead(notificationId));
  }

  Future<void> markAllAsRead(String userId) async {
    await _api.post(
      ApiEndpoints.markAllNotificationsRead,
      data: {'userId': userId},
    );
  }

  Future<void> deleteNotification(String notificationId) async {
    await _api.delete(ApiEndpoints.notifications + '/$notificationId');
  }
}
