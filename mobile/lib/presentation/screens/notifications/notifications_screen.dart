import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
    return Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.notifications_none_outlined, size: 48,
                color: Theme.of(context).hintColor),
            SizedBox(height: 12),
            Text('No notifications',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
            SizedBox(height: 4),
            Text("You're all caught up!",
                style: TextStyle(fontSize: 14, color: Theme.of(context).hintColor)),
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

class _NotificationTile extends ConsumerStatefulWidget {
  const _NotificationTile({
    required this.notification,
    required this.onTap,
    required this.onDismiss,
  });

  final NotificationModel notification;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  ConsumerState<_NotificationTile> createState() => _NotificationTileState();
}

class _NotificationTileState extends ConsumerState<_NotificationTile> {
  bool _isProcessing = false;

  NotificationModel get notification => widget.notification;

  Color get _priorityIndicator => switch (notification.priority) {
        'critical' => AppColors.error,
        'high' => AppColors.warning,
        _ => Colors.transparent,
      };

  bool get _isGroupInvitation =>
      notification.type == 'group_invitation' && !notification.read;

  Future<void> _acceptInvitation() async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final user = ref.read(currentUserProvider);
      if (user == null) return;

      final token = notification.metadata?['invitationToken'] as String?;
      if (token == null) {
        throw Exception('Missing invitation token');
      }

      final result =
          await ref.read(groupRepositoryProvider).acceptInvitation(
                token: token,
                userId: user.uid,
                userEmail: user.email ?? '',
                userName: user.displayName,
              );

      await ref
          .read(notificationRepositoryProvider)
          .markAsRead(notification.id);

      HapticFeedback.mediumImpact();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Invitation accepted! You joined the group.'),
            backgroundColor: AppColors.success,
          ),
        );

        // Navigate to the group
        final groupId = result['groupId'] as String? ??
            notification.metadata?['groupId'] as String?;
        if (groupId != null) {
          context.push('/groups/$groupId');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to accept invitation: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _declineInvitation() async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final invitationId =
          notification.metadata?['invitationId'] as String?;
      if (invitationId == null) {
        throw Exception('Missing invitation ID');
      }

      await ref
          .read(groupRepositoryProvider)
          .declineInvitation(invitationId: invitationId);

      await ref
          .read(notificationRepositoryProvider)
          .markAsRead(notification.id);

      HapticFeedback.lightImpact();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Invitation declined'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to decline invitation: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

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
      onDismissed: (_) => widget.onDismiss(),
      child: Semantics(
        button: true,
        label: '${notification.read ? '' : 'Unread, '}'
            '${notification.title}, '
            '${notification.body}, '
            '${notification.timeAgo}'
            '${notification.priority == 'critical' ? ', critical priority' : notification.priority == 'high' ? ', high priority' : ''}',
        child: InkWell(
          onTap: widget.onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: notification.read ? Theme.of(context).scaffoldBackgroundColor : Theme.of(context).cardColor,
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
                            style: TextStyle(
                                fontSize: 12, color: Theme.of(context).hintColor),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        notification.body,
                        style: TextStyle(
                            fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (notification.actorName != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          notification.actorName!,
                          style: TextStyle(
                              fontSize: 12, color: Theme.of(context).hintColor),
                        ),
                      ],

                      // Group invitation action buttons
                      if (_isGroupInvitation) ...[
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _isProcessing ? null : _declineInvitation,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Theme.of(context).colorScheme.onSurfaceVariant,
                                  side: BorderSide(color: Theme.of(context).dividerColor),
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                ),
                                child: _isProcessing
                                    ? const SizedBox(
                                        height: 16, width: 16,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : const Text('Decline',
                                        style: TextStyle(fontSize: 13)),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: _isProcessing ? null : _acceptInvitation,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                ),
                                child: _isProcessing
                                    ? const SizedBox(
                                        height: 16, width: 16,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white))
                                    : const Text('Accept',
                                        style: TextStyle(fontSize: 13)),
                              ),
                            ),
                          ],
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
