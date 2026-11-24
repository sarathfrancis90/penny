import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';
import 'package:penny_mobile/data/repositories/notification_preferences_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

final notificationPreferencesRepoProvider =
    Provider<NotificationPreferencesRepository>((ref) {
      return NotificationPreferencesRepository(
        apiClient: ref.watch(apiClientProvider),
      );
    });

/// Stream the global notification settings (mute, quiet hours) for the
/// current user.
final notificationSettingsProvider =
    StreamProvider.autoDispose<NotificationSettingsModel>((ref) {
      keepForCurrentSession(ref);
      final user = ref.watch(currentUserProvider);
      if (user == null) return const Stream.empty();
      return ref
          .watch(notificationPreferencesRepoProvider)
          .watchSettings(user.uid);
    });

/// Stream the per-type notification preferences for the current user.
final notificationTypePrefsProvider =
    StreamProvider.autoDispose<NotificationPreferencesModel>((ref) {
      keepForCurrentSession(ref);
      final user = ref.watch(currentUserProvider);
      if (user == null) return const Stream.empty();
      return ref
          .watch(notificationPreferencesRepoProvider)
          .watchPreferences(user.uid);
    });
