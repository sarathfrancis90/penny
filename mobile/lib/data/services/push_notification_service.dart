import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:uuid/uuid.dart';

class PushNotificationService {
  PushNotificationService({
    required ApiClient apiClient,
    FirebaseMessaging? messaging,
  }) : _api = apiClient,
       _messaging = messaging ?? FirebaseMessaging.instance;

  final ApiClient _api;
  final FirebaseMessaging _messaging;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _pendingNavigationUrl;
  final StreamController<String> _navigationController =
      StreamController<String>.broadcast();

  Stream<String> get navigationStream => _navigationController.stream;

  Future<void> initialize() async {
    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleMessageOpenedApp(initialMessage);
    }
  }

  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized;
  }

  Future<void> getAndStoreToken(String userId) async {
    final token = await _messaging.getToken();
    if (token == null) return;

    final deviceId = await _deviceId();
    await _registerToken(userId: userId, deviceId: deviceId, token: token);

    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((newToken) {
      unawaited(
        _registerToken(userId: userId, deviceId: deviceId, token: newToken),
      );
    });
  }

  Future<void> removeToken(String userId) async {
    final box = Hive.box('app_preferences');
    final deviceId = box.get('device_id') as String?;
    if (deviceId == null) return;
    await _api.delete(
      ApiEndpoints.pushToken(deviceId),
      data: {'userId': userId},
    );
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
  }

  Future<String> _deviceId() async {
    final box = Hive.box('app_preferences');
    String? deviceId = box.get('device_id') as String?;
    if (deviceId == null) {
      deviceId = const Uuid().v4();
      await box.put('device_id', deviceId);
    }
    return deviceId;
  }

  Future<void> _registerToken({
    required String userId,
    required String deviceId,
    required String token,
  }) async {
    await _api.put(
      ApiEndpoints.pushToken(deviceId),
      data: {
        'userId': userId,
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
      },
    );
  }

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;
    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(
        iOS: DarwinNotificationDetails(),
        android: AndroidNotificationDetails(
          'penny_default',
          'Penny Notifications',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: message.data['actionUrl'] as String?,
    );
  }

  void _handleMessageOpenedApp(RemoteMessage message) {
    final actionUrl = message.data['actionUrl'] as String?;
    if (actionUrl != null) {
      _pendingNavigationUrl = actionUrl;
      _navigationController.add(actionUrl);
    }
  }

  void _onNotificationTap(NotificationResponse response) {
    if (response.payload != null && response.payload!.isNotEmpty) {
      _pendingNavigationUrl = response.payload;
      _navigationController.add(response.payload!);
    }
  }

  String? consumePendingNavigation() {
    final url = _pendingNavigationUrl;
    _pendingNavigationUrl = null;
    return url;
  }

  void dispose() {
    unawaited(_tokenRefreshSubscription?.cancel());
    _navigationController.close();
  }
}
