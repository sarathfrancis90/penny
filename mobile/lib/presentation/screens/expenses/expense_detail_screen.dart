import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/receipt_image_viewer.dart';

class ExpenseDetailScreen extends ConsumerWidget {
  const ExpenseDetailScreen({super.key, required this.expense});

  final ExpenseModel expense;

  static Widget _flightShuttleBuilder(
    BuildContext flightContext,
    Animation<double> animation,
    HeroFlightDirection flightDirection,
    BuildContext fromHeroContext,
    BuildContext toHeroContext,
  ) {
    return DefaultTextStyle(
      style: DefaultTextStyle.of(toHeroContext).style,
      child: toHeroContext.widget,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dateStr = DateFormat('EEEE, MMMM d, y').format(expense.date.toDate());
    final amountStr = NumberFormat.currency(symbol: '\$', decimalDigits: 2)
        .format(expense.amount);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Expense'),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_outlined),
            tooltip: 'Share expense',
            onPressed: () => _shareExpense(context),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit expense',
            onPressed: () => _showEditSheet(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: AppColors.error),
            tooltip: 'Delete expense',
            onPressed: () => _confirmDelete(context, ref),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Amount
          Semantics(
            label: 'Amount: $amountStr',
            child: Hero(
              tag: 'expense-amount-${expense.id}',
              flightShuttleBuilder: _flightShuttleBuilder,
              child: Material(
                type: MaterialType.transparency,
                child: Text(
                  amountStr,
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.onSurface,
                    letterSpacing: -1,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Hero(
            tag: 'expense-vendor-${expense.id}',
            flightShuttleBuilder: _flightShuttleBuilder,
            child: Material(
              type: MaterialType.transparency,
              child: Text(
                expense.vendor,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Details
          _DetailRow(label: 'Category', value: expense.category),
          _DetailRow(label: 'Date', value: dateStr),
          _DetailRow(label: 'Type', value: expense.expenseType),
          if (expense.description != null && expense.description!.isNotEmpty)
            _DetailRow(label: 'Description', value: expense.description!),
          if (expense.notes != null && expense.notes!.isNotEmpty)
            _DetailRow(label: 'Notes', value: expense.notes!),

          // Approval status for group expenses
          if (expense.expenseType == 'group' &&
              expense.approvalStatus != null) ...[
            const SizedBox(height: 8),
            _ApprovalStatusRow(expense: expense),
          ],

          if (expense.receiptUrl != null) ...[
            const SizedBox(height: 16),
            ReceiptImageViewer(
              receiptUrl: expense.receiptUrl,
              heroTag: 'receipt-${expense.id}',
            ),
          ],
          if (expense.receiptUrl == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.receipt_long_outlined,
                      size: 16, color: Theme.of(context).hintColor),
                  const SizedBox(width: 8),
                  Text('No receipt attached',
                      style: TextStyle(
                          fontSize: 13, color: Theme.of(context).hintColor)),
                ],
              ),
            ),

          const SizedBox(height: 32),

          // Delete button at bottom
          OutlinedButton.icon(
            onPressed: () => _confirmDelete(context, ref),
            icon: const Icon(Icons.delete_outline, color: AppColors.error),
            label: const Text('Delete Expense',
                style: TextStyle(color: AppColors.error)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.error),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }

  void _shareExpense(BuildContext context) {
    final dateStr = DateFormat('MMM d, y').format(expense.date.toDate());
    final text = '${expense.vendor} — \$${expense.amount.toStringAsFixed(2)}\n'
        'Category: ${expense.category}\n'
        'Date: $dateStr\n'
        '${expense.description ?? ''}\n\n'
        'Tracked with Penny';
    SharePlus.instance.share(ShareParams(text: text));
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning_amber_rounded,
                  size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              const Text(
                'Delete this expense?',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text(
                '${expense.vendor} — \$${expense.amount.toStringAsFixed(2)}',
                style: TextStyle(
                    fontSize: 15, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.error),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        // Group expenses go through API (triggers notifications)
                        if (expense.groupId != null && expense.expenseType == 'group') {
                          await ref.read(apiClientProvider).delete(
                            '/api/expenses/${expense.id}',
                          );
                        } else {
                          await ref.read(expenseRepositoryProvider)
                              .deleteExpense(expense.id);
                        }
                        HapticFeedback.mediumImpact();
                        if (context.mounted) Navigator.pop(context);
                      },
                      child: const Text('Delete'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showEditSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _EditExpenseSheet(expense: expense, ref: ref),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 15,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ApprovalStatusRow extends StatelessWidget {
  const _ApprovalStatusRow({required this.expense});

  final ExpenseModel expense;

  @override
  Widget build(BuildContext context) {
    final Color statusColor;
    final String statusLabel;
    final IconData statusIcon;

    if (expense.isPending) {
      statusColor = AppColors.warning;
      statusLabel = 'Pending Approval';
      statusIcon = Icons.hourglass_empty;
    } else if (expense.isRejected) {
      statusColor = AppColors.error;
      statusLabel = 'Rejected';
      statusIcon = Icons.cancel_outlined;
    } else {
      statusColor = AppColors.success;
      statusLabel = 'Approved';
      statusIcon = Icons.check_circle_outline;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: statusColor.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(statusIcon, size: 16, color: statusColor),
              const SizedBox(width: 8),
              Text(
                statusLabel,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: statusColor,
                ),
              ),
            ],
          ),
          if (expense.isRejected && expense.rejectedReason != null) ...[
            const SizedBox(height: 6),
            Text(
              'Reason: ${expense.rejectedReason}',
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EditExpenseSheet extends StatefulWidget {
  const _EditExpenseSheet({required this.expense, required this.ref});

  final ExpenseModel expense;
  final WidgetRef ref;

  @override
  State<_EditExpenseSheet> createState() => _EditExpenseSheetState();
}

class _EditExpenseSheetState extends State<_EditExpenseSheet> {
  late final TextEditingController _vendorController;
  late final TextEditingController _amountController;
  late final TextEditingController _descriptionController;
  late String _selectedCategory;
  late DateTime _selectedDate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _vendorController = TextEditingController(text: widget.expense.vendor);
    _amountController =
        TextEditingController(text: widget.expense.amount.toStringAsFixed(2));
    _descriptionController =
        TextEditingController(text: widget.expense.description ?? '');
    _selectedCategory = widget.expense.category;
    _selectedDate = widget.expense.date.toDate();
  }

  @override
  void dispose() {
    _vendorController.dispose();
    _amountController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final vendor = _vendorController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (vendor.isEmpty || amount == null || amount <= 0) return;

    setState(() => _saving = true);

    try {
      final user = widget.ref.read(currentUserProvider);
      final updates = {
        'vendor': vendor,
        'amount': amount,
        'category': _selectedCategory,
        'description': _descriptionController.text.trim(),
        'date': '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}',
      };

      // Group expenses go through API (triggers notifications to members)
      if (widget.expense.groupId != null && widget.expense.expenseType == 'group') {
        await widget.ref.read(apiClientProvider).patch(
          '/api/expenses/${widget.expense.id}',
          data: updates,
        );
      } else {
        await widget.ref.read(expenseRepositoryProvider).updateExpense(
          expenseId: widget.expense.id,
          userId: user!.uid,
          updates: {
            ...updates,
            'date': Timestamp.fromDate(
                DateTime(_selectedDate.year, _selectedDate.month,
                    _selectedDate.day, 12)),
          },
        );
      }
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Failed to update: $e'),
              backgroundColor: AppColors.error),
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
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Edit Expense',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 20),

          // Vendor
          TextField(
            controller: _vendorController,
            decoration: const InputDecoration(hintText: 'Vendor'),
          ),
          const SizedBox(height: 12),

          // Amount
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(hintText: 'Amount', prefixText: '\$ '),
          ),
          const SizedBox(height: 12),

          // Category dropdown
          DropdownButtonFormField<String>(
            value: expenseCategories.contains(_selectedCategory)
                ? _selectedCategory
                : null,
            decoration: const InputDecoration(hintText: 'Category'),
            isExpanded: true,
            items: expenseCategories.map((c) {
              final short = c.length > 40 ? '${c.substring(0, 40)}...' : c;
              return DropdownMenuItem(value: c, child: Text(short, style: const TextStyle(fontSize: 14)));
            }).toList(),
            onChanged: (v) {
              if (v != null) setState(() => _selectedCategory = v);
            },
          ),
          const SizedBox(height: 12),

          // Date picker
          Semantics(
            button: true,
            label: 'Select date, currently ${DateFormat('MMM d, y').format(_selectedDate)}',
            child: InkWell(
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
                child: Text(DateFormat('MMM d, y').format(_selectedDate)),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Description
          TextField(
            controller: _descriptionController,
            decoration: const InputDecoration(hintText: 'Description (optional)'),
            maxLines: 2,
          ),
          const SizedBox(height: 20),

          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Save Changes'),
          ),
        ],
      ),
    );
  }
}
