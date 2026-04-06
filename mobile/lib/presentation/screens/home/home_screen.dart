import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/widgets/chat_bubble.dart';
import 'package:penny_mobile/presentation/widgets/expense_card.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();
  final _picker = ImagePicker();
  final _saveTrigger = ValueNotifier<VoidCallback?>(null);
  final _savingNotifier = ValueNotifier<bool>(false);

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    _saveTrigger.dispose();
    _savingNotifier.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    _controller.clear();
    _focusNode.requestFocus();
    _scrollToBottom();

    await ref.read(chatProvider.notifier).sendMessage(text);
    _scrollToBottom();
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1200,
      maxHeight: 1200,
      imageQuality: 85,
    );
    if (picked == null) return;

    _scrollToBottom();
    await ref.read(chatProvider.notifier).analyzeImage(File(picked.path));
    _scrollToBottom();
  }

  void _showImageSourcePicker() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined),
                title: const Text('Take Photo'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from Gallery'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.gallery);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Clear pending expenses after save or dismiss.
  void _onExpenseSaved() {
    ref.read(chatProvider.notifier).clearPendingExpenses();
  }

  void _onExpenseDismissed() {
    ref.read(chatProvider.notifier).clearPendingExpenses();
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatProvider);
    final conversationId = chatState.conversationId;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Penny',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_comment_outlined),
            tooltip: 'New Chat',
            onPressed: () => ref.read(chatProvider.notifier).newConversation(),
          ),
          _NotificationBell(),
        ],
      ),
      body: Column(
        children: [
          // Messages area
          Expanded(
            child: conversationId == null
                ? _EmptyState(onSuggestionTap: (text) {
                    _controller.text = text;
                    _sendMessage();
                  })
                : _MessageList(
                    conversationId: conversationId,
                    scrollController: _scrollController,
                  ),
          ),

          // Loading / Analyzing indicator
          if (chatState.isLoading || chatState.isAnalyzing)
            Semantics(
              liveRegion: true,
              label: chatState.isAnalyzing
                  ? 'Analyzing expense'
                  : 'Thinking',
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      chatState.isAnalyzing
                          ? 'Analyzing expense...'
                          : 'Thinking...',
                      style: TextStyle(
                        fontSize: 13,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Error
          if (chatState.error != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Text(
                chatState.error!,
                style: const TextStyle(fontSize: 13, color: AppColors.error),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),

          // Pending expense panel + action bar, OR input bar
          if (chatState.pendingExpenses != null) ...[
            _PendingExpensePanel(
              pendingExpenses: chatState.pendingExpenses!,
              receiptUrl: chatState.receiptUrl,
              onExpenseSaved: _onExpenseSaved,
              onExpenseDismissed: _onExpenseDismissed,
              saveTrigger: _saveTrigger,
              savingNotifier: _savingNotifier,
            ),
            _ActionBar(
              saveTrigger: _saveTrigger,
              savingNotifier: _savingNotifier,
              onCancel: _onExpenseDismissed,
            ),
          ] else
            _InputBar(
              controller: _controller,
              focusNode: _focusNode,
              onSend: _sendMessage,
              onCamera: _showImageSourcePicker,
              isLoading: chatState.isLoading || chatState.isAnalyzing,
            ),
        ],
      ),
    );
  }
}

/// Persistent bottom panel that slides up when there are pending expenses.
/// Contains a scrollable form area. Action buttons live in [_ActionBar].
class _PendingExpensePanel extends StatelessWidget {
  const _PendingExpensePanel({
    required this.pendingExpenses,
    this.receiptUrl,
    this.onExpenseSaved,
    this.onExpenseDismissed,
    this.saveTrigger,
    this.savingNotifier,
  });

  final AnalyzeExpenseResult pendingExpenses;
  final String? receiptUrl;
  final VoidCallback? onExpenseSaved;
  final VoidCallback? onExpenseDismissed;
  final ValueNotifier<VoidCallback?>? saveTrigger;
  final ValueNotifier<bool>? savingNotifier;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxHeight = MediaQuery.of(context).size.height * 0.55;
    final isMultiple = pendingExpenses.isMultiple;

    return AnimatedSize(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      alignment: Alignment.bottomCenter,
      child: Container(
        constraints: BoxConstraints(maxHeight: maxHeight),
        decoration: BoxDecoration(
          color: theme.cardColor,
          border: Border(
            top: BorderSide(
              color: AppColors.primary.withValues(alpha: 0.2),
              width: 1,
            ),
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header for multi-expense
              if (isMultiple)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    '${pendingExpenses.expenses.length} expenses detected',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ),

              for (var i = 0; i < pendingExpenses.expenses.length; i++) ...[
                if (i > 0)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Divider(
                      height: 1,
                      color: theme.dividerColor,
                    ),
                  ),
                ExpenseCard(
                  expense: pendingExpenses.expenses[i],
                  receiptUrl: receiptUrl,
                  onSaved: onExpenseSaved,
                  onDismiss: onExpenseDismissed,
                  saveTrigger: saveTrigger,
                  savingNotifier: savingNotifier,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Bottom action bar shown when a pending expense is being reviewed.
/// Replaces the [_InputBar] so the user sees Cancel / Confirm & Save.
class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.saveTrigger,
    required this.savingNotifier,
    required this.onCancel,
  });

  final ValueNotifier<VoidCallback?> saveTrigger;
  final ValueNotifier<bool> savingNotifier;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(
          top: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: SafeArea(
        top: false,
        child: ValueListenableBuilder<bool>(
          valueListenable: savingNotifier,
          builder: (context, saving, _) {
            return Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: saving ? null : onCancel,
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: saving ? null : () => saveTrigger.value?.call(),
                    icon: saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('Confirm & Save'),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onSuggestionTap});

  final ValueChanged<String> onSuggestionTap;

  @override
  Widget build(BuildContext context) {
    final suggestions = [
      'Lunch at Tim Hortons, \$14.50',
      'Uber ride \$22.00',
      'Office supplies at Staples \$45',
      'How much did I spend this month?',
    ];

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.chat_bubble_outline,
              size: 48,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 16),
            Text(
              'Track an expense',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Describe an expense, upload a receipt,\nor ask about your spending',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: suggestions.map((s) {
                return ActionChip(
                  label: Text(s),
                  onPressed: () => onSuggestionTap(s),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageList extends ConsumerWidget {
  const _MessageList({
    required this.conversationId,
    required this.scrollController,
  });

  final String conversationId;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final messagesAsync = ref.watch(messagesProvider(conversationId));

    return messagesAsync.when(
      data: (messages) {
        if (messages.isEmpty) {
          return Center(
            child: Text(
              'Send a message to get started',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          );
        }

        return ListView.builder(
          controller: scrollController,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          itemCount: messages.length,
          itemBuilder: (context, index) {
            final msg = messages[index];
            return ChatBubble(
              content: msg.content,
              isUser: msg.role == 'user',
              timestamp: msg.timestamp.toDate(),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Text(
          'Error loading messages: $e',
          style: const TextStyle(color: AppColors.error),
        ),
      ),
    );
  }
}

class _InputBar extends StatelessWidget {
  const _InputBar({
    required this.controller,
    required this.focusNode,
    required this.onSend,
    required this.onCamera,
    required this.isLoading,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSend;
  final VoidCallback onCamera;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(
          top: BorderSide(color: Theme.of(context).dividerColor, width: 0.5),
        ),
      ),
      child: Row(
        children: [
          // Camera button
          IconButton(
            icon: const Icon(Icons.camera_alt_outlined),
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            tooltip: 'Take photo or choose from gallery',
            onPressed: isLoading ? null : onCamera,
          ),

          // Text field
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 4,
              minLines: 1,
              enabled: !isLoading,
              decoration: const InputDecoration(
                hintText: 'Describe an expense...',
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                fillColor: Colors.transparent,
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              onSubmitted: (_) => onSend(),
            ),
          ),

          // Send button
          IconButton(
            icon: const Icon(Icons.arrow_upward),
            tooltip: 'Send message',
            style: IconButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              shape: const CircleBorder(),
            ),
            onPressed: isLoading ? null : onSend,
          ),
        ],
      ),
    );
  }
}

class _NotificationBell extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider);

    return IconButton(
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text('$unread', style: const TextStyle(fontSize: 10)),
        child: const Icon(Icons.notifications_outlined),
      ),
      tooltip: unread > 0
          ? '$unread unread notifications'
          : 'Notifications',
      onPressed: () => context.push('/notifications'),
    );
  }
}
