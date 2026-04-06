import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/services/export_service.dart';

void main() {
  group('ExportService', () {
    late ExportService exportService;

    setUp(() {
      exportService = ExportService();
    });

    ExpenseModel _makeExpense({
      String vendor = 'Tim Hortons',
      double amount = 14.50,
      String category = 'Meals and entertainment',
      String expenseType = 'personal',
      String? groupId,
      String? description,
      DateTime? date,
    }) {
      final now = Timestamp.fromDate(date ?? DateTime(2025, 3, 15));
      return ExpenseModel(
        id: 'exp-1',
        userId: 'user-1',
        vendor: vendor,
        amount: amount,
        category: category,
        date: now,
        expenseType: expenseType,
        createdAt: now,
        updatedAt: now,
        groupId: groupId,
        description: description,
      );
    }

    group('generateCsv', () {
      test('produces correct header row', () {
        final csv = exportService.generateCsv([]);

        // BOM + header
        expect(csv, contains('Date,Vendor,Category,Amount,Type,Group,Description'));
      });

      test('starts with BOM for Excel compatibility', () {
        final csv = exportService.generateCsv([]);

        // UTF-8 BOM is \uFEFF
        expect(csv.codeUnitAt(0), 0xFEFF);
      });

      test('produces correct CSV for a single personal expense', () {
        final expense = _makeExpense(
          vendor: 'Tim Hortons',
          amount: 14.50,
          category: 'Meals and entertainment',
          description: 'Coffee and donut',
          date: DateTime(2025, 3, 15),
        );

        final csv = exportService.generateCsv([expense]);
        final lines = csv.split('\n');

        // line[0] = BOM + header, line[1] = data row
        expect(lines[1],
            '2025-03-15,Tim Hortons,Meals and entertainment,14.50,personal,,Coffee and donut');
      });

      test('produces correct CSV for multiple expenses', () {
        final expenses = [
          _makeExpense(
            vendor: 'Tim Hortons',
            amount: 14.50,
            date: DateTime(2025, 3, 15),
          ),
          _makeExpense(
            vendor: 'Staples',
            amount: 45.00,
            category: 'Office expenses',
            date: DateTime(2025, 3, 16),
          ),
        ];

        final csv = exportService.generateCsv(expenses);
        final lines = csv.trim().split('\n');

        // header + 2 data rows
        expect(lines.length, 3);
      });

      test('returns only header for empty expense list', () {
        final csv = exportService.generateCsv([]);
        final lines = csv.trim().split('\n');

        expect(lines.length, 1);
        expect(lines[0], contains('Date,Vendor'));
      });

      test('handles group expenses with group name lookup', () {
        final expense = _makeExpense(
          vendor: 'Costco',
          amount: 150.00,
          expenseType: 'group',
          groupId: 'group-1',
          date: DateTime(2025, 4, 1),
        );

        final csv = exportService.generateCsv(
          [expense],
          groupNames: {'group-1': 'Family'},
        );
        final lines = csv.split('\n');

        expect(lines[1], contains('group'));
        expect(lines[1], contains('Family'));
      });

      test('handles group expense with missing group name', () {
        final expense = _makeExpense(
          vendor: 'Costco',
          amount: 150.00,
          expenseType: 'group',
          groupId: 'group-unknown',
          date: DateTime(2025, 4, 1),
        );

        final csv = exportService.generateCsv(
          [expense],
          groupNames: {'group-1': 'Family'},
        );
        final lines = csv.split('\n');

        // group-unknown not in groupNames, so group column should be empty string
        expect(lines[1], contains('group'));
      });

      test('handles null description', () {
        final expense = _makeExpense(description: null);

        final csv = exportService.generateCsv([expense]);
        final lines = csv.split('\n');

        // The last field should be empty
        expect(lines[1].endsWith(','), isTrue);
      });

      test('amount formatted to 2 decimal places', () {
        final expense = _makeExpense(amount: 100.0);

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('100.00'));
      });

      test('amount with many decimals is truncated to 2', () {
        final expense = _makeExpense(amount: 14.999);

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('15.00'));
      });
    });

    group('CSV escaping', () {
      test('escapes vendor names containing commas', () {
        final expense = _makeExpense(vendor: 'Amazon.ca, Inc.');

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('"Amazon.ca, Inc."'));
      });

      test('escapes vendor names containing double quotes', () {
        final expense = _makeExpense(vendor: 'Tim "Timmies" Hortons');

        final csv = exportService.generateCsv([expense]);

        // Double quotes should be doubled inside quotes
        expect(csv, contains('"Tim ""Timmies"" Hortons"'));
      });

      test('escapes vendor names containing newlines', () {
        final expense = _makeExpense(vendor: 'Line1\nLine2');

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('"Line1\nLine2"'));
      });

      test('does not escape vendor names without special characters', () {
        final expense = _makeExpense(vendor: 'Tim Hortons');

        final csv = exportService.generateCsv([expense]);
        final lines = csv.split('\n');

        // Should not have quotes around vendor
        expect(lines[1], contains(',Tim Hortons,'));
      });

      test('escapes descriptions containing commas', () {
        final expense =
            _makeExpense(description: 'Coffee, donut, and sandwich');

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('"Coffee, donut, and sandwich"'));
      });

      test('escapes categories containing special characters', () {
        // Some CRA categories contain parentheses and commas
        final expense = _makeExpense(
          category: 'Advertising (Promotion, gift cards etc.)',
        );

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('"Advertising (Promotion, gift cards etc.)"'));
      });
    });

    group('date formatting', () {
      test('formats date as yyyy-MM-dd', () {
        final expense = _makeExpense(date: DateTime(2025, 1, 5));

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('2025-01-05'));
      });

      test('handles end-of-year date', () {
        final expense = _makeExpense(date: DateTime(2025, 12, 31));

        final csv = exportService.generateCsv([expense]);

        expect(csv, contains('2025-12-31'));
      });
    });
  });
}
