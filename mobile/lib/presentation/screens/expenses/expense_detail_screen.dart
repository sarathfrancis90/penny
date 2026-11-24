import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/core/utils/amount_parser.dart';
import 'package:penny_mobile/core/utils/client_request_id.dart';
import 'package:penny_mobile/core/utils/picker_dates.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/guest/guest_expense_store.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_refresh.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/receipt_image_viewer.dart';

/// Whether the signed-in user may edit / delete [expense].
///
/// Personal expenses are always the user's own. For a group expense the
/// member's [permissions] decide: edit needs `canEditAllExpenses`, or
/// `canEditOwnExpenses` on the user's own expense; delete needs
/// `canDeleteExpenses`, or `canEditOwnExpenses` on the user's own expense.
/// While the permissions are not known (`null`: still loading, or the lookup
/// failed) nothing is hidden — the server enforces the rules.
({bool canEdit, bool canDelete}) expenseActionsFor({
  required ExpenseModel expense,
  required String? userId,
  required GroupPermissions? permissions,
}) {
  final isGroupExpense =
      expense.expenseType == 'group' && expense.groupId != null;
  if (!isGroupExpense || permissions == null) {
    return (canEdit: true, canDelete: true);
  }
  final ownAndEditable =
      expense.userId == userId && permissions.canEditOwnExpenses;
  return (
    canEdit: permissions.canEditAllExpenses || ownAndEditable,
    canDelete: permissions.canDeleteExpenses || ownAndEditable,
  );
}

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
    final amountStr = NumberFormat.currency(
      symbol: '\$',
      decimalDigits: 2,
    ).format(expense.amount);

    // Group expenses: only offer Edit/Delete the member is allowed to use.
    final groupId = expense.expenseType == 'group' ? expense.groupId : null;
    GroupPermissions? permissions;
    if (groupId != null && !ref.watch(guestModeProvider)) {
      final membership = ref.watch(currentUserMembershipProvider(groupId));
      if (membership.hasValue) {
        // Loaded: no membership at all means no permissions.
        permissions = membership.value?.permissions ?? const GroupPermissions();
      }
    }
    final actions = expenseActionsFor(
      expense: expense,
      userId: groupId == null ? null : ref.watch(currentUserProvider)?.uid,
      permissions: permissions,
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Expense'),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_outlined),
            tooltip: 'Share expense',
            onPressed: () => _shareExpense(context),
          ),
          if (actions.canEdit)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit expense',
              onPressed: () {
                if (ref.read(guestModeProvider)) {
                  if (expense.id.startsWith('guest_local_')) {
                    _showEditSheet(context, ref);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Sample data cannot be modified'),
                      ),
                    );
                  }
                  return;
                }
                _showEditSheet(context, ref);
              },
            ),
          if (actions.canDelete)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.error),
              tooltip: 'Delete expense',
              onPressed: () {
                if (ref.read(guestModeProvider)) {
                  if (expense.id.startsWith('guest_local_')) {
                    ref.read(guestExpenseProvider.notifier).delete(expense.id);
                    Navigator.pop(context);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Sample data cannot be modified'),
                      ),
                    );
                  }
                  return;
                }
                _confirmDelete(context, ref);
              },
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
                  Icon(
                    Icons.receipt_long_outlined,
                    size: 16,
                    color: Theme.of(context).hintColor,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'No receipt attached',
                    style: TextStyle(
                      fontSize: 13,
                      color: Theme.of(context).hintColor,
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 32),

          // Delete button at bottom
          if (actions.canDelete)
            OutlinedButton.icon(
              onPressed: () => _confirmDelete(context, ref),
              icon: const Icon(Icons.delete_outline, color: AppColors.error),
              label: const Text(
                'Delete Expense',
                style: TextStyle(color: AppColors.error),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.error),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _shareExpense(BuildContext context) {
    final dateStr = DateFormat('MMM d, y').format(expense.date.toDate());
    final text =
        '${expense.vendor} — \$${expense.amount.toStringAsFixed(2)}\n'
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
              const Icon(
                Icons.warning_amber_rounded,
                size: 48,
                color: AppColors.error,
              ),
              const SizedBox(height: 16),
              const Text(
                'Delete this expense?',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text(
                '${expense.vendor} — \$${expense.amount.toStringAsFixed(2)}',
                style: TextStyle(
                  fontSize: 15,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
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
                        backgroundColor: AppColors.error,
                      ),
                      onPressed: () {
                        Navigator.pop(ctx); // close confirmation sheet
                        _deleteExpense(context);
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

  /// Deletes the expense, goes back to the list and offers Undo.
  ///
  /// Everything needed after the screen is closed (messenger, providers) is
  /// captured first: the screen's own `ref` is gone once it has popped.
  Future<void> _deleteExpense(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final repo = container.read(expenseRepositoryProvider);
    final cachedExpense = expense;
    final groupId = cachedExpense.expenseType == 'group'
        ? cachedExpense.groupId
        : null;

    void showError(String message) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }

    try {
      await repo.deleteExpense(cachedExpense.id);
    } catch (e) {
      showError("Couldn't delete. ${apiErrorMessage(e)}");
      return;
    }

    refreshExpenseData(container.invalidate, groupId: groupId);
    HapticFeedback.mediumImpact();
    if (context.mounted) {
      Navigator.pop(context); // go back to list
    }

    // One id for the undo, so a repeated undo cannot add the expense twice.
    final undoRequestId = newClientRequestId();
    final date = cachedExpense.date.toDate();
    // Undo re-creates the expense as the signed-in user, so it is offered
    // only for their own expense: restoring someone else's would make it
    // look like theirs.
    final isOwnExpense =
        container.read(currentUserProvider)?.uid == cachedExpense.userId;

    // Show undo SnackBar on parent scaffold
    messenger.showSnackBar(
      SnackBar(
        content: Text('${cachedExpense.vendor} deleted'),
        duration: const Duration(seconds: 5),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        // An action makes a SnackBar stay up until tapped; let it time out.
        persist: false,
        action: !isOwnExpense
            ? null
            : SnackBarAction(
                label: 'Undo',
                textColor: Colors.white,
                onPressed: () async {
                  // Re-create the expense from cached data — as a group expense
                  // again if it was one. The server only accepts the signed-in
                  // user as the author.
                  try {
                    await repo.saveExpense(
                      userId:
                          container.read(currentUserProvider)?.uid ??
                          cachedExpense.userId,
                      vendor: cachedExpense.vendor,
                      amount: cachedExpense.amount,
                      category: cachedExpense.category,
                      date:
                          '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
                      description: cachedExpense.description,
                      receiptUrl: cachedExpense.receiptUrl,
                      groupId: groupId,
                      clientRequestId: undoRequestId,
                    );
                    refreshExpenseData(container.invalidate, groupId: groupId);
                    HapticFeedback.mediumImpact();
                  } catch (e) {
                    showError(
                      "Couldn't restore ${cachedExpense.vendor}. "
                      '${apiErrorMessage(e)}',
                    );
                  }
                },
              ),
      ),
    );
  }

  void _showEditSheet(BuildContext context, WidgetRef ref) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _EditExpenseSheet(expense: expense, ref: ref),
    );
    // Return to the list (which has updated data) after a successful save
    if (saved == true && context.mounted) {
      Navigator.pop(context);
    }
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
  String? _vendorError;
  String? _amountError;

  @override
  void initState() {
    super.initState();
    _vendorController = TextEditingController(text: widget.expense.vendor);
    _amountController = TextEditingController(
      text: widget.expense.amount.toStringAsFixed(2),
    );
    _descriptionController = TextEditingController(
      text: widget.expense.description ?? '',
    );
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
    final amount = parseAmount(_amountController.text);
    setState(() {
      _vendorError = vendor.isEmpty ? 'Vendor name is required' : null;
      _amountError = amount == null ? 'Enter a valid amount' : null;
    });
    if (vendor.isEmpty || amount == null) return;

    // Guest expenses live on the device only.
    if (widget.ref.read(guestModeProvider)) {
      widget.ref
          .read(guestExpenseProvider.notifier)
          .update(
            widget.expense.id,
            vendor: vendor,
            amount: amount,
            category: _selectedCategory,
            date: _selectedDate,
            description: _descriptionController.text.trim(),
          );
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
      return;
    }

    setState(() => _saving = true);

    try {
      final user = widget.ref.read(currentUserProvider);
      final updates = {
        'vendor': vendor,
        'amount': amount,
        'category': _selectedCategory,
        'description': _descriptionController.text.trim(),
        'date':
            '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}',
      };

      await widget.ref
          .read(expenseRepositoryProvider)
          .updateExpense(
            expenseId: widget.expense.id,
            userId: user!.uid,
            updates: updates,
          );
      // The lists (and the detail opened from them) show the new values.
      refreshExpenseData(
        widget.ref.invalidate,
        groupId: widget.expense.expenseType == 'group'
            ? widget.expense.groupId
            : null,
      );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Couldn't save. ${apiErrorMessage(e)}"),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      // Scrolls when the keyboard leaves too little room for the form.
      child: Padding(
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
              decoration: InputDecoration(
                hintText: 'Vendor',
                errorText: _vendorError,
              ),
            ),
            const SizedBox(height: 12),

            // Amount
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                hintText: 'Amount',
                prefixText: '\$ ',
                errorText: _amountError,
              ),
            ),
            const SizedBox(height: 12),

            // Category dropdown
            DropdownButtonFormField<String>(
              initialValue: expenseCategories.contains(_selectedCategory)
                  ? _selectedCategory
                  : null,
              decoration: const InputDecoration(hintText: 'Category'),
              isExpanded: true,
              items: expenseCategories.map((c) {
                final short = c.length > 40 ? '${c.substring(0, 40)}...' : c;
                return DropdownMenuItem(
                  value: c,
                  child: Text(short, style: const TextStyle(fontSize: 14)),
                );
              }).toList(),
              onChanged: (v) {
                if (v != null) setState(() => _selectedCategory = v);
              },
            ),
            const SizedBox(height: 12),

            // Date picker
            Semantics(
              button: true,
              label:
                  'Select date, currently ${DateFormat('MMM d, y').format(_selectedDate)}',
              child: InkWell(
                onTap: () async {
                  final firstDate = DateTime(2020);
                  final lastDate = DateTime.now().add(const Duration(days: 1));
                  final picked = await showDatePicker(
                    context: context,
                    // Full keyboard so "/" can be typed; numeric pads on many
                    // Android keyboards have no separator key.
                    keyboardType: TextInputType.text,
                    initialDate: clampPickerDate(
                      _selectedDate,
                      firstDate,
                      lastDate,
                    ),
                    firstDate: firstDate,
                    lastDate: lastDate,
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
              decoration: const InputDecoration(
                hintText: 'Description (optional)',
              ),
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
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Save Changes'),
            ),
          ],
        ),
      ),
    );
  }
}
