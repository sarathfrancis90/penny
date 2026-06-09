import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/constants/notification_types.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';
import 'package:penny_mobile/data/repositories/notification_preferences_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('NotificationPreferencesRepository API contract', () {
    test('watchSettings reads notification settings API', () async {
      final api = FakeApiClient()
        ..queueResponse({
          'settings': {
            'globalMute': true,
            'quietHoursStart': '22:00',
            'quietHoursEnd': '07:00',
            'updatedAt': '2026-06-01T00:00:00.000Z',
          },
        });
      final repo = NotificationPreferencesRepository(apiClient: api);

      final settings = await repo.watchSettings('user-1').first;

      expect(settings.globalMute, true);
      expect(api.calls.single.path, ApiEndpoints.notificationSettings);
      expect(api.calls.single.queryParameters, {'userId': 'user-1'});
    });

    test('updateSettings writes through API', () async {
      final api = FakeApiClient()..queueResponse({});
      final repo = NotificationPreferencesRepository(apiClient: api);

      await repo.updateSettings('user-1', {'globalMute': true});

      expect(api.calls.single.method, 'PUT');
      expect(api.calls.single.path, ApiEndpoints.notificationSettings);
      expect(api.calls.single.data, {'userId': 'user-1', 'globalMute': true});
    });

    test('updateTypePreference writes typed preference through API', () async {
      final api = FakeApiClient()..queueResponse({});
      final repo = NotificationPreferencesRepository(apiClient: api);

      await repo.updateTypePreference(
        'user-1',
        NotificationType.budgetWarning,
        const NotificationTypePreference(push: false),
      );

      expect(api.calls.single.method, 'PUT');
      expect(api.calls.single.path, ApiEndpoints.notificationPreferences);
      expect(api.calls.single.data, containsPair('userId', 'user-1'));
      expect(
        api.calls.single.data,
        contains(NotificationType.budgetWarning.value),
      );
    });
  });
}
