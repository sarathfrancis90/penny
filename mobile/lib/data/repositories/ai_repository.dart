import 'dart:convert';
import 'dart:io';

import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';

class AiRepository {
  AiRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  /// Send a chat message to the AI and get a response.
  /// Returns the AI's response text.
  Future<String> sendChatMessage({
    required String message,
    required String userId,
    List<Map<String, String>> conversationHistory = const [],
  }) async {
    final response = await _api.post(
      ApiEndpoints.aiChat,
      data: {
        'message': message,
        'userId': userId,
        'conversationHistory': conversationHistory,
      },
    );

    final data = response.data as Map<String, dynamic>;
    if (data['success'] == true) {
      return data['message'] as String;
    }
    throw Exception(data['error'] ?? 'AI chat failed');
  }

  /// Ask the server to generate a Gemini-backed title for [conversationId].
  /// Fire-and-forget: any failure is swallowed so the placeholder title set
  /// at conversation-creation time persists. Caller should not await unless
  /// they specifically want the result.
  Future<void> requestTitleGeneration(String conversationId) async {
    try {
      await _api.post(
        ApiEndpoints.generateConversationTitle(conversationId),
        data: const <String, dynamic>{},
      );
    } catch (_) {
      // Intentional swallow: the user already has a usable placeholder title.
    }
  }

  /// Analyze an expense from text and/or image.
  /// Returns parsed expense data (single or multiple).
  ///
  /// [now] is the device clock (injectable for tests); its calendar date is
  /// sent as `localDate` so "today"/"yesterday" resolve in the user's time
  /// zone rather than the server's.
  Future<AnalyzeExpenseResult> analyzeExpense({
    String? text,
    File? imageFile,
    required String userId,
    DateTime? now,
  }) async {
    String? imageBase64;
    if (imageFile != null) {
      final bytes = await imageFile.readAsBytes();
      imageBase64 = base64Encode(bytes);
    }

    final response = await _api.post(
      ApiEndpoints.analyzeExpense,
      data: {
        'text': ?text,
        'imageBase64': ?imageBase64,
        'userId': userId,
        'localDate': _localDate(now ?? DateTime.now()),
      },
      receiveTimeout: ApiClient.longReceiveTimeout,
    );

    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Analysis failed');
    }

    final isMulti = data['multiExpense'] == true;
    if (isMulti) {
      final list = (data['data'] as List<dynamic>)
          .map((e) => ParsedExpense.fromJson(e as Map<String, dynamic>))
          .toList();
      return AnalyzeExpenseResult(expenses: list);
    } else {
      final expense = ParsedExpense.fromJson(
        data['data'] as Map<String, dynamic>,
      );
      return AnalyzeExpenseResult(expenses: [expense]);
    }
  }
}

String _localDate(DateTime now) {
  final local = now.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year}-$month-$day';
}

class AnalyzeExpenseResult {
  AnalyzeExpenseResult({required this.expenses});
  final List<ParsedExpense> expenses;

  bool get isMultiple => expenses.length > 1;
}

class ParsedExpense {
  ParsedExpense({
    required this.vendor,
    required this.amount,
    required this.date,
    required this.category,
    this.description,
    this.groupId,
    this.groupName,
    this.confidence,
  });

  final String vendor;
  final double amount;
  final String date; // YYYY-MM-DD
  final String category;
  final String? description;
  final String? groupId;
  final String? groupName;
  final double? confidence;

  factory ParsedExpense.fromJson(Map<String, dynamic> json) {
    return ParsedExpense(
      vendor: json['vendor'] as String? ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      date: json['date'] as String? ?? '',
      category: json['category'] as String? ?? '',
      description: json['description'] as String?,
      groupId: json['groupId'] as String?,
      groupName: json['groupName'] as String?,
      confidence: (json['confidence'] as num?)?.toDouble(),
    );
  }
}
