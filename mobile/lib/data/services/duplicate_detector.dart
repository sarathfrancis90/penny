import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';

class DuplicateDetector {
  DuplicateDetector({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<DuplicateResult?> checkForDuplicate({
    required String vendor,
    required double amount,
    required DateTime date,
    required String userId,
    String? groupId,
  }) async {
    final response = await _api.post(
      ApiEndpoints.duplicateExpense,
      data: {
        'userId': userId,
        'vendor': vendor,
        'amount': amount,
        'date': _dateString(date),
        'groupId': ?groupId,
      },
    );
    final duplicate = responseMap(response)['duplicate'];
    if (duplicate == null) return null;
    final data = mapValue(duplicate);
    return DuplicateResult(
      existingExpense: ExpenseModel.fromFirestore(apiDocument(data)),
      matchType: DuplicateMatchType.exact,
      addedBy: data['userId'] as String?,
      requestingUserId: userId,
    );
  }

  String _dateString(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }
}

enum DuplicateMatchType { exact, similar, nearbyDate }

class DuplicateResult {
  const DuplicateResult({
    required this.existingExpense,
    required this.matchType,
    this.addedBy,
    this.requestingUserId,
  });

  final ExpenseModel existingExpense;
  final DuplicateMatchType matchType;
  final String? addedBy;
  final String? requestingUserId;

  String get warningMessage {
    final vendor = existingExpense.vendor;
    final amount = existingExpense.amount.toStringAsFixed(2);
    final isGroupDuplicate =
        addedBy != null &&
        requestingUserId != null &&
        addedBy != requestingUserId;

    switch (matchType) {
      case DuplicateMatchType.exact:
        if (isGroupDuplicate) {
          return 'A group member already added \$$amount at $vendor on this date. Add anyway?';
        }
        return 'You already have \$$amount at $vendor on this date. Add duplicate?';
      case DuplicateMatchType.similar:
        if (isGroupDuplicate) {
          return 'A group member has a similar expense: \$$amount at $vendor. Is this a duplicate?';
        }
        return 'Similar expense found: \$$amount at $vendor on this date. Is this a duplicate?';
      case DuplicateMatchType.nearbyDate:
        return 'You have \$$amount at $vendor within the last 2 days. Is this a new expense?';
    }
  }
}
