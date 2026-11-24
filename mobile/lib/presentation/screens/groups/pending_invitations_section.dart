import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/data/models/group_invitation_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Pending group invitations, shown at the top of the Groups screen so they
/// can be answered even when the invitation notification never arrived.
///
/// Hidden while loading, when there are none, and when the list could not
/// be loaded (the groups below must stay usable either way).
class PendingInvitationsSection extends ConsumerWidget {
  const PendingInvitationsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitations =
        ref.watch(pendingInvitationsProvider).valueOrNull ?? const [];
    if (invitations.isEmpty) return const SizedBox.shrink();

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.45,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                invitations.length == 1
                    ? 'Pending invitation'
                    : 'Pending invitations (${invitations.length})',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(height: 8),
            for (final invitation in invitations)
              _InvitationCard(
                key: ValueKey(invitation.id),
                invitation: invitation,
              ),
          ],
        ),
      ),
    );
  }
}

class _InvitationCard extends ConsumerStatefulWidget {
  const _InvitationCard({super.key, required this.invitation});

  final GroupInvitationModel invitation;

  @override
  ConsumerState<_InvitationCard> createState() => _InvitationCardState();
}

class _InvitationCardState extends ConsumerState<_InvitationCard> {
  bool _processing = false;

  GroupInvitationModel get invitation => widget.invitation;

  /// Reloads everything an answered invitation changes. Uses the container
  /// because this card goes away as soon as the invitations reload.
  Future<void> _refreshAfterAnswer(ProviderContainer container) async {
    container.invalidate(pendingInvitationsProvider);
    container.invalidate(userGroupsProvider);
    container.invalidate(currentUserMembershipProvider(invitation.groupId));
    container.invalidate(groupByIdProvider(invitation.groupId));

    // The invitation's notification (if it arrived) is answered now too.
    // Best-effort: the invitation itself is already answered.
    try {
      final notifications = await container
          .read(notificationsProvider.future)
          .timeout(const Duration(seconds: 5));
      final repo = container.read(notificationRepositoryProvider);
      for (final n in notifications) {
        if (n.read || n.metadata?['invitationId'] != invitation.id) continue;
        await repo.markAsRead(n.id);
      }
    } catch (error) {
      debugPrint('[Invitations] Could not mark the notification read: $error');
    }
    container.invalidate(notificationsProvider);
  }

  Future<void> _accept() async {
    if (_processing) return;
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _processing = true);
    try {
      await ref
          .read(groupRepositoryProvider)
          .acceptInvitation(
            invitationId: invitation.id,
            userId: user.uid,
            userEmail: user.email ?? '',
            userName: user.displayName,
          );
      HapticFeedback.mediumImpact();
      messenger.showSnackBar(
        SnackBar(
          content: Text('You joined ${invitation.groupName}.'),
          backgroundColor: AppColors.success,
        ),
      );
      await _refreshAfterAnswer(container);
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            "Couldn't accept the invitation. ${apiErrorMessage(e)}",
          ),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _decline() async {
    if (_processing) return;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _processing = true);
    try {
      await ref
          .read(groupRepositoryProvider)
          .declineInvitation(invitationId: invitation.id);
      HapticFeedback.lightImpact();
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Invitation declined'),
          backgroundColor: AppColors.success,
        ),
      );
      await _refreshAfterAnswer(container);
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            "Couldn't decline the invitation. ${apiErrorMessage(e)}",
          ),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.mail_outline, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  invitation.groupName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${invitation.inviterLabel} invited you to join as '
            '${invitation.roleLabel}',
            style: TextStyle(
              fontSize: 13,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _processing ? null : _decline,
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _processing ? null : _accept,
                  child: _processing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Accept'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
