import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Manual expense creation form — for adding expenses without AI.
/// Show via: showModalBottomSheet(builder: (_) => QuickAddExpense(ref: ref))
class QuickAddExpense extends StatefulWidget {
  const QuickAddExpense({super.key, required this.ref, this.groupId});

  final WidgetRef ref;
  final String? groupId; // If set, creates a group expense

  @override
  State<QuickAddExpense> createState() => _QuickAddExpenseState();
}

class _QuickAddExpenseState extends State<QuickAddExpense> {
  final _vendorController = TextEditingController();
  final _amountController = TextEditingController();
  final _descController = TextEditingController();
  String? _selectedCategory;
  DateTime _selectedDate = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _vendorController.dispose();
    _amountController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final vendor = _vendorController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (vendor.isEmpty || amount == null || amount <= 0 || _selectedCategory == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill all required fields'),
            backgroundColor: AppColors.warning),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final user = widget.ref.read(currentUserProvider);
      if (user == null) return;

      final dateStr =
          '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

      if (widget.groupId != null) {
        // Group expense — use API
        await widget.ref.read(apiClientProvider).post(
          '/api/expenses',
          data: {
            'vendor': vendor,
            'amount': amount,
            'category': _selectedCategory,
            'date': dateStr,
            'description': _descController.text.trim(),
            'userId': user.uid,
            'groupId': widget.groupId,
          },
        );
      } else {
        // Personal expense — direct Firestore
        await widget.ref.read(expenseRepositoryProvider).savePersonalExpense(
              userId: user.uid,
              vendor: vendor,
              amount: amount,
              category: _selectedCategory!,
              date: dateStr,
              description: _descController.text.trim(),
            );
      }

      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$vendor — \$${amount.toStringAsFixed(2)} saved'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.groupId != null ? 'Add Group Expense' : 'Add Expense',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 20),

            TextField(
              controller: _vendorController,
              decoration: const InputDecoration(hintText: 'Vendor / Merchant'),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(hintText: 'Amount', prefixText: '\$ '),
            ),
            const SizedBox(height: 12),

            DropdownButtonFormField<String>(
              value: _selectedCategory,
              decoration: const InputDecoration(hintText: 'Category'),
              isExpanded: true,
              items: expenseCategories.map((c) {
                final short = c.length > 40 ? '${c.substring(0, 40)}...' : c;
                return DropdownMenuItem(value: c, child: Text(short, style: const TextStyle(fontSize: 14)));
              }).toList(),
              onChanged: (v) => setState(() => _selectedCategory = v),
            ),
            const SizedBox(height: 12),

            InkWell(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _selectedDate,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now().add(const Duration(days: 1)),
                );
                if (picked != null) setState(() => _selectedDate = picked);
              },
              child: InputDecorator(
                decoration: const InputDecoration(hintText: 'Date'),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}',
                      ),
                    ),
                    const Icon(Icons.calendar_today_outlined, size: 18,
                        color: AppColors.textSecondary),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _descController,
              decoration: const InputDecoration(hintText: 'Description (optional)'),
              maxLines: 2,
            ),
            const SizedBox(height: 20),

            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(height: 20, width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(widget.groupId != null ? 'Add Group Expense' : 'Add Expense'),
            ),
          ],
        ),
      ),
    );
  }
}
