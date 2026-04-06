import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/core/constants/notification_types.dart';

/// Preference for a single notification type (e.g. budget_warning).
class NotificationTypePreference {
  const NotificationTypePreference({
    this.inApp = true,
    this.push = true,
    this.frequency = 'realtime',
  });

  final bool inApp;
  final bool push;

  /// One of: 'realtime', 'hourly', 'daily', 'weekly', 'never'
  final String frequency;

  factory NotificationTypePreference.fromMap(Map<String, dynamic> map) {
    return NotificationTypePreference(
      inApp: map['inApp'] as bool? ?? true,
      push: map['push'] as bool? ?? true,
      frequency: map['frequency'] as String? ?? 'realtime',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'inApp': inApp,
      'push': push,
      'frequency': frequency,
    };
  }

  NotificationTypePreference copyWith({
    bool? inApp,
    bool? push,
    String? frequency,
  }) {
    return NotificationTypePreference(
      inApp: inApp ?? this.inApp,
      push: push ?? this.push,
      frequency: frequency ?? this.frequency,
    );
  }
}

/// All per-type notification preferences, keyed by NotificationType.value.
class NotificationPreferencesModel {
  const NotificationPreferencesModel({required this.types});

  final Map<String, NotificationTypePreference> types;

  factory NotificationPreferencesModel.fromFirestore(
      DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    final typesMap = <String, NotificationTypePreference>{};

    for (final entry in data.entries) {
      if (entry.key == 'updatedAt') continue;
      if (entry.value is Map<String, dynamic>) {
        typesMap[entry.key] =
            NotificationTypePreference.fromMap(entry.value as Map<String, dynamic>);
      }
    }
    return NotificationPreferencesModel(types: typesMap);
  }

  /// Creates a model with default preferences for all known types.
  factory NotificationPreferencesModel.defaults() {
    final typesMap = <String, NotificationTypePreference>{};
    for (final type in NotificationType.values) {
      typesMap[type.value] = const NotificationTypePreference();
    }
    return NotificationPreferencesModel(types: typesMap);
  }

  Map<String, dynamic> toMap() {
    return types.map((key, pref) => MapEntry(key, pref.toMap()));
  }

  /// Get the preference for a given type, falling back to defaults.
  NotificationTypePreference forType(NotificationType type) {
    return types[type.value] ?? const NotificationTypePreference();
  }
}

/// Global notification settings (mute, quiet hours).
class NotificationSettingsModel {
  const NotificationSettingsModel({
    this.globalMute = false,
    this.quietHoursStart = '22:00',
    this.quietHoursEnd = '08:00',
    this.updatedAt,
  });

  final bool globalMute;
  final String quietHoursStart;
  final String quietHoursEnd;
  final Timestamp? updatedAt;

  factory NotificationSettingsModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return NotificationSettingsModel(
      globalMute: data['globalMute'] as bool? ?? false,
      quietHoursStart: data['quietHoursStart'] as String? ?? '22:00',
      quietHoursEnd: data['quietHoursEnd'] as String? ?? '08:00',
      updatedAt: data['updatedAt'] as Timestamp?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'globalMute': globalMute,
      'quietHoursStart': quietHoursStart,
      'quietHoursEnd': quietHoursEnd,
      'updatedAt': FieldValue.serverTimestamp(),
    };
  }

  NotificationSettingsModel copyWith({
    bool? globalMute,
    String? quietHoursStart,
    String? quietHoursEnd,
  }) {
    return NotificationSettingsModel(
      globalMute: globalMute ?? this.globalMute,
      quietHoursStart: quietHoursStart ?? this.quietHoursStart,
      quietHoursEnd: quietHoursEnd ?? this.quietHoursEnd,
      updatedAt: updatedAt,
    );
  }
}
