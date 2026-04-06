import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/budget_impact_preview.dart';
import 'package:penny_mobile/presentation/widgets/over_budget_warning_sheet.dart';

/// A modal bottom sheet for confirming and editing an AI-parsed expense before
/// saving. Supports personal and group expense flows.
///
/// When a group is selected the expense is saved via the Next.js API
/// (`POST /api/expenses`) which handles group stats, activity log and member
/// notifications. Personal expenses are written directly to Firestore.
class ExpenseConfirmationSheet extends ConsumerStatefulWidget {
  const ExpenseConfirmationSheet({
    super.key,
    required this.expense,
    this.receiptUrl,
    this.onSaved,
  });

  final ParsedExpense expense;

  /// Download URL of the receipt image in Firebase Storage (may be null).
  final String? receiptUrl;

  /// Called after the expense has been successfully saved.
  final VoidCallback? onSaved;

  /// Show this sheet as a modal bottom sheet and return `true` when the
  /// expense was saved successfully, or `null` if dismissed.
  static Future<bool?> show(
    BuildContext context, {
    required ParsedExpense expense,
    String? receiptUrl,
    VoidCallback? onSaved,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ExpenseConfirmationSheet(
        expense: expense,
        receiptUrl: receiptUrl,
        onSaved: onSaved,
      ),
    );
  }

  @override
  ConsumerState<ExpenseConfirmationSheet> createState() =>
      _ExpenseConfirmationSheetState();
}

class _ExpenseConfirmationSheetState
    extends ConsumerState<ExpenseConfirmationSheet> {
  late final TextEditingController _vendorController;
  late final TextEditingController _amountController;
  late final TextEditingController _descriptionController;
  late String _category;
  late DateTime _date;

  /// `null` means "Personal" (no group).
  String? _selectedGroupId;

  bool _saving = false;
  bool _defaultGroupApplied = false;

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

    // Ensure the AI-suggested category is valid; fall back to first category.
    _category = expenseCategories.contains(widget.expense.category)
        ? widget.expense.category
        : expenseCategories.first;

    _date = _parseDate(widget.expense.date);

    // Trigger rebuild for live budget impact preview.
    _amountController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _vendorController.dispose();
    _amountController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  DateTime _parseDate(String dateStr) {
    try {
      final parts = dateStr.split('-').map(int.parse).toList();
      if (parts.length == 3) {
        return DateTime(parts[0], parts[1], parts[2]);
      }
    } catch (_) {}
    return DateTime.now();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _save() async {
    // Basic validation
    final vendor = _vendorController.text.trim();
    if (vendor.isEmpty) {
      _showError('Vendor name is required');
      return;
    }

    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      _showError('Enter a valid amount');
      return;
    }

    final user = ref.read(currentUserProvider);
    if (user == null) {
      _showError('Not signed in');
      return;
    }

    // Budget check for personal expenses
    if (_selectedGroupId == null) {
      final usage = ref.read(budgetUsageForCategoryProvider(_category));
      if (usage != null && usage.totalSpent + amount > usage.budgetLimit) {
        final proceed = await OverBudgetWarningSheet.show(
          context,
          category: _category,
          budgetLimit: usage.budgetLimit,
          currentSpent: usage.totalSpent,
          expenseAmount: amount,
        );
        if (proceed != true) return;
      }
    }

    setState(() => _saving = true);

    try {
      final dateStr = DateFormat('yyyy-MM-dd').format(_date);
      final description = _descriptionController.text.trim();

      if (_selectedGroupId != null) {
        // Group expense — route through the API for atomic operations
        // (group stats update, activity log, member notifications).
        await ref.read(apiClientProvider).post(
          ApiEndpoints.expenses,
          data: {
            'userId': user.uid,
            'vendor': vendor,
            'amount': amount,
            'category': _category,
            'date': dateStr,
            'description': description,
            'groupId': _selectedGroupId,
            'expenseType': 'group',
            if (widget.receiptUrl != null) 'receiptUrl': widget.receiptUrl,
          },
        );
      } else {
        // Personal expense — direct Firestore write
        await ref.read(expenseRepositoryProvider).savePersonalExpense(
              userId: user.uid,
              vendor: vendor,
              amount: amount,
              category: _category,
              date: dateStr,
              description: description,
              receiptUrl: widget.receiptUrl,
            );
      }

      HapticFeedback.mediumImpact();

      if (mounted) {
        final groupName = _selectedGroupId != null
            ? ref
                  .read(userGroupsProvider)
                  .valueOrNull
                  ?.where((g) => g.id == _selectedGroupId)
                  .firstOrNull
                  ?.name ??
              'group'
            : null;

        final label = groupName != null
            ? '$vendor — \$${amount.toStringAsFixed(2)} saved to $groupName'
            : '$vendor — \$${amount.toStringAsFixed(2)} saved';

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(label),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );

        widget.onSaved?.call();
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        _showError('Failed to save: $e');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(userGroupsProvider);
    final defaultGroupAsync = ref.watch(defaultGroupProvider);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    // Apply default group once when data becomes available.
    if (!_defaultGroupApplied) {
      defaultGroupAsync.whenData((defaultGroupId) {
        if (defaultGroupId != null && _selectedGroupId == null) {
          // Verify the default group is still in the user's groups list.
          final groups = groupsAsync.valueOrNull ?? [];
          final exists = groups.any((g) => g.id == defaultGroupId);
          if (exists) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _selectedGroupId = defaultGroupId);
            });
          }
        }
        _defaultGroupApplied = true;
      });
    }

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 16,
        bottom: bottomInset + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.receipt_long_outlined,
                      color: AppColors.primary, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Confirm Expense',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w700)),
                      const Text('Review and edit details',
                          style: TextStyle(
                              fontSize: 13, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                if (widget.expense.confidence != null)
                  _ConfidenceBadge(confidence: widget.expense.confidence!),
              ],
            ),
            const SizedBox(height: 20),

            // Receipt thumbnail
            if (widget.receiptUrl != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(
                  widget.receiptUrl!,
                  height: 100,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Vendor
            _FieldLabel(icon: Icons.store_outlined, label: 'Vendor'),
            const SizedBox(height: 6),
            TextField(
              controller: _vendorController,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(hintText: 'Vendor / merchant'),
            ),
            const SizedBox(height: 14),

            // Amount
            _FieldLabel(icon: Icons.attach_money, label: 'Amount'),
            const SizedBox(height: 6),
            TextField(
              controller: _amountController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                hintText: '0.00',
                prefixText: '\$ ',
                prefixStyle: TextStyle(
                    fontWeight: FontWeight.w600, color: AppColors.textPrimary),
              ),
            ),
            const SizedBox(height: 14),

            // Category
            _FieldLabel(icon: Icons.category_outlined, label: 'Category'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _category,
              isExpanded: true,
              decoration: const InputDecoration(
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              ),
              menuMaxHeight: 300,
              items: _buildCategoryItems(),
              onChanged: _saving
                  ? null
                  : (v) {
                      if (v != null) setState(() => _category = v);
                    },
            ),
            const SizedBox(height: 14),

            // Date
            _FieldLabel(icon: Icons.calendar_today_outlined, label: 'Date'),
            const SizedBox(height: 6),
            InkWell(
              onTap: _saving ? null : _pickDate,
              borderRadius: BorderRadius.circular(12),
              child: InputDecorator(
                decoration: const InputDecoration(
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                ),
                child: Text(
                  DateFormat('MMM d, yyyy').format(_date),
                  style: const TextStyle(fontSize: 15),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Description (optional)
            _FieldLabel(
                icon: Icons.notes_outlined,
                label: 'Description',
                optional: true),
            const SizedBox(height: 6),
            TextField(
              controller: _descriptionController,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 2,
              decoration:
                  const InputDecoration(hintText: 'Additional notes...'),
            ),
            const SizedBox(height: 14),

            // Budget impact preview (personal only)
            if (_selectedGroupId == null &&
                (double.tryParse(_amountController.text.trim()) ?? 0) > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: BudgetImpactPreview(
                  category: _category,
                  amount: double.tryParse(_amountController.text.trim()) ?? 0,
                ),
              ),

            // Group selector
            _FieldLabel(icon: Icons.group_outlined, label: 'Assign to'),
            const SizedBox(height: 6),
            groupsAsync.when(
              data: (groups) => _buildGroupSelector(groups),
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => _buildGroupSelector([]),
            ),
            const SizedBox(height: 6),
            Text(
              _selectedGroupId != null
                  ? 'This expense will be shared with the group'
                  : 'This is a personal expense',
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 24),

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed:
                          _saving ? null : () => Navigator.pop(context),
                      child: const Text('Cancel'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.check_circle_outline, size: 18),
                                SizedBox(width: 6),
                                Text('Confirm & Save'),
                              ],
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<DropdownMenuItem<String>> _buildCategoryItems() {
    final items = <DropdownMenuItem<String>>[];
    for (final entry in categoryGroups.entries) {
      // Group header (disabled)
      items.add(DropdownMenuItem<String>(
        enabled: false,
        value: '__header_${entry.key}',
        child: Text(
          entry.key.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary,
            letterSpacing: 0.5,
          ),
        ),
      ));
      // Category items
      for (final cat in entry.value) {
        items.add(DropdownMenuItem<String>(
          value: cat,
          child: Text(cat,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14)),
        ));
      }
    }
    return items;
  }

  Widget _buildGroupSelector(List<GroupModel> groups) {
    return DropdownButtonFormField<String>(
      value: _selectedGroupId ?? '__personal__',
      isExpanded: true,
      decoration: const InputDecoration(
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        prefixIcon: Icon(Icons.group_outlined, size: 20),
      ),
      items: [
        const DropdownMenuItem<String>(
          value: '__personal__',
          child: Text('Personal'),
        ),
        if (groups.isNotEmpty)
          const DropdownMenuItem<String>(
            enabled: false,
            value: '__divider__',
            child: Divider(height: 1),
          ),
        ...groups.map(
          (g) => DropdownMenuItem<String>(
            value: g.id,
            child: Row(
              children: [
                Text(g.icon ?? '', style: const TextStyle(fontSize: 16)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(g.name,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14)),
                ),
              ],
            ),
          ),
        ),
      ],
      onChanged: _saving
          ? null
          : (v) {
              setState(() {
                _selectedGroupId =
                    (v == '__personal__' || v == null) ? null : v;
              });
            },
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({
    required this.icon,
    required this.label,
    this.optional = false,
  });

  final IconData icon;
  final String label;
  final bool optional;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.primary),
        const SizedBox(width: 6),
        Text(label,
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600)),
        if (optional) ...[
          const SizedBox(width: 4),
          const Text('(optional)',
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ],
      ],
    );
  }
}

class _ConfidenceBadge extends StatelessWidget {
  const _ConfidenceBadge({required this.confidence});
  final double confidence;

  @override
  Widget build(BuildContext context) {
    final pct = (confidence * 100).round();
    final color = confidence >= 0.8
        ? AppColors.success
        : confidence >= 0.6
            ? AppColors.warning
            : AppColors.error;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome, size: 12, color: color),
          const SizedBox(width: 4),
          Text('$pct%',
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}
