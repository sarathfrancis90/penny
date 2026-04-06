import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/conversation_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Provider for streaming conversation list, sorted with pinned first.
final conversationsListProvider =
    StreamProvider<List<ConversationModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref
      .watch(conversationRepositoryProvider)
      .watchConversations(user.uid)
      .map((conversations) {
    conversations.sort((a, b) {
      // Pinned conversations first
      if (a.metadata.isPinned && !b.metadata.isPinned) return -1;
      if (!a.metadata.isPinned && b.metadata.isPinned) return 1;
      // Then by updatedAt descending
      return b.updatedAt.compareTo(a.updatedAt);
    });
    return conversations;
  });
});

/// Slide-in drawer showing conversation history.
class ConversationListDrawer extends ConsumerWidget {
  const ConversationListDrawer({
    super.key,
    required this.onSelectConversation,
    required this.onNewConversation,
  });

  final ValueChanged<String> onSelectConversation;
  final VoidCallback onNewConversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conversationsAsync = ref.watch(conversationsListProvider);

    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Conversations',
                      style: TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w600),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.add_comment_outlined,
                        color: AppColors.primary),
                    tooltip: 'New conversation',
                    onPressed: () {
                      Navigator.pop(context);
                      onNewConversation();
                    },
                  ),
                ],
              ),
            ),

            const Divider(height: 1),

            // Conversation list
            Expanded(
              child: conversationsAsync.when(
                data: (conversations) {
                  if (conversations.isEmpty) {
                    return Center(
                      child: Text(
                        'No conversations yet',
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: conversations.length,
                    itemBuilder: (context, index) {
                      final conv = conversations[index];
                      return _ConversationTile(
                        conversation: conv,
                        onTap: () {
                          Navigator.pop(context);
                          onSelectConversation(conv.id);
                        },
                      );
                    },
                  );
                },
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (_, __) => Center(
                  child: Text('Could not load conversations',
                      style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConversationTile extends ConsumerWidget {
  const _ConversationTile({
    required this.conversation,
    required this.onTap,
  });

  final ConversationModel conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timeAgo = _formatTimeAgo(conversation.updatedAt.toDate());

    return Semantics(
      button: true,
      label: '${conversation.title}, '
          '${conversation.lastMessagePreview}, '
          '$timeAgo ago'
          '${conversation.metadata.isPinned ? ', pinned' : ''}',
      child: InkWell(
        onTap: onTap,
        onLongPress: () => _showActionsSheet(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              // Chat icon
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.chat_bubble_outline,
                    size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(width: 12),

              // Title + preview
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.title,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w500),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      conversation.lastMessagePreview,
                      style: TextStyle(
                          fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),

              // Time
              Text(timeAgo,
                  style: TextStyle(
                      fontSize: 11, color: Theme.of(context).hintColor)),

              // Pin indicator
              if (conversation.metadata.isPinned)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child:
                      Icon(Icons.push_pin, size: 12, color: AppColors.primary),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showActionsSheet(BuildContext context, WidgetRef ref) {
    HapticFeedback.mediumImpact();
    final isPinned = conversation.metadata.isPinned;
    final repo = ref.read(conversationRepositoryProvider);
    final convId = conversation.id;

    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Pin / Unpin
              ListTile(
                leading: Icon(
                  Icons.push_pin,
                  color: isPinned ? Theme.of(context).colorScheme.onSurfaceVariant : AppColors.primary,
                ),
                title: Text(isPinned ? 'Unpin' : 'Pin'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await repo.pinConversation(convId, !isPinned);
                  HapticFeedback.lightImpact();
                },
              ),
              // Rename
              ListTile(
                leading: const Icon(Icons.edit_outlined,
                    color: AppColors.primary),
                title: const Text('Rename'),
                onTap: () {
                  Navigator.pop(ctx);
                  _showRenameDialog(context, ref);
                },
              ),
              // Archive
              ListTile(
                leading: Icon(Icons.archive_outlined,
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
                title: const Text('Archive'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await repo.archiveConversation(convId);
                  _resetChatIfActive(ref, convId);
                  HapticFeedback.lightImpact();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Conversation archived'),
                        backgroundColor: AppColors.success,
                      ),
                    );
                  }
                },
              ),
              // Delete
              ListTile(
                leading: const Icon(Icons.delete_outline,
                    color: AppColors.error),
                title: const Text('Delete',
                    style: TextStyle(color: AppColors.error)),
                onTap: () {
                  Navigator.pop(ctx);
                  _showDeleteConfirmation(context, ref);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showRenameDialog(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController(text: conversation.title);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename Conversation'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Conversation title'),
          textCapitalization: TextCapitalization.sentences,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              final newTitle = controller.text.trim();
              if (newTitle.isNotEmpty && newTitle != conversation.title) {
                await ref
                    .read(conversationRepositoryProvider)
                    .renameConversation(conversation.id, newTitle);
                HapticFeedback.lightImpact();
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Conversation?'),
        content: const Text(
          'This will permanently delete this conversation and all its messages. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ref
                    .read(conversationRepositoryProvider)
                    .deleteConversation(conversation.id);
                _resetChatIfActive(ref, conversation.id);
                HapticFeedback.mediumImpact();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Conversation deleted'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Failed to delete: $e'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _resetChatIfActive(WidgetRef ref, String convId) {
    final chatState = ref.read(chatProvider);
    if (chatState.conversationId == convId) {
      ref.read(chatProvider.notifier).newConversation();
    }
  }

  String _formatTimeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${(diff.inDays / 7).floor()}w';
  }
}
