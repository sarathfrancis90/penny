import 'package:penny_mobile/core/constants/notification_types.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class NotificationPreferencesRepository {
  NotificationPreferencesRepository({required ApiClient apiClient})
    : _api = apiClient;

  final ApiClient _api;

  Stream<NotificationSettingsModel> watchSettings(String userId) {
    return Stream.fromFuture(_getSettings(userId));
  }

  Future<NotificationSettingsModel> _getSettings(String userId) async {
    final response = await _api.get(
      ApiEndpoints.notificationSettings,
      queryParameters: {'userId': userId},
    );
    return NotificationSettingsModel.fromFirestore(
      apiDocument(mapValue(responseMap(response)['settings'])),
    );
  }

  Stream<NotificationPreferencesModel> watchPreferences(String userId) {
    return Stream.fromFuture(_getPreferences(userId));
  }

  Future<NotificationPreferencesModel> _getPreferences(String userId) async {
    final response = await _api.get(
      ApiEndpoints.notificationPreferences,
      queryParameters: {'userId': userId},
    );
    final preferences = mapValue(responseMap(response)['preferences']);
    if (preferences.isEmpty) return NotificationPreferencesModel.defaults();
    return NotificationPreferencesModel.fromFirestore(apiDocument(preferences));
  }

  Future<void> updateSettings(
    String userId,
    Map<String, dynamic> updates,
  ) async {
    await _api.put(
      ApiEndpoints.notificationSettings,
      data: {'userId': userId, ...updates},
    );
  }

  Future<void> updateTypePreference(
    String userId,
    NotificationType type,
    NotificationTypePreference pref,
  ) async {
    await _api.put(
      ApiEndpoints.notificationPreferences,
      data: {'userId': userId, type.value: pref.toMap()},
    );
  }

  Future<void> initializeDefaults(String userId) async {
    await updateSettings(userId, const NotificationSettingsModel().toMap());
    await _api.put(
      ApiEndpoints.notificationPreferences,
      data: {
        'userId': userId,
        ...NotificationPreferencesModel.defaults().toMap(),
      },
    );
  }
}
