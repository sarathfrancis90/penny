import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/notification_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('NotificationRepository API contract', () {
    test('watchNotifications reads notification API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'notifications': [
            {
              'id': 'notification-1',
              'userId': 'user-1',
              'type': 'system',
              'title': 'Hello',
              'body': 'World',
              'priority': 'low',
              'category': 'system',
              'read': false,
              'delivered': false,
              'isGrouped': false,
              'createdAt': '2026-06-01T00:00:00.000Z',
            },
          ],
        });
      final repo = NotificationRepository(apiClient: api);

      final notifications = await repo.watchNotifications('user-1').first;

      expect(notifications.single.id, 'notification-1');
      expect(api.calls.single.path, ApiEndpoints.notifications);
      expect(api.calls.single.queryParameters, {'userId': 'user-1'});
    });

    test('mark and delete operations use notification API', () async {
      final api = FakeApiClient()
        ..queueResponse({})
        ..queueResponse({})
        ..queueResponse({});
      final repo = NotificationRepository(apiClient: api);

      await repo.markAsRead('notification-1');
      await repo.markAllAsRead('user-1');
      await repo.deleteNotification('notification-1');

      expect(api.calls[0].method, 'PATCH');
      expect(
        api.calls[0].path,
        ApiEndpoints.notificationRead('notification-1'),
      );
      expect(api.calls[1].method, 'POST');
      expect(api.calls[1].path, ApiEndpoints.markAllNotificationsRead);
      expect(api.calls[1].data, {'userId': 'user-1'});
      expect(api.calls[2].method, 'DELETE');
      expect(api.calls[2].path, '${ApiEndpoints.notifications}/notification-1');
    });
  });
}
