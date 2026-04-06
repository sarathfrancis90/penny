import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/core/constants/notification_types.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';

class NotificationPreferencesRepository {
  NotificationPreferencesRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Stream the global notification settings for a user.
  Stream<NotificationSettingsModel> watchSettings(String userId) {
    return _db
        .collection('userNotificationSettings')
        .doc(userId)
        .snapshots()
        .map((snap) {
      if (!snap.exists) return const NotificationSettingsModel();
      return NotificationSettingsModel.fromFirestore(snap);
    });
  }

  /// Stream the per-type notification preferences for a user.
  Stream<NotificationPreferencesModel> watchPreferences(String userId) {
    return _db
        .collection('users')
        .doc(userId)
        .collection('notificationPreferences')
        .doc('default')
        .snapshots()
        .map((snap) {
      if (!snap.exists) return NotificationPreferencesModel.defaults();
      return NotificationPreferencesModel.fromFirestore(snap);
    });
  }

  /// Update global notification settings (globalMute, quiet hours).
  Future<void> updateSettings(
      String userId, Map<String, dynamic> updates) async {
    updates['updatedAt'] = FieldValue.serverTimestamp();
    await _db
        .collection('userNotificationSettings')
        .doc(userId)
        .set(updates, SetOptions(merge: true));
  }

  /// Update a single notification type preference.
  Future<void> updateTypePreference(
    String userId,
    NotificationType type,
    NotificationTypePreference pref,
  ) async {
    await _db
        .collection('users')
        .doc(userId)
        .collection('notificationPreferences')
        .doc('default')
        .set({
      type.value: pref.toMap(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Initialize default values for a new user if documents don't exist yet.
  Future<void> initializeDefaults(String userId) async {
    final settingsRef =
        _db.collection('userNotificationSettings').doc(userId);
    final settingsSnap = await settingsRef.get();
    if (!settingsSnap.exists) {
      await settingsRef.set(const NotificationSettingsModel().toMap());
    }

    final prefsRef = _db
        .collection('users')
        .doc(userId)
        .collection('notificationPreferences')
        .doc('default');
    final prefsSnap = await prefsRef.get();
    if (!prefsSnap.exists) {
      final defaults = NotificationPreferencesModel.defaults();
      await prefsRef.set({
        ...defaults.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
  }
}
