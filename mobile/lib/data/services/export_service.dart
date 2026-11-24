import 'dart:io';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

class ExportService {
  String generateCsv(
    List<ExpenseModel> expenses, {
    Map<String, String>? groupNames,
  }) {
    final buffer = StringBuffer();
    // BOM for Excel compatibility
    buffer.write('\uFEFF');
    // Header
    buffer.writeln('Date,Vendor,Category,Amount,Type,Group,Description');

    final dateFmt = DateFormat('yyyy-MM-dd');
    for (final e in expenses.where((e) => e.countsTowardTotals)) {
      final date = dateFmt.format(e.date.toDate());
      final vendor = _escapeCsv(e.vendor);
      final category = _escapeCsv(e.category);
      final amount = e.amount.toStringAsFixed(2);
      final type = _escapeCsv(e.expenseType);
      final group = e.groupId != null
          ? _escapeCsv(groupNames?[e.groupId] ?? '')
          : '';
      final desc = _escapeCsv(e.description ?? '');
      buffer.writeln('$date,$vendor,$category,$amount,$type,$group,$desc');
    }
    return buffer.toString();
  }

  /// Escapes a text cell. A leading `=`, `+`, `-`, `@`, tab or carriage
  /// return would make a spreadsheet treat the cell as a formula, so those
  /// get a `'` prefix. Only used for text columns — never for the amount.
  String _escapeCsv(String value) {
    var cell = value;
    if (RegExp(r'^[=+\-@\t\r]').hasMatch(cell)) cell = "'$cell";
    if (cell.contains(RegExp('[,"\n\r]'))) {
      return '"${cell.replaceAll('"', '""')}"';
    }
    return cell;
  }

  /// File name for an export; only letters, digits, `_` and `-` of the label
  /// are kept.
  static String exportFileName(String? dateRangeLabel) {
    final safe = (dateRangeLabel ?? '')
        .replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');
    return 'penny_expenses_${safe.isEmpty ? 'export' : safe}.csv';
  }

  Future<ShareResult?> shareExpenseCsv(
    List<ExpenseModel> expenses, {
    Map<String, String>? groupNames,
    String? dateRangeLabel,
  }) async {
    if (!expenses.any((e) => e.countsTowardTotals)) return null;

    final csv = generateCsv(expenses, groupNames: groupNames);
    final fileName = exportFileName(dateRangeLabel);
    final tempDir = Directory.systemTemp;
    final file = File('${tempDir.path}/$fileName');
    await file.writeAsString(csv);

    return SharePlus.instance.share(ShareParams(files: [XFile(file.path)]));
  }
}
