import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

/// Result of attempting to add a guest expense.
enum GuestAddResult { success, limitReached }

/// Manages guest expenses in local Hive storage.
///
/// Provides reactive state via StateNotifier and persists to Hive.
/// Tracks AI usage quota for guest mode.
class GuestExpenseNotifier extends StateNotifier<List<ExpenseModel>> {
  GuestExpenseNotifier(this._box) : super([]) {
    _load();
  }

  final Box _box;

  static const maxExpenses = 15;
  static const maxAiUses = 3; // text categorization
  static const maxReceiptScans = 1;
  static const softLimitThreshold = 10;

  static const _expensesKey = 'expenses';
  static const _aiUsesKey = 'ai_uses';
  static const _receiptScansKey = 'receipt_scans';

  // --- Getters ---

  int get count => state.length;
  int get remaining => maxExpenses - state.length;
  bool get isFull => count >= maxExpenses;
  bool get atSoftLimit => count >= softLimitThreshold;

  int get aiUsesRemaining =>
      maxAiUses - (_box.get(_aiUsesKey, defaultValue: 0) as int);
  bool get canUseAi => aiUsesRemaining > 0;

  int get receiptScansRemaining =>
      maxReceiptScans - (_box.get(_receiptScansKey, defaultValue: 0) as int);
  bool get canScanReceipt => receiptScansRemaining > 0;

  // --- CRUD ---

  /// Add a guest expense. Returns [GuestAddResult.limitReached] if at capacity.
  GuestAddResult add({
    required String vendor,
    required double amount,
    required String category,
    required DateTime date,
    String? description,
    String? receiptUrl,
  }) {
    if (isFull) return GuestAddResult.limitReached;

    final now = DateTime.now();
    // Use noon convention to avoid timezone edge cases (matches Firestore path)
    final dateAtNoon = DateTime(date.year, date.month, date.day, 12);
    final ts = Timestamp.fromDate(now);

    final expense = ExpenseModel(
      id: 'guest_local_${now.millisecondsSinceEpoch}',
      userId: 'guest',
      vendor: vendor,
      amount: amount,
      category: category,
      date: Timestamp.fromDate(dateAtNoon),
      expenseType: 'personal',
      createdAt: ts,
      updatedAt: ts,
      description: description,
      receiptUrl: receiptUrl,
      syncStatus: 'pending',
      localId: 'guest_local_${now.millisecondsSinceEpoch}',
    );

    state = [...state, expense];
    _persist();
    return GuestAddResult.success;
  }

  /// Update a guest expense by ID.
  void update(
    String id, {
    String? vendor,
    double? amount,
    String? category,
    DateTime? date,
    String? description,
  }) {
    state = [
      for (final e in state)
        if (e.id == id)
          ExpenseModel(
            id: e.id,
            userId: e.userId,
            vendor: vendor ?? e.vendor,
            amount: amount ?? e.amount,
            category: category ?? e.category,
            date: date != null
                ? Timestamp.fromDate(DateTime(date.year, date.month, date.day, 12))
                : e.date,
            expenseType: e.expenseType,
            createdAt: e.createdAt,
            updatedAt: Timestamp.fromDate(DateTime.now()),
            description: description ?? e.description,
            receiptUrl: e.receiptUrl,
            syncStatus: e.syncStatus,
            localId: e.localId,
          )
        else
          e,
    ];
    _persist();
  }

  /// Delete a guest expense by ID.
  void delete(String id) {
    state = state.where((e) => e.id != id).toList();
    _persist();
  }

  /// Record an AI categorization use.
  void recordAiUse() {
    final current = _box.get(_aiUsesKey, defaultValue: 0) as int;
    _box.put(_aiUsesKey, current + 1);
  }

  /// Record a receipt scan use.
  void recordReceiptScan() {
    final current = _box.get(_receiptScansKey, defaultValue: 0) as int;
    _box.put(_receiptScansKey, current + 1);
  }

  /// Consume all expenses for migration to Firestore.
  /// Returns the list and atomically clears local storage.
  List<ExpenseModel> consumeForMigration() {
    final expenses = List<ExpenseModel>.from(state);
    state = [];
    _box.delete(_expensesKey);
    _box.delete(_aiUsesKey);
    _box.delete(_receiptScansKey);
    return expenses;
  }

  // --- Persistence ---

  void _load() {
    try {
      final raw = _box.get(_expensesKey, defaultValue: <dynamic>[]) as List;
      state = raw
          .cast<Map>()
          .map((m) => ExpenseModel.fromLocalMap(Map<String, dynamic>.from(m)))
          .toList();
    } catch (e) {
      debugPrint('[GuestExpense] Failed to load from Hive: $e');
      state = [];
    }
  }

  void _persist() {
    try {
      _box.put(_expensesKey, state.map((e) => e.toLocalMap()).toList());
    } catch (e) {
      debugPrint('[GuestExpense] Failed to persist to Hive: $e');
    }
  }
}

/// Guest expense provider — NOT autoDispose (survives navigation).
final guestExpenseProvider =
    StateNotifierProvider<GuestExpenseNotifier, List<ExpenseModel>>((ref) {
  final box = Hive.box('guest_expenses');
  return GuestExpenseNotifier(box);
});
