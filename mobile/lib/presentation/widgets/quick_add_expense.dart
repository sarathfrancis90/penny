import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';
import 'package:penny_mobile/core/utils/amount_parser.dart';
import 'package:penny_mobile/core/utils/client_request_id.dart';
import 'package:penny_mobile/core/utils/picker_dates.dart';
import 'package:penny_mobile/data/guest/guest_expense_store.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/default_group_selection.dart';
import 'package:penny_mobile/presentation/providers/expense_refresh.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/budget_impact_preview.dart';
import 'package:penny_mobile/presentation/widgets/guest_sign_up_prompt.dart';
import 'package:penny_mobile/presentation/widgets/over_budget_warning_sheet.dart';
import 'package:penny_mobile/presentation/widgets/sheet_header.dart';
import 'package:penny_mobile/presentation/widgets/success_overlay.dart';

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

  /// One `clientRequestId` per save, reused when the same save is retried.
  final _saveAttempt = SaveAttemptId();

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
    if (_saving) return;
    final vendor = _vendorController.text.trim();
    final amount = parseAmount(_amountController.text);
    final category = _selectedCategory;
    if (vendor.isEmpty || amount == null || category == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please fill all required fields'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    // Guest mode: save locally and skip authenticated API calls.
    if (ref.read(guestModeProvider)) {
      final notifier = ref.read(guestExpenseProvider.notifier);
      final result = notifier.add(
        vendor: vendor,
        amount: amount,
        category: category,
        date: _selectedDate,
        description: _descController.text.trim(),
      );
      if (result == GuestAddResult.limitReached) {
        if (mounted) {
          showGuestSignUpPrompt(context, ref: ref);
        }
        return;
      }
      HapticFeedback.mediumImpact();
      if (mounted) {
        SuccessOverlay.show(
          context,
          title: vendor,
          subtitle: '\$${amount.toStringAsFixed(2)} saved locally',
        );
        Navigator.pop(context);
      }
      return;
    }

    final user = ref.read(currentUserProvider);
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Not signed in'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // Busy from here on, so a second tap cannot start a second save while
    // the duplicate check runs.
    setState(() => _saving = true);
    final groupId = _selectedGroupId;

    try {
      // A failed duplicate check counts as "none found": saving matters
      // more.
      final duplicateResult = await ref
          .read(duplicateDetectorProvider)
          .checkForDuplicateOrNull(
            vendor: vendor,
            amount: amount,
            date: _selectedDate,
            userId: user.uid,
            groupId: groupId,
          );
      if (!mounted) return;
      if (duplicateResult != null) {
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
        if (addAnyway != true || !mounted) return;
      }

      // Budget check for personal expenses
      if (groupId == null) {
        final usage = ref.read(budgetUsageForCategoryProvider(category));
        if (usage != null && usage.totalSpent + amount > usage.budgetLimit) {
          final proceed = await OverBudgetWarningSheet.show(
            context,
            category: category,
            budgetLimit: usage.budgetLimit,
            currentSpent: usage.totalSpent,
            expenseAmount: amount,
          );
          if (proceed != true || !mounted) return;
        }
      }

      final dateStr =
          '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';
      final description = _descController.text.trim();

      // A group expense also triggers notifications and stats server-side.
      await ref
          .read(expenseRepositoryProvider)
          .saveExpense(
            userId: user.uid,
            vendor: vendor,
            amount: amount,
            category: category,
            date: dateStr,
            description: description,
            groupId: groupId,
            clientRequestId: _saveAttempt.idFor({
              'vendor': vendor,
              'amount': amount,
              'category': category,
              'date': dateStr,
              'description': description,
              'groupId': groupId,
            }),
          );

      HapticFeedback.mediumImpact();
      if (mounted) {
        refreshExpenseData(ref.invalidate, groupId: groupId);

        final groupName = groupId != null
            ? ref
                      .read(userGroupsProvider)
                      .valueOrNull
                      ?.where((g) => g.id == groupId)
                      .firstOrNull
                      ?.name ??
                  'group'
            : null;

        // The confirmation does not block the screen, so the sheet closes
        // right away.
        SuccessOverlay.show(
          context,
          title: vendor,
          subtitle:
              '\$${amount.toStringAsFixed(2)} saved${groupName != null ? ' to $groupName' : ''}',
        );
        Navigator.pop(context);
      }
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

  Widget _buildGroupSelector(List<GroupModel> groups) {
    final items = <DropdownMenuItem<String>>[
      const DropdownMenuItem(
        value: '',
        child: Text('Personal', style: TextStyle(fontSize: 14)),
      ),
      ...groups.map(
        (g) => DropdownMenuItem(
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
        ),
      ),
    ];

    return DropdownButtonFormField<String>(
      initialValue: _selectedGroupId ?? '',
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
    final isGuest = ref.watch(guestModeProvider);
    // Only groups the user may add expenses to (viewers are left out); a
    // default group that is not among them falls back to Personal.
    final groupsAsync = ref.watch(addableGroupsProvider);
    final defaultGroupAsync = ref.watch(defaultGroupProvider);

    // Apply the saved default group once it and the groups list have loaded.
    if (!_defaultGroupApplied) {
      final selection = resolveDefaultGroup(
        defaultGroup: defaultGroupAsync,
        groups: groupsAsync,
      );
      if (selection.resolved) {
        _defaultGroupApplied = true;
        final defaultGroupId = selection.groupId;
        if (defaultGroupId != null && _selectedGroupId == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _selectedGroupId == null) {
              setState(() => _selectedGroupId = defaultGroupId);
            }
          });
        }
      }
    }

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final sheetHeight = constraints.maxHeight.isFinite
              ? constraints.maxHeight
              : MediaQuery.sizeOf(context).height * 0.92;

          return SizedBox(
            height: sheetHeight,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SheetHeader(
                  title: _selectedGroupId != null
                      ? 'Add Group Expense'
                      : 'Add Expense',
                ),
                if (isGuest) ...[
                  const SizedBox(height: 8),
                  Builder(
                    builder: (context) {
                      final notifier = ref.watch(guestExpenseProvider.notifier);
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.info_outline,
                              size: 16,
                              color: AppColors.primary,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '${notifier.count} of ${GuestExpenseNotifier.maxExpenses} expenses used',
                              style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(context).colorScheme.onSurface,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              'Local only',
                              style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ],
                const SizedBox(height: 12),
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _vendorController,
                          decoration: const InputDecoration(
                            hintText: 'Vendor / Merchant',
                          ),
                          textCapitalization: TextCapitalization.words,
                        ),
                        const SizedBox(height: 12),

                        TextField(
                          controller: _amountController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            hintText: 'Amount',
                            prefixText: '\$ ',
                          ),
                        ),
                        const SizedBox(height: 12),

                        DropdownButtonFormField<String>(
                          initialValue: _selectedCategory,
                          decoration: const InputDecoration(
                            hintText: 'Category',
                          ),
                          isExpanded: true,
                          menuMaxHeight: 300,
                          items: expenseCategories.map((c) {
                            final short = c.length > 40
                                ? '${c.substring(0, 40)}...'
                                : c;
                            return DropdownMenuItem(
                              value: c,
                              child: Text(
                                short,
                                style: const TextStyle(fontSize: 14),
                              ),
                            );
                          }).toList(),
                          onChanged: (v) =>
                              setState(() => _selectedCategory = v),
                        ),
                        const SizedBox(height: 12),

                        InkWell(
                          onTap: () async {
                            final now = DateTime.now();
                            final firstDate = isGuest
                                ? DateTime(now.year, now.month)
                                : DateTime(2020);
                            final lastDate = now.add(const Duration(days: 1));
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
                            if (picked != null) {
                              setState(() => _selectedDate = picked);
                            }
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
                                Icon(
                                  Icons.calendar_today_outlined,
                                  size: 18,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),

                        TextField(
                          controller: _descController,
                          decoration: const InputDecoration(
                            hintText: 'Description (optional)',
                          ),
                          maxLines: 2,
                        ),
                        const SizedBox(height: 12),

                        // Budget impact preview (personal only)
                        if (_selectedGroupId == null &&
                            _selectedCategory != null &&
                            (parseAmount(_amountController.text) ?? 0) > 0)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: BudgetImpactPreview(
                              category: _selectedCategory!,
                              amount: parseAmount(_amountController.text) ?? 0,
                            ),
                          ),

                        // Group selector (hidden for guests)
                        if (!isGuest) ...[
                          groupsAsync.when(
                            data: (groups) => groups.isEmpty
                                ? const SizedBox.shrink()
                                : _buildGroupSelector(groups),
                            loading: () => const SizedBox.shrink(),
                            error: (_, _) => const SizedBox.shrink(),
                          ),
                          if (_selectedGroupId != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              'This expense will be shared with the group',
                              style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ],
                        const SizedBox(height: 12),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
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
                      : Text(
                          _selectedGroupId != null
                              ? 'Add Group Expense'
                              : 'Add Expense',
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
