import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_search_screen.dart';

void main() {
  final now = DateTime(2026, 11, 22, 15, 30);

  bool matches(String query, DateTime date) {
    final range = expenseSearchDateRange(query, now);
    return !date.isBefore(range.start!) && date.isBefore(range.end!);
  }

  test('"yesterday" covers yesterday only — not today', () {
    expect(matches('coffee yesterday', DateTime(2026, 11, 21, 12)), isTrue);
    expect(matches('coffee yesterday', DateTime(2026, 11, 22, 12)), isFalse);
    expect(matches('coffee yesterday', DateTime(2026, 11, 20, 12)), isFalse);
    expect(expenseSearchDateRange('coffee yesterday', now).term, 'coffee');
  });

  test('"today" covers today only', () {
    expect(matches('today', DateTime(2026, 11, 22, 12)), isTrue);
    expect(matches('today', DateTime(2026, 11, 23, 12)), isFalse);
    expect(matches('today', DateTime(2026, 11, 21, 12)), isFalse);
  });

  test('"last week" and "last month" stop at the end of today', () {
    expect(matches('last week', DateTime(2026, 11, 18, 12)), isTrue);
    expect(matches('last week', DateTime(2026, 11, 23, 12)), isFalse);
    expect(matches('last week', DateTime(2026, 11, 10, 12)), isFalse);
    expect(matches('last month', DateTime(2026, 11, 1, 12)), isTrue);
    expect(matches('last month', DateTime(2026, 11, 23, 12)), isFalse);
  });

  test('"this month" covers the calendar month', () {
    expect(matches('this month', DateTime(2026, 11, 1, 12)), isTrue);
    expect(matches('this month', DateTime(2026, 11, 30, 12)), isTrue);
    expect(matches('this month', DateTime(2026, 12, 1, 12)), isFalse);
  });

  test('a query without a shortcut has no date range', () {
    final range = expenseSearchDateRange('uber', now);
    expect(range.start, isNull);
    expect(range.end, isNull);
    expect(range.term, 'uber');
  });
}
