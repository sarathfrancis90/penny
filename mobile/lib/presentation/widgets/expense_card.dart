import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/over_budget_warning_sheet.dart';

/// Expense confirmation form displayed as a bottom panel in HomeScreen.
///
/// All fields are stacked vertically (full-width) to avoid unbounded width
/// issues from Row+Expanded patterns. The form is split into a scrollable
/// fields area and a pinned action button area.
class ExpenseCard extends ConsumerStatefulWidget {
  const ExpenseCard({
    super.key,
    required this.expense,
    this.receiptUrl,
    this.onSaved,
    this.onDismiss,
    this.confirmed = false,
    this.saveTrigger,
    this.savingNotifier,
  });

  final ParsedExpense expense;
  final String? receiptUrl;
  final VoidCallback? onSaved;
  final VoidCallback? onDismiss;
  final bool confirmed;
  /// When set, the card registers its save method with this notifier
  /// so an external widget (e.g. a pinned button) can trigger save.
  final ValueNotifier<VoidCallback?>? saveTrigger;
  /// When set, the card pushes its saving state to this notifier
  /// so an external widget can show a spinner.
  final ValueNotifier<bool>? savingNotifier;

  @override
  ConsumerState<ExpenseCard> createState() => _ExpenseCardState();
}

class _ExpenseCardState extends ConsumerState<ExpenseCard> {
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

    _category = expenseCategories.contains(widget.expense.category)
        ? widget.expense.category
        : expenseCategories.first;

    _date = _parseDate(widget.expense.date);

    _amountController.addListener(() {
      if (mounted) setState(() {});
    });

    // Register save callback so external widgets can trigger save.
    widget.saveTrigger?.value = _save;
  }

  @override
  void dispose() {
    widget.saveTrigger?.value = null;
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

    // Duplicate check
    final duplicateResult =
        await ref.read(duplicateDetectorProvider).checkForDuplicate(
              vendor: vendor,
              amount: amount,
              date: _date,
              userId: user.uid,
              groupId: _selectedGroupId,
            );
    if (duplicateResult != null) {
      if (!mounted) return;
      final addAnyway = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Possible Duplicate'),
          content: Text(duplicateResult.warningMessage),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Add Anyway'),
            ),
          ],
        ),
      );
      if (addAnyway != true) return;
    }

    // Budget check for personal expenses
    if (_selectedGroupId == null) {
      final usage = ref.read(budgetUsageForCategoryProvider(_category));
      if (usage != null && usage.totalSpent + amount > usage.budgetLimit) {
        if (!mounted) return;
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
    widget.savingNotifier?.value = true;

    try {
      final dateStr = DateFormat('yyyy-MM-dd').format(_date);
      final description = _descriptionController.text.trim();

      if (_selectedGroupId != null) {
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
      }
    } catch (e) {
      if (mounted) {
        _showError('Failed to save: $e');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
      widget.savingNotifier?.value = false;
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

  /// Short display name for the category (used in the budget impact line).
  String get _shortCategory {
    if (_category.startsWith('Home Office - ')) {
      return _category.replaceFirst('Home Office - ', 'Home: ');
    }
    if (_category.startsWith('Vehicle - ')) {
      return _category.replaceFirst('Vehicle - ', 'Vehicle: ');
    }
    final parenIndex = _category.indexOf('(');
    if (parenIndex > 0) return _category.substring(0, parenIndex).trim();
    return _category;
  }

  @override
  Widget build(BuildContext context) {
    // If already confirmed, show the compact saved state
    if (widget.confirmed) {
      return _buildConfirmedCard(context);
    }

    final theme = Theme.of(context);
    final groupsAsync = ref.watch(userGroupsProvider);
    final defaultGroupAsync = ref.watch(defaultGroupProvider);

    // Apply default group once when data becomes available.
    if (!_defaultGroupApplied) {
      defaultGroupAsync.whenData((defaultGroupId) {
        if (defaultGroupId != null && _selectedGroupId == null) {
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

    final inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: theme.dividerColor),
    );
    final focusedInputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
    );

    return Semantics(
      label: 'Expense confirmation form: '
          '${_vendorController.text}, \$${_amountController.text}, '
          '$_category',
      container: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // -- Header with confidence badge --
          _buildHeader(theme),

          const SizedBox(height: 8),

          // -- Vendor --
          _buildFieldLabel(theme, Icons.store_outlined, 'Vendor'),
          const SizedBox(height: 4),
          TextField(
            controller: _vendorController,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            style: TextStyle(
              fontSize: 14,
              color: theme.colorScheme.onSurface,
            ),
            decoration: InputDecoration(
              hintText: 'Vendor name',
              hintStyle: TextStyle(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 10,
              ),
              border: inputBorder,
              enabledBorder: inputBorder,
              focusedBorder: focusedInputBorder,
            ),
          ),

          const SizedBox(height: 6),

          // -- Amount --
          _buildFieldLabel(theme, Icons.attach_money, 'Amount'),
          const SizedBox(height: 4),
          TextField(
            controller: _amountController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: theme.colorScheme.onSurface,
            ),
            decoration: InputDecoration(
              hintText: '0.00',
              prefixText: '\$ ',
              prefixStyle: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: theme.colorScheme.onSurface,
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 10,
              ),
              border: inputBorder,
              enabledBorder: inputBorder,
              focusedBorder: focusedInputBorder,
            ),
          ),

          const SizedBox(height: 6),

          // -- Category dropdown --
          _buildFieldLabel(theme, Icons.category_outlined, 'Category'),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            initialValue: _category,
            isExpanded: true,
            isDense: true,
            style: TextStyle(
              fontSize: 13,
              color: theme.colorScheme.onSurface,
            ),
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 10,
              ),
              border: inputBorder,
              enabledBorder: inputBorder,
              focusedBorder: focusedInputBorder,
            ),
            menuMaxHeight: 300,
            items: _buildCategoryItems(theme),
            onChanged: _saving
                ? null
                : (v) {
                    if (v != null) setState(() => _category = v);
                  },
          ),

          const SizedBox(height: 6),

          // -- Date picker --
          _buildFieldLabel(theme, Icons.calendar_today_outlined, 'Date'),
          const SizedBox(height: 4),
          InkWell(
            onTap: _saving ? null : _pickDate,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 10,
              ),
              decoration: BoxDecoration(
                border: Border.all(color: theme.dividerColor),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                DateFormat('MMM d, yyyy').format(_date),
                style: TextStyle(
                  fontSize: 14,
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ),
          ),

          const SizedBox(height: 6),

          // -- Notes (optional) --
          _buildFieldLabel(theme, Icons.notes_outlined, 'Notes'),
          const SizedBox(height: 4),
          TextField(
            controller: _descriptionController,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.done,
            maxLines: 1,
            style: TextStyle(
              fontSize: 13,
              color: theme.colorScheme.onSurface,
            ),
            decoration: InputDecoration(
              hintText: 'Optional',
              hintStyle: TextStyle(
                color: theme.colorScheme.onSurfaceVariant,
                fontSize: 13,
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 10,
              ),
              border: inputBorder,
              enabledBorder: inputBorder,
              focusedBorder: focusedInputBorder,
            ),
          ),

          const SizedBox(height: 6),

          // -- Group selector --
          _buildFieldLabel(theme, Icons.group_outlined, 'Group'),
          const SizedBox(height: 4),
          groupsAsync.when(
            data: (groups) =>
                _buildGroupSelector(groups, theme, inputBorder, focusedInputBorder),
            loading: () => Container(
              height: 38,
              decoration: BoxDecoration(
                border: Border.all(color: theme.dividerColor),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
            error: (_, _) =>
                _buildGroupSelector([], theme, inputBorder, focusedInputBorder),
          ),

          const SizedBox(height: 10),

          // -- Budget impact (compact single-line) --
          _buildBudgetImpactLine(theme),
        ],
      ),
    );
  }

  /// Compact confirmed state shown after the expense has been saved.
  Widget _buildConfirmedCard(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      label: '${widget.expense.vendor}, ${widget.expense.category}, '
          '\$${widget.expense.amount.toStringAsFixed(2)}, saved',
      container: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppColors.success.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_circle, size: 18, color: AppColors.success),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                widget.expense.vendor,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurface,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '\$${widget.expense.amount.toStringAsFixed(2)}',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurface,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Saved',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.success,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Label row above each form field with an icon.
  Widget _buildFieldLabel(ThemeData theme, IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.primary),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  /// Header row with receipt icon, title, and confidence badge.
  Widget _buildHeader(ThemeData theme) {
    return Row(
      children: [
        Icon(
          Icons.receipt_long_outlined,
          size: 18,
          color: AppColors.primary,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            'Confirm Expense',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onSurface,
            ),
          ),
        ),
        if (widget.expense.confidence != null) ...[
          const SizedBox(width: 8),
          _ConfidenceBadge(confidence: widget.expense.confidence!),
        ],
      ],
    );
  }

  /// Compact single-line budget impact preview.
  Widget _buildBudgetImpactLine(ThemeData theme) {
    final amount = double.tryParse(_amountController.text.trim()) ?? 0;
    if (amount <= 0 || _selectedGroupId != null) {
      return const SizedBox.shrink();
    }

    final usage = ref.watch(budgetUsageForCategoryProvider(_category));
    if (usage == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest
              .withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(
              Icons.info_outline,
              size: 14,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                'No budget set for $_shortCategory',
                style: TextStyle(
                  fontSize: 12,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }

    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final projectedSpent = usage.totalSpent + amount;
    final projectedPct = usage.budgetLimit > 0
        ? (projectedSpent / usage.budgetLimit * 100)
        : 0.0;
    final projectedStatus = BudgetUsage.computeStatus(projectedPct);

    final statusColor = switch (projectedStatus) {
      BudgetStatus.safe => AppColors.primary,
      BudgetStatus.warning => AppColors.warning,
      BudgetStatus.critical => AppColors.error,
      BudgetStatus.over => AppColors.error,
    };
    final statusLabel = switch (projectedStatus) {
      BudgetStatus.safe => 'Safe',
      BudgetStatus.warning => 'Warning',
      BudgetStatus.critical => 'Critical',
      BudgetStatus.over => 'Over',
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(
            projectedStatus == BudgetStatus.over
                ? Icons.warning_amber_rounded
                : Icons.account_balance_wallet_outlined,
            size: 14,
            color: statusColor,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              'Budget: ${formatter.format(usage.totalSpent)} → '
              '${formatter.format(projectedSpent)} of '
              '${formatter.format(usage.budgetLimit)}',
              style: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onSurface,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              statusLabel,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: statusColor,
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<DropdownMenuItem<String>> _buildCategoryItems(ThemeData theme) {
    final items = <DropdownMenuItem<String>>[];
    for (final entry in categoryGroups.entries) {
      items.add(DropdownMenuItem<String>(
        enabled: false,
        value: '__header_${entry.key}',
        child: Text(
          entry.key.toUpperCase(),
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: theme.colorScheme.onSurfaceVariant,
            letterSpacing: 0.5,
          ),
        ),
      ));
      for (final cat in entry.value) {
        items.add(DropdownMenuItem<String>(
          value: cat,
          child: Text(
            cat,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13),
          ),
        ));
      }
    }
    return items;
  }

  Widget _buildGroupSelector(
    List<GroupModel> groups,
    ThemeData theme,
    OutlineInputBorder inputBorder,
    OutlineInputBorder focusedInputBorder,
  ) {
    return DropdownButtonFormField<String>(
      key: ValueKey('group_${_selectedGroupId ?? '__personal__'}'),
      initialValue: _selectedGroupId ?? '__personal__',
      isDense: true,
      style: TextStyle(
        fontSize: 13,
        color: theme.colorScheme.onSurface,
      ),
      decoration: InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 10,
          vertical: 10,
        ),
        border: inputBorder,
        enabledBorder: inputBorder,
        focusedBorder: focusedInputBorder,
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
            child: Text(
              '${g.icon ?? ''} ${g.name}'.trim(),
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13),
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

/// Small confidence badge showing AI confidence percentage.
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
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome, size: 11, color: color),
          const SizedBox(width: 3),
          Text(
            '$pct%',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
