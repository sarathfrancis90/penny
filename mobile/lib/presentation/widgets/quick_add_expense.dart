import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/budget_impact_preview.dart';
import 'package:penny_mobile/presentation/widgets/over_budget_warning_sheet.dart';

/// Manual expense creation form — for adding expenses without AI.
/// Show via: showModalBottomSheet(builder: (_) => QuickAddExpense(groupId: ...))
class QuickAddExpense extends ConsumerStatefulWidget {
  const QuickAddExpense({super.key, this.groupId});

  final String? groupId; // If set, pre-selects this group

  @override
  ConsumerState<QuickAddExpense> createState() => _QuickAddExpenseState();
}

class _QuickAddExpenseState extends ConsumerState<QuickAddExpense> {
  final _vendorController = TextEditingController();
  final _amountController = TextEditingController();
  final _descController = TextEditingController();
  String? _selectedCategory;
  DateTime _selectedDate = DateTime.now();
  String? _selectedGroupId;
  bool _defaultGroupApplied = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Pre-select group if passed explicitly (e.g. from group detail screen).
    _selectedGroupId = widget.groupId;
    if (widget.groupId != null) _defaultGroupApplied = true;

    // Trigger rebuild for live budget impact preview.
    _amountController.addListener(() => setState(() {}));
  }

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

    // Budget check for personal expenses
    if (_selectedGroupId == null) {
      final usage = ref.read(budgetUsageForCategoryProvider(_selectedCategory!));
      if (usage != null && usage.totalSpent + amount > usage.budgetLimit) {
        final proceed = await OverBudgetWarningSheet.show(
          context,
          category: _selectedCategory!,
          budgetLimit: usage.budgetLimit,
          currentSpent: usage.totalSpent,
          expenseAmount: amount,
        );
        if (proceed != true) return;
      }
    }

    setState(() => _saving = true);

    try {
      final user = ref.read(currentUserProvider);
      if (user == null) return;

      final dateStr =
          '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

      if (_selectedGroupId != null) {
        // Group expense — use API (triggers notifications + stats)
        await ref.read(apiClientProvider).post(
          '/api/expenses',
          data: {
            'vendor': vendor,
            'amount': amount,
            'category': _selectedCategory,
            'date': dateStr,
            'description': _descController.text.trim(),
            'userId': user.uid,
            'groupId': _selectedGroupId,
          },
        );
      } else {
        // Personal expense — direct Firestore
        await ref.read(expenseRepositoryProvider).savePersonalExpense(
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

        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(label),
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

  Widget _buildGroupSelector(List<GroupModel> groups) {
    final items = <DropdownMenuItem<String>>[
      const DropdownMenuItem(
        value: '',
        child: Text('Personal', style: TextStyle(fontSize: 14)),
      ),
      ...groups.map((g) => DropdownMenuItem(
            value: g.id,
            child: Row(
              children: [
                Text(g.icon ?? '👥', style: const TextStyle(fontSize: 16)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    g.name,
                    style: const TextStyle(fontSize: 14),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          )),
    ];

    return DropdownButtonFormField<String>(
      value: _selectedGroupId ?? '',
      decoration: const InputDecoration(hintText: 'Assign to'),
      isExpanded: true,
      items: items,
      onChanged: _saving
          ? null
          : (v) {
              setState(() {
                _selectedGroupId = (v == null || v.isEmpty) ? null : v;
              });
            },
    );
  }

  @override
  Widget build(BuildContext context) {
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
              _selectedGroupId != null ? 'Add Group Expense' : 'Add Expense',
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
              menuMaxHeight: 300,
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
                    Icon(Icons.calendar_today_outlined, size: 18,
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
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
            const SizedBox(height: 12),

            // Budget impact preview (personal only)
            if (_selectedGroupId == null &&
                _selectedCategory != null &&
                (double.tryParse(_amountController.text.trim()) ?? 0) > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: BudgetImpactPreview(
                  category: _selectedCategory!,
                  amount: double.tryParse(_amountController.text.trim()) ?? 0,
                ),
              ),

            // Group selector
            groupsAsync.when(
              data: (groups) => groups.isEmpty
                  ? const SizedBox.shrink()
                  : _buildGroupSelector(groups),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            if (_selectedGroupId != null) ...[
              const SizedBox(height: 4),
              Text(
                'This expense will be shared with the group',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ],
            const SizedBox(height: 20),

            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(height: 20, width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(_selectedGroupId != null ? 'Add Group Expense' : 'Add Expense'),
            ),
          ],
        ),
      ),
    );
  }
}
