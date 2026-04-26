import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/conversation_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Streams the user's active conversations, sorted with pinned first then by
/// most-recently updated. Bounded to keep the drawer snappy on large accounts;
/// search uses [searchAllConversationsProvider] for full coverage.
final conversationsListProvider =
    StreamProvider<List<ConversationModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref
      .watch(conversationRepositoryProvider)
      .watchConversations(user.uid)
      .map((conversations) {
    conversations.sort((a, b) {
      if (a.metadata.isPinned && !b.metadata.isPinned) return -1;
      if (!a.metadata.isPinned && b.metadata.isPinned) return 1;
      return b.updatedAt.compareTo(a.updatedAt);
    });
    return conversations;
  });
});

/// One-shot Firestore query that returns ALL active conversations for the
/// current user, used to search beyond the recent window streamed by
/// [conversationsListProvider]. The query parameter is the lowercased trimmed
/// search string (kept in the family key for natural cache invalidation).
final searchAllConversationsProvider =
    FutureProvider.family<List<ConversationModel>, String>((ref, query) async {
  if (query.isEmpty) return const [];
  final user = ref.watch(currentUserProvider);
  if (user == null) return const [];
  final snap = await FirebaseFirestore.instance
      .collection('conversations')
      .where('userId', isEqualTo: user.uid)
      .where('status', isEqualTo: 'active')
      .get();
  final all = snap.docs.map(ConversationModel.fromFirestore).toList();
  return all.where((c) {
    return c.title.toLowerCase().contains(query) ||
        c.lastMessagePreview.toLowerCase().contains(query);
  }).toList()
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
});

sealed class _DrawerItem {
  const _DrawerItem();
}

class _SectionHeaderItem extends _DrawerItem {
  const _SectionHeaderItem(this.label);
  final String label;
}

class _ConversationItem extends _DrawerItem {
  const _ConversationItem(this.conversation);
  final ConversationModel conversation;
}

/// Group conversations into sticky-section buckets, in the visual order
/// (Pinned, Today, Yesterday, This Week, This Month, Older). Uses
/// calendar-aware boundaries (year/month/day comparisons) so a 1am-yesterday
/// message doesn't show up under "Today" at 11pm today.
List<_DrawerItem> _groupConversations(
  List<ConversationModel> all,
  DateTime now,
) {
  final pinned = <ConversationModel>[];
  final today = <ConversationModel>[];
  final yesterday = <ConversationModel>[];
  final thisWeek = <ConversationModel>[];
  final thisMonth = <ConversationModel>[];
  final older = <ConversationModel>[];

  final today0 = DateTime(now.year, now.month, now.day);
  final yesterday0 = today0.subtract(const Duration(days: 1));
  final week0 = today0.subtract(const Duration(days: 7));
  final month0 = today0.subtract(const Duration(days: 30));

  for (final c in all) {
    if (c.metadata.isPinned) {
      pinned.add(c);
      continue;
    }
    final dt = c.updatedAt.toDate();
    if (!dt.isBefore(today0)) {
      today.add(c);
    } else if (!dt.isBefore(yesterday0)) {
      yesterday.add(c);
    } else if (!dt.isBefore(week0)) {
      thisWeek.add(c);
    } else if (!dt.isBefore(month0)) {
      thisMonth.add(c);
    } else {
      older.add(c);
    }
  }

  final out = <_DrawerItem>[];
  void addBucket(String label, List<ConversationModel> bucket) {
    if (bucket.isEmpty) return;
    out.add(_SectionHeaderItem(label));
    for (final c in bucket) {
      out.add(_ConversationItem(c));
    }
  }

  addBucket('Pinned', pinned);
  addBucket('Today', today);
  addBucket('Yesterday', yesterday);
  addBucket('This Week', thisWeek);
  addBucket('This Month', thisMonth);
  addBucket('Older', older);
  return out;
}

/// Slide-in drawer showing conversation history. Always opens via the AppBar
/// hamburger; also responds to a left-edge swipe (`drawerEdgeDragWidth` in
/// the host Scaffold).
class ConversationListDrawer extends ConsumerStatefulWidget {
  const ConversationListDrawer({
    super.key,
    required this.onSelectConversation,
    required this.onNewConversation,
  });

  final ValueChanged<String> onSelectConversation;
  final VoidCallback onNewConversation;

  @override
  ConsumerState<ConversationListDrawer> createState() =>
      _ConversationListDrawerState();
}

class _ConversationListDrawerState
    extends ConsumerState<ConversationListDrawer> {
  final _searchController = TextEditingController();
  String _query = '';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String raw) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() => _query = raw.trim().toLowerCase());
    });
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchController.clear();
    setState(() => _query = '');
  }

  @override
  Widget build(BuildContext context) {
    final isSearching = _query.isNotEmpty;
    final recentAsync = ref.watch(conversationsListProvider);
    final searchAsync = isSearching
        ? ref.watch(searchAllConversationsProvider(_query))
        : null;

    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
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
                      widget.onNewConversation();
                    },
                  ),
                ],
              ),
            ),

            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: TextField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search conversations',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: isSearching
                      ? IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          tooltip: 'Clear search',
                          onPressed: _clearSearch,
                        )
                      : null,
                  isDense: true,
                  filled: true,
                  fillColor: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(vertical: 0, horizontal: 8),
                ),
              ),
            ),

            const Divider(height: 1),

            // Body
            Expanded(
              child: isSearching
                  ? _buildSearchBody(searchAsync!)
                  : _buildBrowseBody(recentAsync),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBrowseBody(AsyncValue<List<ConversationModel>> async) {
    return async.when(
      data: (conversations) {
        if (conversations.isEmpty) return const _EmptyConversations();
        final items = _groupConversations(conversations, DateTime.now());
        return ListView.builder(
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];
            return switch (item) {
              _SectionHeaderItem() => _SectionHeader(label: item.label),
              _ConversationItem() => _ConversationTile(
                  conversation: item.conversation,
                  onTap: () {
                    Navigator.pop(context);
                    widget.onSelectConversation(item.conversation.id);
                  },
                ),
            };
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => Center(
        child: Text('Could not load conversations',
            style:
                TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ),
    );
  }

  Widget _buildSearchBody(AsyncValue<List<ConversationModel>> async) {
    return async.when(
      data: (results) {
        if (results.isEmpty) return _NoSearchResults(query: _query);
        return ListView.builder(
          itemCount: results.length,
          itemBuilder: (context, index) {
            final conv = results[index];
            return _ConversationTile(
              conversation: conv,
              onTap: () {
                Navigator.pop(context);
                widget.onSelectConversation(conv.id);
              },
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => Center(
        child: Text('Could not search conversations',
            style:
                TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
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
    final repo = ref.read(conversationRepositoryProvider);
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    final tile = Semantics(
      button: true,
      label: '${conversation.title}, '
          '${conversation.lastMessagePreview}, '
          '$timeAgo ago'
          '${conversation.metadata.isPinned ? ', pinned' : ''}',
      customSemanticsActions: {
        const CustomSemanticsAction(label: 'Archive'): () =>
            _archive(context, ref),
        const CustomSemanticsAction(label: 'More actions'): () =>
            _showActionsSheet(context, ref),
      },
      child: InkWell(
        onTap: onTap,
        onLongPress: () => _showActionsSheet(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.chat_bubble_outline,
                    size: 16,
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(width: 12),
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
                          fontSize: 12,
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Text(timeAgo,
                  style: TextStyle(
                      fontSize: 11, color: Theme.of(context).hintColor)),
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

    // Flutter's Drawer registers a horizontal-drag gesture detector for
    // drag-to-close. Without this wrapping GestureDetector, the Drawer wins
    // the gesture arena and a swipe on a row collapses the drawer instead of
    // archiving. Empty handlers + opaque hit-test register a competing
    // recognizer at the row level so the inner Dismissible wins.
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onHorizontalDragStart: (_) {},
      onHorizontalDragUpdate: (_) {},
      onHorizontalDragEnd: (_) {},
      child: Dismissible(
      key: ValueKey('conv-${conversation.id}'),
      direction: DismissDirection.endToStart,
      movementDuration:
          reduceMotion ? Duration.zero : const Duration(milliseconds: 200),
      background: Container(
        color: AppColors.warning,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.archive_outlined, color: Colors.white),
            SizedBox(width: 8),
            Text('Archive',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      confirmDismiss: (_) async {
        HapticFeedback.mediumImpact();
        return true;
      },
      onDismissed: (_) async {
        final convId = conversation.id;
        await repo.archiveConversation(convId);
        _resetChatIfActive(ref, convId);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Conversation archived'),
              behavior: SnackBarBehavior.floating,
              action: SnackBarAction(
                label: 'Undo',
                onPressed: () => repo.updateConversation(
                  convId,
                  {'status': 'active'},
                ),
              ),
            ),
          );
        }
      },
      child: tile,
      ),
    );
  }

  Future<void> _archive(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(conversationRepositoryProvider);
    final convId = conversation.id;
    await repo.archiveConversation(convId);
    _resetChatIfActive(ref, convId);
    HapticFeedback.lightImpact();
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Conversation archived'),
          behavior: SnackBarBehavior.floating,
          action: SnackBarAction(
            label: 'Undo',
            onPressed: () => repo.updateConversation(
              convId,
              {'status': 'active'},
            ),
          ),
        ),
      );
    }
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
              ListTile(
                leading: Icon(
                  Icons.push_pin,
                  color: isPinned
                      ? Theme.of(context).colorScheme.onSurfaceVariant
                      : AppColors.primary,
                ),
                title: Text(isPinned ? 'Unpin' : 'Pin'),
                onTap: () async {
                  Navigator.pop(ctx);
                  await repo.pinConversation(convId, !isPinned);
                  HapticFeedback.lightImpact();
                },
              ),
              ListTile(
                leading: const Icon(Icons.edit_outlined,
                    color: AppColors.primary),
                title: const Text('Rename'),
                onTap: () {
                  Navigator.pop(ctx);
                  _showRenameDialog(context, ref);
                },
              ),
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

class _EmptyConversations extends StatelessWidget {
  const _EmptyConversations();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurfaceVariant;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.chat_bubble_outline, size: 48, color: color),
            const SizedBox(height: 12),
            const Text(
              'No conversations yet',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            Text(
              'Start a new chat to see it here',
              style: TextStyle(fontSize: 13, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoSearchResults extends StatelessWidget {
  const _NoSearchResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurfaceVariant;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off, size: 48, color: color),
            const SizedBox(height: 12),
            Text(
              "No conversations match '$query'",
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}
