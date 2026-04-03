import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/models/message_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/services/storage_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Provider for the current conversation's messages.
final messagesProvider =
    StreamProvider.family<List<MessageModel>, String>((ref, conversationId) {
  final repo = ref.watch(conversationRepositoryProvider);
  return repo.watchMessages(conversationId);
});

/// State for the active chat session.
class ChatState {
  const ChatState({
    this.conversationId,
    this.isLoading = false,
    this.isAnalyzing = false,
    this.error,
    this.pendingExpenses,
    this.receiptUrl,
  });

  final String? conversationId;
  final bool isLoading;
  final bool isAnalyzing;
  final String? error;
  final AnalyzeExpenseResult? pendingExpenses;

  /// Download URL of the uploaded receipt image in Firebase Storage.
  /// Set after image analysis + upload, cleared when pending expenses are
  /// confirmed or dismissed.
  final String? receiptUrl;

  ChatState copyWith({
    String? conversationId,
    bool? isLoading,
    bool? isAnalyzing,
    String? error,
    AnalyzeExpenseResult? pendingExpenses,
    String? receiptUrl,
    bool clearError = false,
    bool clearPending = false,
  }) {
    return ChatState(
      conversationId: conversationId ?? this.conversationId,
      isLoading: isLoading ?? this.isLoading,
      isAnalyzing: isAnalyzing ?? this.isAnalyzing,
      error: clearError ? null : (error ?? this.error),
      pendingExpenses:
          clearPending ? null : (pendingExpenses ?? this.pendingExpenses),
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
  }) : super(const ChatState());

  final AiRepository aiRepo;
  final ConversationRepository conversationRepo;
  final StorageService storageService;
  final String userId;

  /// Send a text message and get AI response.
  Future<void> sendMessage(String text) async {
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
        state = state.copyWith(conversationId: convId);
      } else {
        convId = state.conversationId!;
        await conversationRepo.addMessage(
          conversationId: convId,
          role: 'user',
          content: text,
        );
      }

      // Check if this looks like an expense description
      if (_looksLikeExpense(text)) {
        state = state.copyWith(isAnalyzing: true);
        final result = await aiRepo.analyzeExpense(
          text: text,
          userId: userId,
        );
        state = state.copyWith(
          pendingExpenses: result,
          isAnalyzing: false,
        );

        // Add AI response message
        final responseText = _buildExpenseResponseText(result);
        await conversationRepo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: responseText,
        );
      } else {
        // Regular AI chat
        final response = await aiRepo.sendChatMessage(
          message: text,
          userId: userId,
        );
        await conversationRepo.addMessage(
          conversationId: convId,
          role: 'assistant',
          content: response,
        );
      }
    } catch (e) {
      state = state.copyWith(error: e.toString());
    } finally {
      state = state.copyWith(isLoading: false, isAnalyzing: false);
    }
  }

  /// Analyze a receipt image and upload it to Firebase Storage.
  Future<void> analyzeImage(File imageFile) async {
    state = state.copyWith(isAnalyzing: true, clearError: true);

    try {
      String convId;
      if (state.conversationId == null) {
        convId = await conversationRepo.createConversation(
          userId: userId,
          firstMessage: '📷 Receipt uploaded',
          firstMessageRole: 'user',
        );
        state = state.copyWith(conversationId: convId);
      } else {
        convId = state.conversationId!;
        await conversationRepo.addMessage(
          conversationId: convId,
          role: 'user',
          content: '📷 Receipt uploaded',
        );
      }

      // Run AI analysis and receipt upload in parallel
      final analysisFuture = aiRepo.analyzeExpense(
        imageFile: imageFile,
        userId: userId,
      );
      final uploadFuture = storageService.uploadReceipt(imageFile, userId);

      final results = await Future.wait([analysisFuture, uploadFuture]);
      final result = results[0] as AnalyzeExpenseResult;
      final receiptUrl = results[1] as String;

      state = state.copyWith(
        pendingExpenses: result,
        receiptUrl: receiptUrl,
      );

      final responseText = _buildExpenseResponseText(result);
      await conversationRepo.addMessage(
        conversationId: convId,
        role: 'assistant',
        content: responseText,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    } finally {
      state = state.copyWith(isAnalyzing: false);
    }
  }

  /// Start a new conversation.
  void newConversation() {
    state = const ChatState();
  }

  /// Load an existing conversation.
  void loadConversation(String conversationId) {
    state = ChatState(conversationId: conversationId);
  }

  /// Clear pending expenses after confirmation or dismissal.
  void clearPendingExpenses() {
    state = state.copyWith(clearPending: true);
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
      final buffer = StringBuffer('I found **${result.expenses.length} expenses**:\n\n');
      for (final e in result.expenses) {
        buffer.writeln('• **${e.vendor}** — \$${e.amount.toStringAsFixed(2)} (${e.category})');
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
  );
});
