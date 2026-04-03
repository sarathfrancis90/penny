import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/animated_list_item.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationsProvider);
    final unreadCount = ref.watch(unreadCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unreadCount > 0)
            TextButton(
              onPressed: () {
                final user = ref.read(currentUserProvider);
                if (user != null) {
                  ref.read(notificationRepositoryProvider).markAllAsRead(user.uid);
                  HapticFeedback.lightImpact();
                }
              },
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: notificationsAsync.when(
        data: (notifications) => notifications.isEmpty
            ? const _EmptyState()
            : _NotificationList(notifications: notifications),
        loading: () => const ShimmerLoadingList(),
        error: (e, _) => ErrorState(
          message: 'Could not load notifications',
          onRetry: () => ref.invalidate(notificationsProvider),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.notifications_none_outlined, size: 48,
                color: AppColors.textTertiary),
            SizedBox(height: 12),
            Text('No notifications',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary)),
            SizedBox(height: 4),
            Text("You're all caught up!",
                style: TextStyle(fontSize: 14, color: AppColors.textTertiary)),
          ],
        ),
      ),
    );
  }
}

class _NotificationList extends ConsumerWidget {
  const _NotificationList({required this.notifications});
  final List<NotificationModel> notifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(notificationsProvider),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: notifications.length,
        itemBuilder: (context, index) {
          final n = notifications[index];
          return AnimatedListItem(
            index: index,
            child: _NotificationTile(
              notification: n,
              onTap: () {
                if (!n.read) {
                  ref.read(notificationRepositoryProvider).markAsRead(n.id);
                }
              },
              onDismiss: () {
                ref.read(notificationRepositoryProvider).deleteNotification(n.id);
                HapticFeedback.lightImpact();
              },
            ),
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.onTap,
    required this.onDismiss,
  });

  final NotificationModel notification;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  Color get _priorityIndicator => switch (notification.priority) {
        'critical' => AppColors.error,
        'high' => AppColors.warning,
        _ => Colors.transparent,
      };

  @override
  Widget build(BuildContext context) {
    final icon = notification.icon ?? notification.defaultIcon;

    return Dismissible(
      key: Key(notification.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppColors.error,
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      onDismissed: (_) => onDismiss(),
      child: Semantics(
        button: true,
        label: '${notification.read ? '' : 'Unread, '}'
            '${notification.title}, '
            '${notification.body}, '
            '${notification.timeAgo}'
            '${notification.priority == 'critical' ? ', critical priority' : notification.priority == 'high' ? ', high priority' : ''}',
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: notification.read ? AppColors.background : AppColors.surface,
              border: Border(
                left: BorderSide(
                  color: _priorityIndicator,
                  width: _priorityIndicator == Colors.transparent ? 0 : 3,
                ),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Icon
                Text(icon, style: const TextStyle(fontSize: 24)),
                const SizedBox(width: 12),

                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              notification.title,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: notification.read
                                    ? FontWeight.w400
                                    : FontWeight.w600,
                              ),
                            ),
                          ),
                          Text(
                            notification.timeAgo,
                            style: const TextStyle(
                                fontSize: 12, color: AppColors.textTertiary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        notification.body,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.textSecondary),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (notification.actorName != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          notification.actorName!,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.textTertiary),
                        ),
                      ],
                    ],
                  ),
                ),

                // Unread dot
                if (!notification.read) ...[
                  const SizedBox(width: 8),
                  Semantics(
                    label: 'Unread',
                    child: Container(
                      width: 8, height: 8,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
