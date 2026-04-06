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
import 'package:penny_mobile/presentation/widgets/expense_confirmation_sheet.dart';

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

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
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

  /// Open the editable confirmation bottom sheet for a single expense.
  Future<void> _openConfirmationSheet(int index) async {
    final chatState = ref.read(chatProvider);
    final expense = chatState.pendingExpenses?.expenses[index];
    if (expense == null) return;

    final saved = await ExpenseConfirmationSheet.show(
      context,
      expense: expense,
      receiptUrl: chatState.receiptUrl,
      onSaved: () {
        ref.read(chatProvider.notifier).clearPendingExpenses();
      },
    );

    // If the single-expense case was saved, pending is already cleared via
    // the onSaved callback. For multi-expense, we clear after all are done
    // (handled by _openMultiExpenseFlow).
    if (saved == true && chatState.pendingExpenses?.isMultiple == false) {
      // Already cleared above via onSaved.
    }
  }

  /// When the AI detects multiple expenses, iterate through each and open the
  /// confirmation sheet one at a time. User can confirm/skip each.
  Future<void> _openMultiExpenseFlow() async {
    final chatState = ref.read(chatProvider);
    final expenses = chatState.pendingExpenses?.expenses;
    if (expenses == null || expenses.isEmpty) return;

    int savedCount = 0;

    for (var i = 0; i < expenses.length; i++) {
      if (!mounted) break;

      final saved = await ExpenseConfirmationSheet.show(
        context,
        expense: expenses[i],
        receiptUrl: chatState.receiptUrl,
      );

      if (saved == true) savedCount++;
    }

    // Clear all pending expenses after the flow completes.
    ref.read(chatProvider.notifier).clearPendingExpenses();

    if (mounted && savedCount > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$savedCount of ${expenses.length} expenses saved'),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
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
                    pendingExpenses: chatState.pendingExpenses,
                    onConfirmExpense: _openConfirmationSheet,
                    onConfirmAll: _openMultiExpenseFlow,
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

          // Input bar
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
    this.pendingExpenses,
    this.onConfirmExpense,
    this.onConfirmAll,
  });

  final String conversationId;
  final ScrollController scrollController;
  final AnalyzeExpenseResult? pendingExpenses;
  final void Function(int index)? onConfirmExpense;
  final VoidCallback? onConfirmAll;

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
          itemCount: messages.length + (pendingExpenses != null ? 1 : 0),
          itemBuilder: (context, index) {
            // Show pending expense cards at the end
            if (index == messages.length && pendingExpenses != null) {
              final isMultiple = pendingExpenses!.isMultiple;
              return Padding(
                padding: const EdgeInsets.only(right: 48),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header for multi-expense
                    if (isMultiple)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Text(
                              '${pendingExpenses!.expenses.length} expenses detected',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Theme.of(context).colorScheme.onSurface,
                              ),
                            ),
                            const Spacer(),
                            TextButton.icon(
                              onPressed: onConfirmAll,
                              icon: const Icon(Icons.playlist_add_check,
                                  size: 18),
                              label: const Text('Confirm All'),
                              style: TextButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8),
                                textStyle: const TextStyle(fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),

                    for (var i = 0;
                        i < pendingExpenses!.expenses.length;
                        i++)
                      ExpenseCard(
                        expense: pendingExpenses!.expenses[i],
                        onConfirm: () => onConfirmExpense?.call(i),
                        onEdit: () => onConfirmExpense?.call(i),
                      ),
                  ],
                ),
              );
            }

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
