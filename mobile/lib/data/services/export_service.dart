import 'dart:io';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

class ExportService {
  String generateCsv(List<ExpenseModel> expenses,
      {Map<String, String>? groupNames}) {
    final buffer = StringBuffer();
    // BOM for Excel compatibility
    buffer.write('\uFEFF');
    // Header
    buffer.writeln('Date,Vendor,Category,Amount,Type,Group,Description');

    final dateFmt = DateFormat('yyyy-MM-dd');
    for (final e in expenses) {
      final date = dateFmt.format(e.date.toDate());
      final vendor = _escapeCsv(e.vendor);
      final category = _escapeCsv(e.category);
      final amount = e.amount.toStringAsFixed(2);
      final type = e.expenseType;
      final group =
          e.groupId != null ? _escapeCsv(groupNames?[e.groupId] ?? '') : '';
      final desc = _escapeCsv(e.description ?? '');
      buffer.writeln('$date,$vendor,$category,$amount,$type,$group,$desc');
    }
    return buffer.toString();
  }

  String _escapeCsv(String value) {
    if (value.contains(',') || value.contains('"') || value.contains('\n')) {
      return '"${value.replaceAll('"', '""')}"';
    }
    return value;
  }

  Future<void> shareExpenseCsv(
    List<ExpenseModel> expenses, {
    Map<String, String>? groupNames,
    String? dateRangeLabel,
  }) async {
    if (expenses.isEmpty) return;

    final csv = generateCsv(expenses, groupNames: groupNames);
    final fileName = 'penny_expenses_${dateRangeLabel ?? 'export'}.csv';
    final tempDir = Directory.systemTemp;
    final file = File('${tempDir.path}/$fileName');
    await file.writeAsString(csv);

    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path)]),
    );
  }
}
