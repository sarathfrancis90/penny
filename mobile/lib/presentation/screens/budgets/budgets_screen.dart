import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/animated_counter.dart';
import 'package:penny_mobile/presentation/widgets/animated_list_item.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';

class BudgetsScreen extends ConsumerWidget {
  const BudgetsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budgetsAsync = ref.watch(budgetsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Budgets'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.primary),
            tooltip: 'Create budget',
            onPressed: () => _showCreateBudget(context, ref),
          ),
        ],
      ),
      body: budgetsAsync.when(
        data: (_) => const _BudgetsContent(),
        loading: () => const ShimmerCardAndCards(cardCount: 3),
        error: (e, _) => ErrorState(
          message: 'Could not load budgets',
          onRetry: () => ref.invalidate(budgetsProvider),
        ),
      ),
    );
  }

  void _showCreateBudget(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CreateBudgetSheet(ref: ref),
    );
  }
}

class _BudgetsContent extends ConsumerWidget {
  const _BudgetsContent();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usage = ref.watch(budgetUsageProvider);
    final totalLimit = ref.watch(totalBudgetLimitProvider);
    final totalSpent = ref.watch(totalBudgetSpentProvider);
    final period = ref.watch(budgetPeriodProvider);
    final percentage = totalLimit > 0 ? (totalSpent / totalLimit * 100) : 0.0;
    final remaining = totalLimit - totalSpent;
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final monthName = DateFormat('MMMM yyyy')
        .format(DateTime(period.year, period.month));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(budgetsProvider),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 8),

          // Monthly summary card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Text(monthName,
                    style: TextStyle(
                        fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const SizedBox(height: 16),

                // Progress ring
                Semantics(
                  label: 'Budget progress: ${percentage.toStringAsFixed(0)} percent, '
                      '${formatter.format(totalSpent)} spent of ${formatter.format(totalLimit)}',
                  value: '${percentage.toStringAsFixed(0)} percent',
                  child: TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 0, end: percentage.clamp(0, 100)),
                    duration: const Duration(milliseconds: 1200),
                    curve: Curves.easeOutBack,
                    builder: (context, animatedPercentage, child) {
                      return SizedBox(
                        width: 140,
                        height: 140,
                        child: CustomPaint(
                          painter: _ProgressRingPainter(
                            percentage: animatedPercentage,
                            color: BudgetUsage.computeStatus(percentage) ==
                                    BudgetStatus.safe
                                ? AppColors.primary
                                : BudgetUsage.computeStatus(percentage) ==
                                        BudgetStatus.warning
                                    ? AppColors.warning
                                    : AppColors.error,
                            trackColor: Theme.of(context).dividerColor,
                          ),
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('Spent',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
                                AnimatedCounter(
                                    value: totalSpent,
                                    decimals: 0,
                                    style: const TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.w700)),
                                Text('of ${formatter.format(totalLimit)}',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  '${formatter.format(remaining)} remaining',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: remaining >= 0
                        ? AppColors.success
                        : AppColors.error,
                  ),
                ),
                Text(
                  '${percentage.toStringAsFixed(0)}% of monthly limit reached',
                  style: TextStyle(
                      fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Category budgets
          if (usage.isEmpty)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.account_balance_wallet_outlined,
                        size: 48, color: Theme.of(context).hintColor),
                    SizedBox(height: 12),
                    Text('No budgets yet',
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    SizedBox(height: 4),
                    Text('Tap + to create your first budget',
                        style: TextStyle(
                            fontSize: 14, color: Theme.of(context).hintColor)),
                  ],
                ),
              ),
            )
          else ...[
            Text('CATEGORIES',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    letterSpacing: 1)),
            const SizedBox(height: 12),
            ...usage.asMap().entries.map((entry) {
              final budgets = ref.watch(budgetsProvider).valueOrNull ?? [];
              final budget = budgets.where(
                (b) => b.category == entry.value.category,
              ).firstOrNull;
              return AnimatedListItem(
                index: entry.key,
                child: _BudgetCategoryCard(
                  usage: entry.value,
                  budget: budget,
                ),
              );
            }),
          ],

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _BudgetCategoryCard extends ConsumerWidget {
  const _BudgetCategoryCard({required this.usage, this.budget});

  final BudgetUsage usage;
  final BudgetModel? budget;

  Color get _statusColor => switch (usage.status) {
        BudgetStatus.safe => AppColors.success,
        BudgetStatus.warning => AppColors.warning,
        BudgetStatus.critical => AppColors.error,
        BudgetStatus.over => AppColors.error,
      };

  String get _statusLabel => switch (usage.status) {
        BudgetStatus.safe => 'Safe',
        BudgetStatus.warning => 'Warning',
        BudgetStatus.critical => 'Critical',
        BudgetStatus.over => 'Over',
      };

  Color get _barColor => switch (usage.status) {
        BudgetStatus.safe => AppColors.primary,
        BudgetStatus.warning => AppColors.warning,
        BudgetStatus.critical => AppColors.error,
        BudgetStatus.over => AppColors.error,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final label = _shortenCategory(usage.category);

    return Semantics(
      container: true,
      label: '$label budget: ${formatter.format(usage.totalSpent)} of '
          '${formatter.format(usage.budgetLimit)}, '
          '${usage.percentageUsed.toStringAsFixed(0)} percent, '
          'Status: $_statusLabel',
      child: GestureDetector(
        onTap: budget != null
            ? () => showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => _EditBudgetSheet(
                    ref: ref,
                    budget: budget!,
                    category: label,
                  ),
                )
            : null,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(label,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                  Text(
                    '${formatter.format(usage.totalSpent)} / ${formatter.format(usage.budgetLimit)}',
                    style: TextStyle(
                        fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Semantics(
                label: '${usage.percentageUsed.toStringAsFixed(0)} percent used',
                value: '${usage.percentageUsed.toStringAsFixed(0)} percent',
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (usage.percentageUsed / 100).clamp(0.0, 1.0),
                    minHeight: 8,
                    backgroundColor: Theme.of(context).dividerColor,
                    valueColor: AlwaysStoppedAnimation<Color>(_barColor),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Semantics(
                    label: 'Status: $_statusLabel',
                    child: _StatusBadge(label: _statusLabel, color: _statusColor),
                  ),
                  const Spacer(),
                  Text(
                    '${usage.percentageUsed.toStringAsFixed(0)}%',
                    style: TextStyle(
                        fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _shortenCategory(String category) {
    if (category.startsWith('Home Office - ')) {
      return category.replaceFirst('Home Office - ', 'Home: ');
    }
    if (category.startsWith('Vehicle - ')) {
      return category.replaceFirst('Vehicle - ', 'Vehicle: ');
    }
    final parenIndex = category.indexOf('(');
    if (parenIndex > 0) return category.substring(0, parenIndex).trim();
    return category;
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _ProgressRingPainter extends CustomPainter {
  _ProgressRingPainter({required this.percentage, required this.color, required this.trackColor});

  final double percentage;
  final Color color;
  final Color trackColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 8;
    const strokeWidth = 10.0;

    // Background ring
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..color = trackColor,
    );

    // Progress arc
    final sweepAngle = (percentage / 100) * 2 * math.pi;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      sweepAngle,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(covariant _ProgressRingPainter old) =>
      old.percentage != percentage || old.color != color || old.trackColor != trackColor;
}

class _CreateBudgetSheet extends StatefulWidget {
  const _CreateBudgetSheet({required this.ref});

  final WidgetRef ref;

  @override
  State<_CreateBudgetSheet> createState() => _CreateBudgetSheetState();
}

class _CreateBudgetSheetState extends State<_CreateBudgetSheet> {
  final _amountController = TextEditingController();
  String? _selectedCategory;
  bool _saving = false;
  bool _rollover = false;
  double _alertThreshold = 80.0;
  bool _notificationsEnabled = true;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountController.text.trim());
    if (_selectedCategory == null || amount == null || amount <= 0) return;

    setState(() => _saving = true);

    try {
      final user = widget.ref.read(currentUserProvider);
      final period = widget.ref.read(budgetPeriodProvider);
      await widget.ref.read(budgetRepositoryProvider).createBudget(
            userId: user!.uid,
            category: _selectedCategory!,
            monthlyLimit: amount,
            period: period,
            settings: BudgetSettings(
              rollover: _rollover,
              alertThreshold: _alertThreshold,
              notificationsEnabled: _notificationsEnabled,
            ),
          );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context);
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Create Budget',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),

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

          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
                hintText: 'Monthly limit', prefixText: '\$ '),
          ),
          const SizedBox(height: 20),

          // Settings section
          Text('SETTINGS',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  letterSpacing: 1)),
          const SizedBox(height: 12),

          // Rollover toggle
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Rollover unused budget',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w500)),
                    SizedBox(height: 2),
                    Text('Carry forward unspent amount to next month',
                        style: TextStyle(
                            fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Switch.adaptive(
                value: _rollover,
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => _rollover = v),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Alert threshold
          Row(
            children: [
              const Expanded(
                child: Text('Alert threshold',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
              ),
              Text('${_alertThreshold.round()}%',
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary)),
            ],
          ),
          Slider(
            value: _alertThreshold,
            min: 50,
            max: 100,
            divisions: 10,
            activeColor: AppColors.primary,
            onChanged: (v) => setState(() => _alertThreshold = v),
          ),
          const SizedBox(height: 4),

          // Notifications toggle
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Budget notifications',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w500)),
                    SizedBox(height: 2),
                    Text('Get notified when approaching limit',
                        style: TextStyle(
                            fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Switch.adaptive(
                value: _notificationsEnabled,
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => _notificationsEnabled = v),
              ),
            ],
          ),
          const SizedBox(height: 20),

          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create Budget'),
          ),
        ],
      ),
    );
  }
}

class _EditBudgetSheet extends StatefulWidget {
  const _EditBudgetSheet({
    required this.ref,
    required this.budget,
    required this.category,
  });

  final WidgetRef ref;
  final BudgetModel budget;
  final String category;

  @override
  State<_EditBudgetSheet> createState() => _EditBudgetSheetState();
}

class _EditBudgetSheetState extends State<_EditBudgetSheet> {
  late final TextEditingController _amountController;
  bool _saving = false;
  late bool _rollover;
  late double _alertThreshold;
  late bool _notificationsEnabled;

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController(
      text: widget.budget.monthlyLimit.toStringAsFixed(0),
    );
    _rollover = widget.budget.settings.rollover;
    _alertThreshold = widget.budget.settings.alertThreshold;
    _notificationsEnabled = widget.budget.settings.notificationsEnabled;
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) return;

    setState(() => _saving = true);
    try {
      await widget.ref
          .read(budgetRepositoryProvider)
          .updateBudget(widget.budget.id, {
        'monthlyLimit': amount,
        'settings': BudgetSettings(
          rollover: _rollover,
          alertThreshold: _alertThreshold,
          notificationsEnabled: _notificationsEnabled,
        ).toMap(),
      });
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Budget updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Budget'),
        content: Text(
            'Are you sure you want to delete the budget for "${widget.category}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete',
                style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await widget.ref
          .read(budgetRepositoryProvider)
          .deleteBudget(widget.budget.id);
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Budget deleted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
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
          Text('Edit Budget',
              style:
                  const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(widget.category,
              style: TextStyle(
                  fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 20),
          TextField(
            controller: _amountController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
                hintText: 'Monthly limit', prefixText: '\$ '),
            autofocus: true,
          ),
          const SizedBox(height: 20),

          // Settings section
          Text('SETTINGS',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  letterSpacing: 1)),
          const SizedBox(height: 12),

          // Rollover toggle
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Rollover unused budget',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w500)),
                    SizedBox(height: 2),
                    Text('Carry forward unspent amount to next month',
                        style: TextStyle(
                            fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Switch.adaptive(
                value: _rollover,
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => _rollover = v),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Alert threshold
          Row(
            children: [
              const Expanded(
                child: Text('Alert threshold',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
              ),
              Text('${_alertThreshold.round()}%',
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary)),
            ],
          ),
          Slider(
            value: _alertThreshold,
            min: 50,
            max: 100,
            divisions: 10,
            activeColor: AppColors.primary,
            onChanged: (v) => setState(() => _alertThreshold = v),
          ),
          const SizedBox(height: 4),

          // Notifications toggle
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Budget notifications',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w500)),
                    SizedBox(height: 2),
                    Text('Get notified when approaching limit',
                        style: TextStyle(
                            fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Switch.adaptive(
                value: _notificationsEnabled,
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => _notificationsEnabled = v),
              ),
            ],
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
                : const Text('Save'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _saving ? null : _delete,
            child: const Text('Delete Budget',
                style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}
