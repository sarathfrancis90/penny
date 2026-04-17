import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/income_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/animated_counter.dart';
import 'package:penny_mobile/presentation/widgets/animated_list_item.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';
import 'package:penny_mobile/presentation/widgets/penny_empty_state.dart';

class IncomeScreen extends ConsumerWidget {
  const IncomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sourcesAsync = ref.watch(incomeSourcesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Income'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.primary),
            tooltip: 'Add income source',
            onPressed: () => _showCreateIncome(context, ref),
          ),
        ],
      ),
      body: sourcesAsync.when(
        data: (_) => _IncomeContent(onAdd: () => _showCreateIncome(context, ref)),
        loading: () => const ShimmerCardAndList(),
        error: (e, _) => ErrorState(
          message: 'Could not load income sources',
          onRetry: () => ref.invalidate(incomeSourcesProvider),
        ),
      ),
    );
  }

  void _showCreateIncome(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CreateIncomeSheet(ref: ref),
    );
  }
}

class _IncomeContent extends ConsumerWidget {
  const _IncomeContent({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeSources = ref.watch(activeIncomeSourcesProvider);
    final totalMonthly = ref.watch(totalMonthlyIncomeProvider);
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(incomeSourcesProvider);
        HapticFeedback.lightImpact();
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 8),

          // Monthly summary
          Semantics(
            label: 'Monthly income: ${formatter.format(totalMonthly)} per month',
            container: true,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  Text(
                    DateFormat('MMMM yyyy').format(DateTime.now()),
                    style: TextStyle(
                        fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AnimatedCounter(
                        value: totalMonthly,
                        decimals: 0,
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w700,
                          color: AppColors.success,
                          letterSpacing: -1,
                        ),
                      ),
                      const Text(
                        '/mo',
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w700,
                          color: AppColors.success,
                          letterSpacing: -1,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Active sources
          if (activeSources.isEmpty)
            PennyEmptyState(
              lottieAsset: 'assets/lottie/empty_box.json',
              title: 'No income sources',
              subtitle: 'Add your salary, freelance gigs, or side income.\nPenny uses this to calculate your cash flow and net savings.',
              onAction: onAdd,
              actionLabel: 'Add your first income source',
            )
          else ...[
            Text('ACTIVE SOURCES',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    letterSpacing: 1)),
            const SizedBox(height: 12),
            ...activeSources.asMap().entries.map((entry) => AnimatedListItem(
                  index: entry.key,
                  child: _IncomeSourceTile(source: entry.value),
                )),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total Monthly Income',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                Text(formatter.format(totalMonthly),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _IncomeSourceTile extends ConsumerWidget {
  const _IncomeSourceTile({required this.source});

  final IncomeSourceModel source;

  IconData get _icon => switch (source.category) {
        'salary' => Icons.business_center_outlined,
        'freelance' => Icons.laptop_outlined,
        'bonus' => Icons.card_giftcard_outlined,
        'investment' => Icons.trending_up_outlined,
        'rental' => Icons.home_outlined,
        'side_hustle' => Icons.rocket_launch_outlined,
        'gift' => Icons.redeem_outlined,
        _ => Icons.attach_money_outlined,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return Dismissible(
      key: Key(source.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppColors.error,
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      onDismissed: (_) {
        ref.read(incomeRepositoryProvider).deleteIncomeSource(source.id);
        HapticFeedback.mediumImpact();
      },
      child: GestureDetector(
        onTap: () => showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (_) => _EditIncomeSheet(ref: ref, source: source),
        ),
        child: Semantics(
          label: '${source.name}, ${source.category}, '
              '${formatter.format(source.amount)}${source.frequencyLabel}, '
              '${source.isActive ? 'active' : 'inactive'}',
          container: true,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: Theme.of(context).cardColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(_icon, size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(source.name,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          _Tag(label: source.category),
                          const SizedBox(width: 6),
                          Semantics(
                            label: source.isActive ? 'Active' : 'Inactive',
                            child: Container(
                              width: 6, height: 6,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: source.isActive
                                    ? AppColors.success
                                    : Theme.of(context).hintColor,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(source.isActive ? 'Active' : 'Inactive',
                              style: TextStyle(
                                  fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                        ],
                      ),
                    ],
                  ),
                ),
                Semantics(
                  label: 'Amount: ${formatter.format(source.amount)}${source.frequencyLabel}',
                  child: Text(
                    '${formatter.format(source.amount)}${source.frequencyLabel}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.success,
                    ),
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

class _Tag extends StatelessWidget {
  const _Tag({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
    );
  }
}

class _CreateIncomeSheet extends StatefulWidget {
  const _CreateIncomeSheet({required this.ref});
  final WidgetRef ref;

  @override
  State<_CreateIncomeSheet> createState() => _CreateIncomeSheetState();
}

class _CreateIncomeSheetState extends State<_CreateIncomeSheet> {
  final _nameController = TextEditingController();
  final _amountController = TextEditingController();
  String _category = 'salary';
  String _frequency = 'monthly';
  bool _taxable = true;
  bool _saving = false;

  static const _categories = ['salary', 'freelance', 'bonus', 'investment', 'rental', 'side_hustle', 'gift', 'other'];
  static const _frequencies = ['monthly', 'biweekly', 'weekly', 'yearly', 'once'];

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (name.isEmpty || amount == null || amount <= 0) return;

    setState(() => _saving = true);
    try {
      final user = widget.ref.read(currentUserProvider);
      await widget.ref.read(incomeRepositoryProvider).createIncomeSource(
            userId: user!.uid,
            name: name,
            category: _category,
            amount: amount,
            frequency: _frequency,
            isRecurring: _frequency != 'once',
            taxable: _taxable,
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
          const Text('Add Income Source',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(hintText: 'Source name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(hintText: 'Amount', prefixText: '\$ '),
          ),
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
            value: _frequency,
            decoration: const InputDecoration(hintText: 'Frequency'),
            items: _frequencies.map((f) =>
                DropdownMenuItem(value: f, child: Text(f))).toList(),
            onChanged: (v) { if (v != null) setState(() => _frequency = v); },
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            title: const Text('Taxable', style: TextStyle(fontSize: 15)),
            value: _taxable,
            onChanged: (v) => setState(() => _taxable = v),
            activeColor: AppColors.primary,
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Add Source'),
          ),
        ],
      ),
    );
  }
}

class _EditIncomeSheet extends StatefulWidget {
  const _EditIncomeSheet({required this.ref, required this.source});

  final WidgetRef ref;
  final IncomeSourceModel source;

  @override
  State<_EditIncomeSheet> createState() => _EditIncomeSheetState();
}

class _EditIncomeSheetState extends State<_EditIncomeSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _amountController;
  late String _category;
  late String _frequency;
  late bool _taxable;
  bool _saving = false;

  static const _categories = [
    'salary',
    'freelance',
    'bonus',
    'investment',
    'rental',
    'side_hustle',
    'gift',
    'other'
  ];
  static const _frequencies = ['monthly', 'biweekly', 'weekly', 'yearly', 'once'];

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.source.name);
    _amountController = TextEditingController(
      text: widget.source.amount.toStringAsFixed(
          widget.source.amount == widget.source.amount.roundToDouble() ? 0 : 2),
    );
    _category = _categories.contains(widget.source.category)
        ? widget.source.category
        : 'other';
    _frequency = _frequencies.contains(widget.source.frequency)
        ? widget.source.frequency
        : 'monthly';
    _taxable = widget.source.taxable;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (name.isEmpty || amount == null || amount <= 0) return;

    setState(() => _saving = true);
    try {
      await widget.ref.read(incomeRepositoryProvider).updateIncomeSource(
        widget.source.id,
        {
          'name': name,
          'amount': amount,
          'category': _category,
          'frequency': _frequency,
          'isRecurring': _frequency != 'once',
          'taxable': _taxable,
        },
      );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Income source updated')),
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
          const Text('Edit Income Source',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(hintText: 'Source name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amountController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration:
                const InputDecoration(hintText: 'Amount', prefixText: '\$ '),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _category,
            decoration: const InputDecoration(hintText: 'Category'),
            items: _categories
                .map((c) => DropdownMenuItem(
                    value: c, child: Text(c.replaceAll('_', ' '))))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _category = v);
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _frequency,
            decoration: const InputDecoration(hintText: 'Frequency'),
            items: _frequencies
                .map((f) => DropdownMenuItem(value: f, child: Text(f)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _frequency = v);
            },
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            title: const Text('Taxable', style: TextStyle(fontSize: 15)),
            value: _taxable,
            onChanged: (v) => setState(() => _taxable = v),
            activeColor: AppColors.primary,
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 12),
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
