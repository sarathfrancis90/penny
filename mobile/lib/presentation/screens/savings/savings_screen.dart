import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/savings_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/savings_providers.dart';
import 'package:penny_mobile/presentation/widgets/animated_counter.dart';
import 'package:penny_mobile/presentation/widgets/animated_list_item.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';

class SavingsScreen extends ConsumerWidget {
  const SavingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goalsAsync = ref.watch(savingsGoalsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Savings Goals'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.primary),
            tooltip: 'Create savings goal',
            onPressed: () => _showCreateGoal(context, ref),
          ),
        ],
      ),
      body: goalsAsync.when(
        data: (_) => _SavingsContent(onAdd: () => _showCreateGoal(context, ref)),
        loading: () => const ShimmerCardAndCards(cardCount: 3),
        error: (e, _) => ErrorState(
          message: 'Could not load savings goals',
          onRetry: () => ref.invalidate(savingsGoalsProvider),
        ),
      ),
    );
  }

  void _showCreateGoal(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CreateGoalSheet(ref: ref),
    );
  }
}

class _SavingsContent extends ConsumerWidget {
  const _SavingsContent({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goals = ref.watch(savingsGoalsProvider).valueOrNull ?? [];
    final totalSaved = ref.watch(totalSavedProvider);
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(savingsGoalsProvider),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 8),

          // Total portfolio
          Semantics(
            label: 'Total portfolio: ${formatter.format(totalSaved)}, '
                'across ${goals.length} goal${goals.length == 1 ? '' : 's'}',
            container: true,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  const Text('TOTAL PORTFOLIO',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                          letterSpacing: 1)),
                  const SizedBox(height: 4),
                  AnimatedCounter(
                    value: totalSaved,
                    decimals: 0,
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -1,
                    ),
                  ),
                  Text(
                    'across ${goals.length} goal${goals.length == 1 ? '' : 's'}',
                    style: const TextStyle(
                        fontSize: 14, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          if (goals.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Center(
                child: Column(
                  children: [
                    const Icon(Icons.savings_outlined,
                        size: 48, color: AppColors.textTertiary),
                    const SizedBox(height: 12),
                    const Text('No savings goals yet',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600,
                            color: AppColors.textSecondary)),
                    const SizedBox(height: 4),
                    TextButton(onPressed: onAdd, child: const Text('Create your first goal')),
                  ],
                ),
              ),
            )
          else
            ...goals.asMap().entries.map((entry) => AnimatedListItem(
                  index: entry.key,
                  child: _SavingsGoalCard(goal: entry.value),
                )),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _SavingsGoalCard extends ConsumerWidget {
  const _SavingsGoalCard({required this.goal});

  final SavingsGoalModel goal;

  Color get _priorityColor => switch (goal.priority) {
        'critical' => AppColors.error,
        'high' => AppColors.warning,
        'medium' => AppColors.primary,
        _ => AppColors.textSecondary,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final progress = goal.targetAmount > 0
        ? (goal.currentAmount / goal.targetAmount * 100)
        : 0.0;
    final emoji = goal.emoji ?? goal.defaultEmoji;
    final targetStr = goal.targetDate != null
        ? DateFormat('MMM yyyy').format(goal.targetDate!.toDate())
        : null;

    return Dismissible(
      key: Key(goal.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppColors.error,
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      onDismissed: (_) {
        ref.read(savingsRepositoryProvider).deleteSavingsGoal(goal.id);
        HapticFeedback.mediumImpact();
      },
      child: GestureDetector(
        onTap: () => showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (_) => _SavingsGoalActionsSheet(ref: ref, goal: goal),
        ),
        child: Semantics(
          container: true,
          label: '${goal.name}, '
              '${formatter.format(goal.currentAmount)} of ${formatter.format(goal.targetAmount)}, '
              '${progress.toStringAsFixed(0)} percent complete, '
              '${goal.priority} priority'
              '${targetStr != null ? ', target by $targetStr' : ''}',
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                // Emoji + info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(emoji, style: const TextStyle(fontSize: 24)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(goal.name,
                                style: const TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${formatter.format(goal.currentAmount)} / ${formatter.format(goal.targetAmount)}',
                        style: const TextStyle(
                            fontSize: 14, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _PriorityBadge(
                              label: '${goal.priority} priority',
                              color: _priorityColor),
                          if (targetStr != null) ...[
                            const SizedBox(width: 8),
                            Text('by $targetStr',
                                style: const TextStyle(
                                    fontSize: 12, color: AppColors.textTertiary)),
                          ],
                        ],
                      ),
                      if (goal.monthlyContribution > 0) ...[
                        const SizedBox(height: 4),
                        Text(
                          '${formatter.format(goal.monthlyContribution)}/mo contribution',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.textSecondary),
                        ),
                      ],
                    ],
                  ),
                ),

                // Progress ring
                Semantics(
                  label: '${progress.toStringAsFixed(0)} percent complete',
                  value: '${progress.toStringAsFixed(0)} percent',
                  child: TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 0, end: progress.clamp(0, 100)),
                    duration: const Duration(milliseconds: 1200),
                    curve: Curves.easeOutBack,
                    builder: (context, animatedProgress, _) {
                      return SizedBox(
                        width: 60,
                        height: 60,
                        child: CustomPaint(
                          painter: _MiniProgressRing(
                              percentage: animatedProgress),
                          child: Center(
                            child: Text(
                              '${animatedProgress.toStringAsFixed(0)}%',
                              style: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({required this.label, required this.color});
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

class _MiniProgressRing extends CustomPainter {
  _MiniProgressRing({required this.percentage});
  final double percentage;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    const strokeWidth = 5.0;

    canvas.drawCircle(center, radius,
        Paint()..style = PaintingStyle.stroke..strokeWidth = strokeWidth..color = AppColors.divider);

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      (percentage / 100) * 2 * math.pi,
      false,
      Paint()..style = PaintingStyle.stroke..strokeWidth = strokeWidth..strokeCap = StrokeCap.round..color = AppColors.primary,
    );
  }

  @override
  bool shouldRepaint(covariant _MiniProgressRing old) => old.percentage != percentage;
}

class _CreateGoalSheet extends StatefulWidget {
  const _CreateGoalSheet({required this.ref});
  final WidgetRef ref;

  @override
  State<_CreateGoalSheet> createState() => _CreateGoalSheetState();
}

class _CreateGoalSheetState extends State<_CreateGoalSheet> {
  final _nameController = TextEditingController();
  final _targetController = TextEditingController();
  final _monthlyController = TextEditingController();
  String _category = 'travel';
  String _priority = 'medium';
  bool _saving = false;

  static const _categories = ['emergency_fund', 'travel', 'education', 'health', 'house_down_payment', 'car', 'wedding', 'retirement', 'investment', 'custom'];
  static const _priorities = ['low', 'medium', 'high', 'critical'];

  @override
  void dispose() {
    _nameController.dispose();
    _targetController.dispose();
    _monthlyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final target = double.tryParse(_targetController.text.trim());
    final monthly = double.tryParse(_monthlyController.text.trim()) ?? 0;
    if (name.isEmpty || target == null || target <= 0) return;

    setState(() => _saving = true);
    try {
      final user = widget.ref.read(currentUserProvider);
      await widget.ref.read(savingsRepositoryProvider).createSavingsGoal(
            userId: user!.uid,
            name: name,
            category: _category,
            targetAmount: target,
            monthlyContribution: monthly,
            priority: _priority,
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
          const Text('Create Savings Goal',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(controller: _nameController,
              decoration: const InputDecoration(hintText: 'Goal name')),
          const SizedBox(height: 12),
          TextField(controller: _targetController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(hintText: 'Target amount', prefixText: '\$ ')),
          const SizedBox(height: 12),
          TextField(controller: _monthlyController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(hintText: 'Monthly contribution', prefixText: '\$ ')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _category,
            decoration: const InputDecoration(hintText: 'Category'),
            items: _categories.map((c) =>
                DropdownMenuItem(value: c, child: Text(c.replaceAll('_', ' ')))).toList(),
            onChanged: (v) { if (v != null) setState(() => _category = v); },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _priority,
            decoration: const InputDecoration(hintText: 'Priority'),
            items: _priorities.map((p) =>
                DropdownMenuItem(value: p, child: Text(p))).toList(),
            onChanged: (v) { if (v != null) setState(() => _priority = v); },
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create Goal'),
          ),
        ],
      ),
    );
  }
}

class _SavingsGoalActionsSheet extends StatelessWidget {
  const _SavingsGoalActionsSheet({required this.ref, required this.goal});

  final WidgetRef ref;
  final SavingsGoalModel goal;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(goal.name,
              style:
                  const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          ListTile(
            leading: const Icon(Icons.edit_outlined, color: AppColors.primary),
            title: const Text('Edit Goal'),
            subtitle: const Text('Update name, target, or contribution'),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
            tileColor: Theme.of(context).cardColor,
            onTap: () {
              Navigator.pop(context);
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                builder: (_) => _EditGoalSheet(ref: ref, goal: goal),
              );
            },
          ),
          const SizedBox(height: 12),
          ListTile(
            leading:
                const Icon(Icons.add_circle_outline, color: AppColors.success),
            title: const Text('Add Contribution'),
            subtitle: const Text('Record a deposit toward this goal'),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
            tileColor: Theme.of(context).cardColor,
            onTap: () {
              Navigator.pop(context);
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                builder: (_) =>
                    _AddContributionSheet(ref: ref, goal: goal),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _EditGoalSheet extends StatefulWidget {
  const _EditGoalSheet({required this.ref, required this.goal});

  final WidgetRef ref;
  final SavingsGoalModel goal;

  @override
  State<_EditGoalSheet> createState() => _EditGoalSheetState();
}

class _EditGoalSheetState extends State<_EditGoalSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _targetController;
  late final TextEditingController _monthlyController;
  late String _priority;
  bool _saving = false;

  static const _priorities = ['low', 'medium', 'high', 'critical'];

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.goal.name);
    _targetController = TextEditingController(
      text: widget.goal.targetAmount.toStringAsFixed(
          widget.goal.targetAmount == widget.goal.targetAmount.roundToDouble()
              ? 0
              : 2),
    );
    _monthlyController = TextEditingController(
      text: widget.goal.monthlyContribution.toStringAsFixed(
          widget.goal.monthlyContribution ==
                  widget.goal.monthlyContribution.roundToDouble()
              ? 0
              : 2),
    );
    _priority = _priorities.contains(widget.goal.priority)
        ? widget.goal.priority
        : 'medium';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _targetController.dispose();
    _monthlyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final target = double.tryParse(_targetController.text.trim());
    final monthly = double.tryParse(_monthlyController.text.trim()) ?? 0;
    if (name.isEmpty || target == null || target <= 0) return;

    setState(() => _saving = true);
    try {
      final progress = target > 0
          ? (widget.goal.currentAmount / target * 100)
          : 0.0;
      await widget.ref.read(savingsRepositoryProvider).updateSavingsGoal(
        widget.goal.id,
        {
          'name': name,
          'targetAmount': target,
          'monthlyContribution': monthly,
          'priority': _priority,
          'progressPercentage': progress,
        },
      );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Savings goal updated')),
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
          const Text('Edit Savings Goal',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(hintText: 'Goal name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _targetController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
                hintText: 'Target amount', prefixText: '\$ '),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _monthlyController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
                hintText: 'Monthly contribution', prefixText: '\$ '),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _priority,
            decoration: const InputDecoration(hintText: 'Priority'),
            items: _priorities
                .map(
                    (p) => DropdownMenuItem(value: p, child: Text(p)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _priority = v);
            },
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

class _AddContributionSheet extends StatefulWidget {
  const _AddContributionSheet({required this.ref, required this.goal});

  final WidgetRef ref;
  final SavingsGoalModel goal;

  @override
  State<_AddContributionSheet> createState() => _AddContributionSheetState();
}

class _AddContributionSheetState extends State<_AddContributionSheet> {
  final _amountController = TextEditingController();
  bool _saving = false;

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
          .read(savingsRepositoryProvider)
          .addContribution(widget.goal.id, amount);
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(
                  'Added \$${amount.toStringAsFixed(0)} to ${widget.goal.name}')),
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

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final remaining = widget.goal.targetAmount - widget.goal.currentAmount;

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
          const Text('Add Contribution',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(
            '${formatter.format(remaining)} remaining to goal',
            style: const TextStyle(
                fontSize: 14, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _amountController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
                hintText: 'Amount', prefixText: '\$ '),
            autofocus: true,
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
                : const Text('Add Contribution'),
          ),
        ],
      ),
    );
  }
}
