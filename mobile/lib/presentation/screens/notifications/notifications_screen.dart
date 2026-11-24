import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/router/app_links.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/animated_list_item.dart';
import 'package:penny_mobile/presentation/widgets/penny_empty_state.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';

/// Marks a notification as read and reloads the list so the unread badge
/// updates. Best-effort: a failure here never stops what the user was doing
/// (opening the notification, accepting an invitation).
Future<void> _markReadBestEffort(
  ProviderContainer container,
  String notificationId,
) async {
  try {
    await container
        .read(notificationRepositoryProvider)
        .markAsRead(notificationId);
  } catch (error) {
    debugPrint('[Notifications] Could not mark as read: $error');
  }
  container.invalidate(notificationsProvider);
}

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
              onPressed: () async {
                final user = ref.read(currentUserProvider);
                if (user != null) {
                  final container = ProviderScope.containerOf(
                    context,
                    listen: false,
                  );
                  HapticFeedback.lightImpact();
                  try {
                    await container
                        .read(notificationRepositoryProvider)
                        .markAllAsRead(user.uid);
                  } catch (error) {
                    debugPrint('[Notifications] Mark all read failed: $error');
                  }
                  container.invalidate(notificationsProvider);
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
    return const PennyEmptyState(
      lottieAsset: 'assets/lottie/empty_box.json',
      title: 'No notifications',
      subtitle:
          "You're all caught up!\nBudget alerts and group activity will appear here.",
    );
  }
}

class _NotificationList extends ConsumerWidget {
  const _NotificationList({required this.notifications});
  final List<NotificationModel> notifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(notificationsProvider);
        HapticFeedback.lightImpact();
      },
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: notifications.length,
        itemBuilder: (context, index) {
          final n = notifications[index];
          return AnimatedListItem(
            index: index,
            child: _NotificationTile(
              notification: n,
              onTap: () => _handleNotificationTap(context, ref, n),
              onDismiss: () {
                final container = ProviderScope.containerOf(
                  context,
                  listen: false,
                );
                container
                    .read(notificationRepositoryProvider)
                    .deleteNotification(n.id)
                    .then<void>((_) {}, onError: (Object _) {})
                    .whenComplete(
                      () => container.invalidate(notificationsProvider),
                    );
                HapticFeedback.lightImpact();
              },
            ),
          );
        },
      ),
    );
  }

  Future<void> _handleNotificationTap(
    BuildContext context,
    WidgetRef ref,
    NotificationModel notification,
  ) async {
    if (!notification.read) {
      await _markReadBestEffort(
        ProviderScope.containerOf(context, listen: false),
        notification.id,
      );
    }

    HapticFeedback.selectionClick();
    final route = _routeFor(notification);
    if (!context.mounted) return;

    if (route != null) {
      openAppLink(context, route);
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          notification.read ? 'Notification opened' : 'Marked as read',
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String? _routeFor(NotificationModel notification) {
    if (notification.type == 'group_invitation') {
      return linkForNotification(type: notification.type, url: '/groups');
    }
    final metadata = notification.metadata ?? const <String, dynamic>{};
    final actionUrl = notification.actionUrl;
    if (actionUrl != null) {
      final uri = Uri.tryParse(actionUrl);
      final path = uri?.path ?? actionUrl;
      if (_allowedDirectRoutes.contains(path) || path.startsWith('/groups/')) {
        return path;
      }
    }

    final groupId =
        notification.groupId ??
        metadata['groupId'] as String? ??
        (notification.relatedType == 'group' ? notification.relatedId : null);
    if (groupId != null && groupId.isNotEmpty) return '/groups/$groupId';

    final relatedType =
        notification.relatedType ?? metadata['relatedType'] as String?;
    return switch (relatedType ?? notification.category) {
      'budget' || 'budgets' => '/budgets',
      'income' => '/income',
      'savings' || 'saving' => '/savings',
      'expense' || 'expenses' => '/dashboard',
      'settings' => '/settings/notifications',
      _ => switch (notification.type) {
        'budget_warning' ||
        'budget_exceeded' ||
        'budget_critical' => '/budgets',
        'income_reminder' || 'income_detected' => '/income',
        'savings_goal' || 'savings_milestone' => '/savings',
        'group_expense' || 'group_invitation' || 'member_joined' => '/groups',
        _ => null,
      },
    };
  }

  static const _allowedDirectRoutes = {
    '/',
    '/dashboard',
    '/finances',
    '/groups',
    '/profile',
    '/budgets',
    '/income',
    '/savings',
    '/settings',
    '/settings/notifications',
  };
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

      // Older invitation notifications carry only the invitation id; the
      // server accepts either and checks the signed-in email itself.
      final token = notification.metadata?['invitationToken'] as String?;
      final invitationId = notification.metadata?['invitationId'] as String?;
      final hasToken = token != null && token.isNotEmpty;
      if (!hasToken && (invitationId == null || invitationId.isEmpty)) {
        throw StateError('This invitation can no longer be opened.');
      }
      final container = ProviderScope.containerOf(context, listen: false);

      final result = await ref
          .read(groupRepositoryProvider)
          .acceptInvitation(
            token: hasToken ? token : null,
            invitationId: hasToken ? null : invitationId,
            userId: user.uid,
            userEmail: user.email ?? '',
            userName: user.displayName,
          );

      final acceptedGroupId =
          result['groupId'] as String? ??
          notification.metadata?['groupId'] as String?;
      // The new group must show up without a manual refresh.
      container.invalidate(userGroupsProvider);
      if (acceptedGroupId != null) {
        container.invalidate(currentUserMembershipProvider(acceptedGroupId));
        container.invalidate(groupByIdProvider(acceptedGroupId));
      }
      await _markReadBestEffort(container, notification.id);

      HapticFeedback.mediumImpact();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Invitation accepted! You joined the group.'),
            backgroundColor: AppColors.success,
          ),
        );

        // Navigate to the group
        final groupId =
            result['groupId'] as String? ??
            notification.metadata?['groupId'] as String?;
        if (groupId != null) {
          context.push('/groups/$groupId');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Couldn't accept the invitation. ${apiErrorMessage(e)}",
            ),
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
      final invitationId = notification.metadata?['invitationId'] as String?;
      if (invitationId == null) {
        throw Exception('Missing invitation ID');
      }

      await ref
          .read(groupRepositoryProvider)
          .declineInvitation(invitationId: invitationId);

      if (!mounted) return;
      await _markReadBestEffort(
        ProviderScope.containerOf(context, listen: false),
        notification.id,
      );

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
            content: Text(
              "Couldn't decline the invitation. ${apiErrorMessage(e)}",
            ),
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
        label:
            '${notification.read ? '' : 'Unread, '}'
            '${notification.title}, '
            '${notification.body}, '
            '${notification.timeAgo}'
            '${notification.priority == 'critical'
                ? ', critical priority'
                : notification.priority == 'high'
                ? ', high priority'
                : ''}',
        child: InkWell(
          onTap: widget.onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: notification.read
                  ? Theme.of(context).scaffoldBackgroundColor
                  : Theme.of(context).cardColor,
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
                              fontSize: 12,
                              color: Theme.of(context).hintColor,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        notification.body,
                        style: TextStyle(
                          fontSize: 13,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (notification.actorName != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          notification.actorName!,
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).hintColor,
                          ),
                        ),
                      ],

                      // Group invitation action buttons
                      if (_isGroupInvitation) ...[
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _isProcessing
                                    ? null
                                    : _declineInvitation,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                  side: BorderSide(
                                    color: Theme.of(context).dividerColor,
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                ),
                                child: _isProcessing
                                    ? const SizedBox(
                                        height: 16,
                                        width: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Text(
                                        'Decline',
                                        style: TextStyle(fontSize: 13),
                                      ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: _isProcessing
                                    ? null
                                    : _acceptInvitation,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                ),
                                child: _isProcessing
                                    ? const SizedBox(
                                        height: 16,
                                        width: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text(
                                        'Accept',
                                        style: TextStyle(fontSize: 13),
                                      ),
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
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
                PopupMenuButton<String>(
                  tooltip: 'Notification actions',
                  onSelected: (value) {
                    if (value == 'delete') widget.onDismiss();
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(Icons.delete_outline, color: AppColors.error),
                          SizedBox(width: 8),
                          Text('Delete'),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
