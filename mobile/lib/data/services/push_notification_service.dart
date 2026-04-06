import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

class PushNotificationService {
  PushNotificationService({
    FirebaseMessaging? messaging,
    FirebaseFirestore? firestore,
  })  : _messaging = messaging ?? FirebaseMessaging.instance,
        _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseMessaging _messaging;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final FirebaseFirestore _db;

  String? _pendingNavigationUrl;

  Future<void> initialize() async {
    // Initialize local notifications for foreground display
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      const InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      ),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // Listen for foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Listen for notification taps (app in background)
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    // Check for initial message (app launched from notification)
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

    // Get or create device ID
    final box = Hive.box('app_preferences');
    String? deviceId = box.get('device_id') as String?;
    if (deviceId == null) {
      deviceId = const Uuid().v4();
      await box.put('device_id', deviceId);
    }

    final platform = Platform.isIOS ? 'ios' : 'android';

    await _db.collection('users').doc(userId).set({
      'fcmTokens': {
        deviceId: {
          'token': token,
          'platform': platform,
          'createdAt': FieldValue.serverTimestamp(),
          'lastRefreshed': FieldValue.serverTimestamp(),
        }
      }
    }, SetOptions(merge: true));

    // Listen for token refresh
    _messaging.onTokenRefresh.listen((newToken) async {
      await _db.collection('users').doc(userId).set({
        'fcmTokens': {
          deviceId: {
            'token': newToken,
            'lastRefreshed': FieldValue.serverTimestamp(),
          }
        }
      }, SetOptions(merge: true));
    });
  }

  Future<void> removeToken(String userId) async {
    final box = Hive.box('app_preferences');
    final deviceId = box.get('device_id') as String?;
    if (deviceId == null) return;
    await _db.collection('users').doc(userId).update({
      'fcmTokens.$deviceId': FieldValue.delete(),
    });
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
    // Navigation will be handled by the app's router.
    // Store the action URL for the app to pick up.
    final actionUrl = message.data['actionUrl'] as String?;
    if (actionUrl != null) {
      _pendingNavigationUrl = actionUrl;
    }
  }

  void _onNotificationTap(NotificationResponse response) {
    if (response.payload != null) {
      _pendingNavigationUrl = response.payload;
    }
  }

  /// Returns and clears any pending navigation URL from a notification tap.
  String? consumePendingNavigation() {
    final url = _pendingNavigationUrl;
    _pendingNavigationUrl = null;
    return url;
  }
}
