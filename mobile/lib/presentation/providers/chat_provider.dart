import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/conversation_model.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/message_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/services/storage_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

/// Provider for the current conversation's messages.
final messagesProvider = StreamProvider.autoDispose
    .family<List<MessageModel>, String>((ref, conversationId) {
      if (keepForCurrentSession(ref) == null) return const Stream.empty();
      final repo = ref.watch(conversationRepositoryProvider);
      return repo.watchMessages(conversationId);
    });

/// Shown when a receipt was read but its photo could not be uploaded.
const kPhotoNotAttachedMessage =
    "The photo wasn't attached. You can still save the expense.";

/// Shown when a receipt photo was uploaded but could not be read: the photo
/// is kept and attached to the next expense typed in this chat.
const kPhotoKeptMessage =
    'Your photo was kept. Type the expense here (for example '
    '"Lunch \$14.50") and the photo will be attached to it.';

/// Shown with an expense typed after a receipt photo that could not be read.
const kPhotoWillBeAttachedMessage =
    'Your receipt photo will be attached to this expense.';

/// Shown when the AI answered but found no expense to save.
const kNoExpenseFoundMessage =
    "I couldn't find an expense in that. Try again, or type the vendor and "
    'amount (for example "Lunch \$14.50").';

/// State for the active chat session.
class ChatState {
  const ChatState({
    this.conversationId,
    this.isLoading = false,
    this.isAnalyzing = false,
    this.error,
    this.notice,
    this.pendingExpenses,
    this.receiptUrl,
  });

  final String? conversationId;
  final bool isLoading;
  final bool isAnalyzing;
  final String? error;

  /// A short, non-error note about the pending expenses (for example that
  /// the receipt photo was not attached). Cleared with the pending expenses.
  final String? notice;
  final AnalyzeExpenseResult? pendingExpenses;

  /// Download URL of the uploaded receipt image returned by the API.
  /// Set after image analysis + upload, cleared when pending expenses are
  /// confirmed or dismissed.
  final String? receiptUrl;

  ChatState copyWith({
    String? conversationId,
    bool? isLoading,
    bool? isAnalyzing,
    String? error,
    String? notice,
    AnalyzeExpenseResult? pendingExpenses,
    String? receiptUrl,
    bool clearError = false,
    bool clearNotice = false,
    bool clearPending = false,
  }) {
    return ChatState(
      conversationId: conversationId ?? this.conversationId,
      isLoading: isLoading ?? this.isLoading,
      isAnalyzing: isAnalyzing ?? this.isAnalyzing,
      error: clearError ? null : (error ?? this.error),
      notice: clearPending || clearNotice ? null : (notice ?? this.notice),
      pendingExpenses: clearPending
          ? null
          : (pendingExpenses ?? this.pendingExpenses),
      receiptUrl: clearPending ? null : (receiptUrl ?? this.receiptUrl),
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier({
    required this.aiRepo,
    required this.conversationRepo,
    required this.storageService,
    required this.userId,
    this.onMessagesChanged,
  }) : super(const ChatState());

  final AiRepository aiRepo;
  final ConversationRepository conversationRepo;
  final StorageService storageService;
  final String userId;

  /// Called when a conversation's stored messages changed (or should be
  /// reloaded), so the message list can refetch them.
  final void Function(String conversationId)? onMessagesChanged;

  /// Bumped whenever the screen switches to another conversation (new or
  /// opened). A request remembers the value it started with; once it
  /// differs, the request still finishes its work in its own conversation
  /// but no longer touches the on-screen state, which belongs to another
  /// conversation now.
  int _session = 0;

  bool get _busy => state.isLoading || state.isAnalyzing;

  /// Whether a request started in [session] may still change the state.
  bool _isCurrent(int session) => mounted && session == _session;

  void _messagesChanged(String conversationId) {
    if (mounted) onMessagesChanged?.call(conversationId);
  }

  /// Send a text message and get AI response.
  ///
  /// Every `await` is followed by a `mounted` check: the notifier is
  /// disposed on sign-out and a late response must not touch its state.
  /// If the user moved to another conversation meanwhile, the reply is
  /// still stored in the conversation it belongs to, but the screen state
  /// (pending expense, error, loading) is left alone.
  Future<void> sendMessage(String text) async {
    // A second tap while a request is running must not start a second
    // conversation. The input is disabled for exactly this long.
    if (_busy) return;
    final session = _session;
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      // Create conversation if this is the first message
      String convId;
      if (state.conversationId == null) {
        convId = await conversationRepo.createConversation(
          userId: userId,
          firstMessage: text,
          firstMessageRole: 'user',
        );
        if (!mounted) return;
        if (_isCurrent(session)) {
          state = state.copyWith(conversationId: convId);
        }
      } else {
        convId = state.conversationId!;
        await conversationRepo.addMessage(
          conversationId: convId,
          role: 'user',
          content: text,
        );
        if (!mounted) return;
      }
      _messagesChanged(convId);

      // Check if this looks like an expense description
      if (_looksLikeExpense(text)) {
        if (_isCurrent(session)) state = state.copyWith(isAnalyzing: true);
        final result = await aiRepo.analyzeExpense(text: text, userId: userId);
        if (!mounted) return;
        if (result.expenses.isEmpty) {
          await _addAssistantMessage(convId, kNoExpenseFoundMessage);
          _messagesChanged(convId);
          if (_isCurrent(session)) {
            state = state.copyWith(error: kNoExpenseFoundMessage);
          }
          return;
        }
        if (_isCurrent(session)) {
          state = state.copyWith(
            pendingExpenses: result,
            isAnalyzing: false,
            // A photo kept from a receipt that could not be read goes
            // with this expense.
            notice: state.receiptUrl != null
                ? kPhotoWillBeAttachedMessage
                : null,
            clearNotice: state.receiptUrl == null,
          );
        }

        // Add AI response message
        await _addAssistantMessage(convId, _buildExpenseResponseText(result));
      } else {
        // Regular AI chat
        final response = await aiRepo.sendChatMessage(
          message: text,
          userId: userId,
        );
        await _addAssistantMessage(convId, response);
      }
      if (!mounted) return;

      _messagesChanged(convId);
      _maybeTriggerAiTitle(convId);
    } catch (e) {
      if (_isCurrent(session)) {
        state = state.copyWith(error: apiErrorMessage(e));
      }
    } finally {
      if (_isCurrent(session)) {
        state = state.copyWith(isLoading: false, isAnalyzing: false);
      }
    }
  }

  /// Analyze a receipt image and upload it through the API.
  ///
  /// When the photo uploaded but could not be read, its URL is kept (with a
  /// note) so an expense the user then types in this chat gets the photo.
  Future<void> analyzeImage(File imageFile) async {
    // One photo at a time; the camera button is disabled while this runs
    // and the next photo can start as soon as it finishes.
    if (_busy) return;
    final session = _session;
    // Nothing is pending here (the camera is only offered then), so a photo
    // kept from an earlier receipt that could not be read is replaced by
    // this one; it must not be attached to this photo's expense.
    state = state.copyWith(
      isAnalyzing: true,
      clearError: true,
      clearPending: true,
    );

    try {
      String convId;
      if (state.conversationId == null) {
        convId = await conversationRepo.createConversation(
          userId: userId,
          firstMessage: '📷 Receipt uploaded',
          firstMessageRole: 'user',
        );
        if (!mounted) return;
        if (_isCurrent(session)) {
          state = state.copyWith(conversationId: convId);
        }
      } else {
        convId = state.conversationId!;
        await conversationRepo.addMessage(
          conversationId: convId,
          role: 'user',
          content: '📷 Receipt uploaded',
        );
        if (!mounted) return;
      }
      _messagesChanged(convId);

      // AI analysis and receipt upload run side by side, but each succeeds
      // or fails on its own: a failed upload must not discard a good
      // analysis, and a failed analysis must not discard a good upload.
      final uploadFuture = _uploadReceiptOrNull(imageFile);
      final AnalyzeExpenseResult result;
      try {
        result = await aiRepo.analyzeExpense(
          imageFile: imageFile,
          userId: userId,
        );
      } catch (_) {
        _keepPhotoForManualEntry(session, await uploadFuture);
        rethrow;
      }
      final receiptUrl = await uploadFuture;
      if (!mounted) return;

      if (result.expenses.isEmpty) {
        _keepPhotoForManualEntry(session, receiptUrl);
        await _addAssistantMessage(convId, kNoExpenseFoundMessage);
        _messagesChanged(convId);
        if (_isCurrent(session)) {
          state = state.copyWith(error: kNoExpenseFoundMessage);
        }
        return;
      }

      if (_isCurrent(session)) {
        state = state.copyWith(
          pendingExpenses: result,
          receiptUrl: receiptUrl,
          notice: receiptUrl == null ? kPhotoNotAttachedMessage : null,
          clearNotice: receiptUrl != null,
        );
      }

      await _addAssistantMessage(convId, _buildExpenseResponseText(result));
      if (!mounted) return;

      _messagesChanged(convId);
      _maybeTriggerAiTitle(convId);
    } catch (e) {
      if (_isCurrent(session)) {
        state = state.copyWith(error: apiErrorMessage(e));
      }
    } finally {
      if (_isCurrent(session)) state = state.copyWith(isAnalyzing: false);
    }
  }

  /// Keeps an uploaded receipt that could not be read, so it can be
  /// attached to an expense typed afterwards in the same conversation.
  void _keepPhotoForManualEntry(int session, String? receiptUrl) {
    if (receiptUrl == null || !_isCurrent(session)) return;
    state = state.copyWith(receiptUrl: receiptUrl, notice: kPhotoKeptMessage);
  }

  Future<void> _addAssistantMessage(String conversationId, String content) {
    return conversationRepo.addMessage(
      conversationId: conversationId,
      role: 'assistant',
      content: content,
    );
  }

  /// Uploads the receipt photo; `null` when the upload failed.
  Future<String?> _uploadReceiptOrNull(File imageFile) async {
    try {
      final url = await storageService.uploadReceipt(imageFile, userId);
      return url.isEmpty ? null : url;
    } catch (_) {
      return null;
    }
  }

  /// Lazy AI title: once a conversation has 3+ messages and hasn't been
  /// AI-titled yet, ask the server to generate a Gemini title. Fire-and-
  /// forget; the API-backed conversation state will reflow the new title into
  /// the UI.
  void _maybeTriggerAiTitle(String conversationId) {
    unawaited(() async {
      try {
        final conv = await conversationRepo.getConversation(conversationId);
        if (conv == null) return;
        if (conv.messageCount < 3) return;
        if (conv.metadata.aiTitleGenerated) return;
        await aiRepo.requestTitleGeneration(conversationId);
      } catch (_) {
        // Title gen is best-effort; placeholder title keeps the UI usable.
      }
    }());
  }

  /// Start a new conversation.
  void newConversation() {
    _session++;
    state = const ChatState();
  }

  /// Load an existing conversation.
  void loadConversation(String conversationId) {
    _session++;
    state = ChatState(conversationId: conversationId);
    // Reopening must show the stored messages, not a cached earlier list.
    _messagesChanged(conversationId);
    unawaited(
      conversationRepo
          .updateConversation(conversationId, {
            'metadata.lastAccessedAt': Timestamp.now(),
          })
          .catchError((_) {}),
    );
  }

  /// Clear pending expenses after confirmation or dismissal.
  void clearPendingExpenses() {
    state = state.copyWith(clearPending: true);
  }

  /// Remove one pending expense (after it was saved). The others stay on
  /// screen; the panel closes when none are left.
  void removePendingExpense(ParsedExpense expense) {
    final pending = state.pendingExpenses;
    if (pending == null) return;
    final remaining = pending.expenses
        .where((e) => !identical(e, expense))
        .toList();
    if (remaining.isEmpty) {
      clearPendingExpenses();
    } else {
      state = state.copyWith(
        pendingExpenses: AnalyzeExpenseResult(expenses: remaining),
      );
    }
  }

  bool _looksLikeExpense(String text) {
    final lower = text.toLowerCase();
    return RegExp(r'\$\d').hasMatch(text) ||
        RegExp(r'\d+\.\d{2}').hasMatch(text) ||
        lower.contains('spent') ||
        lower.contains('paid') ||
        lower.contains('bought') ||
        lower.contains('receipt') ||
        lower.contains('invoice');
  }

  String _buildExpenseResponseText(AnalyzeExpenseResult result) {
    if (result.isMultiple) {
      final buffer = StringBuffer(
        'I found **${result.expenses.length} expenses**:\n\n',
      );
      for (final e in result.expenses) {
        buffer.writeln(
          '• **${e.vendor}** — \$${e.amount.toStringAsFixed(2)} (${e.category})',
        );
      }
      buffer.write('\nConfirm to save them.');
      return buffer.toString();
    } else {
      final e = result.expenses.first;
      return '**${e.vendor}** — \$${e.amount.toStringAsFixed(2)}\n'
          'Category: ${e.category}\n'
          'Date: ${e.date}\n'
          '${e.confidence != null ? 'Confidence: ${(e.confidence! * 100).round()}%' : ''}';
    }
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final user = ref.watch(currentUserProvider);
  return ChatNotifier(
    aiRepo: ref.watch(aiRepositoryProvider),
    conversationRepo: ref.watch(conversationRepositoryProvider),
    storageService: ref.watch(storageServiceProvider),
    userId: user?.uid ?? '',
    onMessagesChanged: (id) {
      ref.invalidate(messagesProvider(id));
      // New conversations and new titles/order show in the drawer.
      ref.invalidate(conversationsListProvider);
    },
  );
});

/// Streams the user's active conversations, sorted with pinned first then by
/// most-recently updated. Bounded to keep the drawer snappy on large accounts;
/// search uses [searchAllConversationsProvider] for full coverage.
final conversationsListProvider =
    StreamProvider.autoDispose<List<ConversationModel>>((ref) {
      keepForCurrentSession(ref);
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
