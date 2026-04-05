import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

/// Detects potential duplicate expenses before saving.
///
/// Checks for duplicates based on:
/// 1. Same vendor + similar amount (within 5%) + same date → likely duplicate
/// 2. Same vendor + exact amount + within 2 days → possible duplicate
/// 3. For groups: any member added same vendor + amount + date → duplicate
class DuplicateDetector {
  DuplicateDetector({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Check for duplicates before saving.
  /// Returns null if no duplicate found, or the matching expense if found.
  Future<DuplicateResult?> checkForDuplicate({
    required String vendor,
    required double amount,
    required DateTime date,
    required String userId,
    String? groupId,
  }) async {
    // Normalize vendor for comparison
    final vendorLower = vendor.toLowerCase().trim();

    // Date range: same day (±12 hours to handle timezone)
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));

    Query query;

    if (groupId != null) {
      // Group expense: check ALL members' expenses in this group
      query = _db
          .collection('expenses')
          .where('groupId', isEqualTo: groupId)
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(dayStart))
          .where('date', isLessThan: Timestamp.fromDate(dayEnd));
    } else {
      // Personal expense: check only this user's expenses
      query = _db
          .collection('expenses')
          .where('userId', isEqualTo: userId)
          .where('expenseType', isEqualTo: 'personal')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(dayStart))
          .where('date', isLessThan: Timestamp.fromDate(dayEnd));
    }

    final snapshot = await query.get();

    for (final doc in snapshot.docs) {
      final data = doc.data() as Map<String, dynamic>;
      final existingVendor = (data['vendor'] as String? ?? '').toLowerCase().trim();
      final existingAmount = (data['amount'] as num?)?.toDouble() ?? 0;

      // Check vendor match (exact or contains)
      final vendorMatch = existingVendor == vendorLower ||
          existingVendor.contains(vendorLower) ||
          vendorLower.contains(existingVendor);

      if (!vendorMatch) continue;

      // Check amount match (within 5% tolerance for rounding/tax)
      final amountDiff = (existingAmount - amount).abs();
      final tolerance = amount * 0.05;
      final amountMatch = amountDiff <= tolerance;

      if (amountMatch) {
        return DuplicateResult(
          existingExpense: ExpenseModel.fromFirestore(doc),
          matchType: amountDiff == 0
              ? DuplicateMatchType.exact
              : DuplicateMatchType.similar,
          addedBy: data['userId'] as String?,
          requestingUserId: userId,
        );
      }
    }

    // Also check within 2 days for exact matches (different date)
    final extendedStart = dayStart.subtract(const Duration(days: 1));
    final extendedEnd = dayEnd.add(const Duration(days: 1));

    Query extendedQuery;
    if (groupId != null) {
      extendedQuery = _db
          .collection('expenses')
          .where('groupId', isEqualTo: groupId)
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(extendedStart))
          .where('date', isLessThan: Timestamp.fromDate(extendedEnd));
    } else {
      extendedQuery = _db
          .collection('expenses')
          .where('userId', isEqualTo: userId)
          .where('expenseType', isEqualTo: 'personal')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(extendedStart))
          .where('date', isLessThan: Timestamp.fromDate(extendedEnd));
    }

    final extendedSnapshot = await extendedQuery.get();

    for (final doc in extendedSnapshot.docs) {
      final data = doc.data() as Map<String, dynamic>;
      final existingVendor = (data['vendor'] as String? ?? '').toLowerCase().trim();
      final existingAmount = (data['amount'] as num?)?.toDouble() ?? 0;

      // Only exact matches for extended date range
      if (existingVendor == vendorLower && existingAmount == amount) {
        return DuplicateResult(
          existingExpense: ExpenseModel.fromFirestore(doc),
          matchType: DuplicateMatchType.nearbyDate,
          addedBy: data['userId'] as String?,
          requestingUserId: userId,
        );
      }
    }

    return null;
  }
}

enum DuplicateMatchType {
  exact,      // Same vendor, exact amount, same date
  similar,    // Same vendor, similar amount (within 5%), same date
  nearbyDate, // Same vendor, exact amount, within 2 days
}

class DuplicateResult {
  const DuplicateResult({
    required this.existingExpense,
    required this.matchType,
    this.addedBy,
    this.requestingUserId,
  });

  final ExpenseModel existingExpense;
  final DuplicateMatchType matchType;
  final String? addedBy; // userId who added the existing expense
  final String? requestingUserId; // userId trying to add new expense

  String get warningMessage {
    final vendor = existingExpense.vendor;
    final amount = existingExpense.amount.toStringAsFixed(2);
    final isGroupDuplicate = addedBy != null &&
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
