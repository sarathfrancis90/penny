import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Stream all notifications for current user (empty in guest mode).
final notificationsProvider = StreamProvider<List<NotificationModel>>((ref) {
  if (ref.watch(guestModeProvider)) return Stream.value(<NotificationModel>[]);
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(notificationRepositoryProvider).watchNotifications(user.uid);
});

/// Count of unread notifications.
final unreadCountProvider = Provider<int>((ref) {
  final notifications = ref.watch(notificationsProvider).valueOrNull ?? [];
  return notifications.where((n) => !n.read).length;
});
