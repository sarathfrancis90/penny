import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/quick_add_expense.dart';
import 'package:penny_mobile/presentation/screens/dashboard/widgets/expense_list_tile.dart';
import 'package:penny_mobile/presentation/widgets/animated_counter.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final expensesAsync = ref.watch(allExpensesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_outlined),
            tooltip: 'Export expenses',
            onPressed: () => _showExportSheet(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Search expenses',
            onPressed: () => context.push('/search'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Add expense',
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => const QuickAddExpense(),
          );
        },
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: expensesAsync.when(
        data: (_) => const _DashboardContent(),
        loading: () => const ShimmerCardAndList(),
        error: (e, _) => ErrorState(
          message: 'Could not load dashboard',
          onRetry: () => ref.invalidate(allExpensesProvider),
        ),
      ),
    );
  }

  void _showExportSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      builder: (_) => _ExportSheet(ref: ref),
    );
  }
}

class _DashboardContent extends ConsumerWidget {
  const _DashboardContent();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentTotal = ref.watch(currentMonthTotalProvider);
    final lastTotal = ref.watch(lastMonthTotalProvider);
    final filteredExpenses = ref.watch(filteredExpensesProvider);
    final categoryBreakdown = ref.watch(filteredCategoryBreakdownProvider);

    final trend = lastTotal > 0
        ? ((currentTotal - lastTotal) / lastTotal * 100)
        : 0.0;

    // Group expenses by date bucket
    final grouped = _groupExpensesByDate(filteredExpenses);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(allExpensesProvider);
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 8),

          // Period pills
          const _PeriodSelector(),
          const SizedBox(height: 12),

          // Filter bar
          const _FilterBar(),
          const SizedBox(height: 16),

          // Total spending card
          _TotalCard(
            total: filteredExpenses.fold(0.0, (sum, e) => sum + e.amount),
            trend: trend,
            lastTotal: lastTotal,
          ),
          const SizedBox(height: 24),

          // Category-wise totals
          if (categoryBreakdown.isNotEmpty) ...[
            const _SectionTitle(title: 'By Category'),
            const SizedBox(height: 12),
            _CategoryTotals(categories: categoryBreakdown),
            const SizedBox(height: 24),
          ],

          // Full expense list grouped by date
          const _SectionTitle(title: 'All Expenses'),
          const SizedBox(height: 8),

          if (filteredExpenses.isEmpty)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(
                  'No expenses for this period',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            )
          else
            ...grouped.entries.expand((entry) => [
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 4),
                    child: Text(
                      entry.key,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  ...entry.value.map((e) => ExpenseListTile(
                        expense: e,
                        onTap: () {
                          context.push('/expenses/detail', extra: e);
                        },
                      )),
                ]),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  /// Groups expenses into date buckets: Today, Yesterday, This Week, Earlier.
  Map<String, List<ExpenseModel>> _groupExpensesByDate(
      List<ExpenseModel> expenses) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final weekStart = today.subtract(Duration(days: today.weekday - 1));

    final groups = <String, List<ExpenseModel>>{};

    for (final e in expenses) {
      final d = e.date.toDate();
      final dateOnly = DateTime(d.year, d.month, d.day);

      String bucket;
      if (dateOnly == today || dateOnly.isAfter(today)) {
        bucket = 'Today';
      } else if (dateOnly == yesterday) {
        bucket = 'Yesterday';
      } else if (dateOnly.isAfter(weekStart) ||
          dateOnly.isAtSameMomentAs(weekStart)) {
        bucket = 'This Week';
      } else {
        bucket = 'Earlier';
      }

      groups.putIfAbsent(bucket, () => []);
      groups[bucket]!.add(e);
    }

    // Return in order: Today, Yesterday, This Week, Earlier
    final ordered = <String, List<ExpenseModel>>{};
    for (final key in ['Today', 'Yesterday', 'This Week', 'Earlier']) {
      if (groups.containsKey(key)) {
        ordered[key] = groups[key]!;
      }
    }
    return ordered;
  }
}

// ====== Period Selector (SegmentedButton — Material 3) ======

class _PeriodSelector extends ConsumerWidget {
  const _PeriodSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(dashboardPeriodProvider);
    final customRange = ref.watch(customDateRangeProvider);
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: SegmentedButton<DashboardPeriod>(
            segments: const [
              ButtonSegment(value: DashboardPeriod.thisWeek, label: Text('W')),
              ButtonSegment(value: DashboardPeriod.thisMonth, label: Text('M')),
              ButtonSegment(
                  value: DashboardPeriod.lastMonth, label: Text('LM')),
              ButtonSegment(
                  value: DashboardPeriod.threeMonths, label: Text('3M')),
              ButtonSegment(value: DashboardPeriod.thisYear, label: Text('Y')),
              ButtonSegment(
                value: DashboardPeriod.custom,
                label: Icon(Icons.date_range, size: 16),
              ),
            ],
            selected: {selected},
            onSelectionChanged: (set) {
              final period = set.first;
              if (period == DashboardPeriod.custom) {
                _showDateRangePicker(context, ref);
              } else {
                ref.read(dashboardPeriodProvider.notifier).state = period;
              }
            },
            style: ButtonStyle(
              visualDensity: VisualDensity.compact,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: WidgetStatePropertyAll(
                theme.textTheme.labelMedium?.copyWith(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ) ??
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
            showSelectedIcon: false,
          ),
        ),
        if (selected == DashboardPeriod.custom && customRange != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text(
              '${DateFormat('MMM d').format(customRange.start)} – ${DateFormat('MMM d, yyyy').format(customRange.end)}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _showDateRangePicker(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: now,
      initialDateRange: ref.read(customDateRangeProvider) ??
          DateTimeRange(
            start: DateTime(now.year, now.month, 1),
            end: now,
          ),
    );

    if (picked != null) {
      ref.read(customDateRangeProvider.notifier).state = picked;
      ref.read(dashboardPeriodProvider.notifier).state = DashboardPeriod.custom;
    }
  }
}

// ====== Filter Bar (icon + active tags + clear) ======

class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(expenseFilterProvider);
    final theme = Theme.of(context);
    final groups = ref.watch(userGroupsProvider).valueOrNull ?? [];

    final hasAnyFilter = filter.typeFilter != ExpenseTypeFilter.all ||
        filter.categoryFilter != null ||
        filter.groupIdFilter != null;

    // Build list of active filter tags
    final tags = <_ActiveFilterTag>[];

    if (filter.typeFilter == ExpenseTypeFilter.personal) {
      tags.add(_ActiveFilterTag(
        label: 'Personal',
        onRemove: () {
          ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
            typeFilter: ExpenseTypeFilter.all,
          );
        },
      ));
    } else if (filter.typeFilter == ExpenseTypeFilter.group &&
        filter.groupIdFilter == null) {
      tags.add(_ActiveFilterTag(
        label: 'Group',
        onRemove: () {
          ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
            typeFilter: ExpenseTypeFilter.all,
          );
        },
      ));
    }

    if (filter.groupIdFilter != null) {
      final groupName = groups
              .where((g) => g.id == filter.groupIdFilter)
              .firstOrNull
              ?.name ??
          'Group';
      tags.add(_ActiveFilterTag(
        label: groupName,
        onRemove: () {
          ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
            typeFilter: ExpenseTypeFilter.all,
            groupIdFilter: () => null,
          );
        },
      ));
    }

    if (filter.categoryFilter != null) {
      tags.add(_ActiveFilterTag(
        label: _shortenCategory(filter.categoryFilter!),
        onRemove: () {
          ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
            categoryFilter: () => null,
          );
        },
      ));
    }

    return Row(
      children: [
        // Filter icon button
        IconButton(
          icon: Badge(
            isLabelVisible: hasAnyFilter,
            smallSize: 8,
            child: Icon(
              Icons.tune,
              color: hasAnyFilter
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
          tooltip: 'Filter expenses',
          onPressed: () => _showFilterBottomSheet(context, ref),
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        ),
        const SizedBox(width: 4),

        // Active tags or "No filters" text
        Expanded(
          child: hasAnyFilter
              ? SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final tag in tags) ...[
                        _FilterTagChip(tag: tag, theme: theme),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                )
              : Text(
                  'No filters',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
        ),

        // Clear button
        if (hasAnyFilter)
          TextButton(
            onPressed: () {
              ref.read(expenseFilterProvider.notifier).state =
                  const ExpenseFilter();
            },
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text('Clear'),
          ),
      ],
    );
  }

  void _showFilterBottomSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FilterBottomSheet(ref: ref),
    );
  }

  static String _shortenCategory(String category) {
    var label = category;
    if (label.startsWith('Home Office - ')) {
      label = label.replaceFirst('Home Office - ', 'Home: ');
    } else if (label.startsWith('Vehicle - ')) {
      label = label.replaceFirst('Vehicle - ', 'Veh: ');
    }
    final parenIdx = label.indexOf('(');
    if (parenIdx > 0) label = label.substring(0, parenIdx).trim();
    return label.length > 22 ? '${label.substring(0, 22)}...' : label;
  }
}

class _ActiveFilterTag {
  const _ActiveFilterTag({required this.label, required this.onRemove});
  final String label;
  final VoidCallback onRemove;
}

class _FilterTagChip extends StatelessWidget {
  const _FilterTagChip({required this.tag, required this.theme});

  final _ActiveFilterTag tag;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return InputChip(
      label: Text(tag.label),
      onDeleted: tag.onRemove,
      deleteIconColor: theme.colorScheme.primary,
      labelStyle: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: theme.colorScheme.primary,
      ),
      backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.08),
      side: BorderSide(color: theme.colorScheme.primary.withValues(alpha: 0.3)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 4),
    );
  }
}

// ====== Filter Bottom Sheet ======

class _FilterBottomSheet extends StatefulWidget {
  const _FilterBottomSheet({required this.ref});

  final WidgetRef ref;

  @override
  State<_FilterBottomSheet> createState() => _FilterBottomSheetState();
}

class _FilterBottomSheetState extends State<_FilterBottomSheet> {
  late ExpenseTypeFilter _typeFilter;
  late String? _groupIdFilter;
  late String? _categoryFilter;

  @override
  void initState() {
    super.initState();
    final current = widget.ref.read(expenseFilterProvider);
    _typeFilter = current.typeFilter;
    _groupIdFilter = current.groupIdFilter;
    _categoryFilter = current.categoryFilter;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final groups = widget.ref.read(userGroupsProvider).valueOrNull ?? [];
    final showGroupSection =
        _typeFilter == ExpenseTypeFilter.all ||
        _typeFilter == ExpenseTypeFilter.group;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Title
            Text(
              'Filter Expenses',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 20),

            // TYPE section
            Text(
              'TYPE',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 8),
            SegmentedButton<ExpenseTypeFilter>(
              segments: const [
                ButtonSegment(
                    value: ExpenseTypeFilter.all, label: Text('All')),
                ButtonSegment(
                    value: ExpenseTypeFilter.personal, label: Text('Personal')),
                ButtonSegment(
                    value: ExpenseTypeFilter.group, label: Text('Group')),
              ],
              selected: {_typeFilter},
              onSelectionChanged: (set) {
                setState(() {
                  _typeFilter = set.first;
                  // Clear group filter if switching away from group
                  if (_typeFilter == ExpenseTypeFilter.personal) {
                    _groupIdFilter = null;
                  }
                });
              },
              showSelectedIcon: false,
              style: ButtonStyle(
                visualDensity: VisualDensity.compact,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            const SizedBox(height: 20),

            // GROUP section (conditionally shown)
            if (showGroupSection && groups.isNotEmpty) ...[
              Text(
                'GROUP',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.dividerColor),
                ),
                child: DropdownButton<String?>(
                  value: _groupIdFilter,
                  isExpanded: true,
                  underline: const SizedBox.shrink(),
                  items: [
                    const DropdownMenuItem<String?>(
                      value: null,
                      child: Text('All Groups'),
                    ),
                    ...groups.map((g) => DropdownMenuItem<String?>(
                          value: g.id,
                          child: Row(
                            children: [
                              Text(g.icon ?? '', style: const TextStyle(fontSize: 16)),
                              if (g.icon != null) const SizedBox(width: 8),
                              Flexible(child: Text(g.name, overflow: TextOverflow.ellipsis)),
                            ],
                          ),
                        )),
                  ],
                  onChanged: (value) {
                    setState(() {
                      _groupIdFilter = value;
                      if (value != null) {
                        _typeFilter = ExpenseTypeFilter.group;
                      }
                    });
                  },
                ),
              ),
              const SizedBox(height: 20),
            ],

            // CATEGORY section
            Text(
              'CATEGORY',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 8),
            InkWell(
              onTap: () => _showCategoryPicker(context, theme),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.dividerColor),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _categoryFilter != null
                            ? _FilterBar._shortenCategory(_categoryFilter!)
                            : 'All Categories',
                        style: TextStyle(
                          fontSize: 14,
                          color: _categoryFilter != null
                              ? theme.colorScheme.onSurface
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.expand_more,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _typeFilter = ExpenseTypeFilter.all;
                        _groupIdFilter = null;
                        _categoryFilter = null;
                      });
                    },
                    child: const Text('Clear All'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      widget.ref.read(expenseFilterProvider.notifier).state =
                          ExpenseFilter(
                        typeFilter: _typeFilter,
                        categoryFilter: _categoryFilter,
                        groupIdFilter: _groupIdFilter,
                      );
                      Navigator.pop(context);
                    },
                    child: const Text('Apply'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showCategoryPicker(BuildContext context, ThemeData theme) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        maxChildSize: 0.85,
        minChildSize: 0.4,
        expand: false,
        builder: (ctx, scrollController) {
          return Column(
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: Row(
                  children: [
                    Text(
                      'Select Category',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    if (_categoryFilter != null)
                      TextButton(
                        onPressed: () {
                          setState(() => _categoryFilter = null);
                          Navigator.pop(ctx);
                        },
                        child: const Text('Clear'),
                      ),
                  ],
                ),
              ),
              Divider(height: 1, color: theme.dividerColor),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  children: [
                    // All Categories option
                    ListTile(
                      dense: true,
                      title: Text(
                        'All Categories',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: _categoryFilter == null
                              ? FontWeight.w600
                              : FontWeight.normal,
                          color: _categoryFilter == null
                              ? theme.colorScheme.primary
                              : null,
                        ),
                      ),
                      onTap: () {
                        setState(() => _categoryFilter = null);
                        Navigator.pop(ctx);
                      },
                    ),
                    // Grouped categories
                    ...categoryGroups.entries.expand((group) => [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                            child: Text(
                              group.key.toUpperCase(),
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                          ...group.value.map((cat) {
                            var label = cat;
                            final parenIdx = label.indexOf('(');
                            if (parenIdx > 0) {
                              label = label.substring(0, parenIdx).trim();
                            }
                            final isSelected = _categoryFilter == cat;
                            return ListTile(
                              dense: true,
                              title: Text(
                                label,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: isSelected
                                      ? FontWeight.w600
                                      : FontWeight.normal,
                                  color: isSelected
                                      ? theme.colorScheme.primary
                                      : null,
                                ),
                              ),
                              trailing: isSelected
                                  ? Icon(Icons.check,
                                      size: 18,
                                      color: theme.colorScheme.primary)
                                  : null,
                              onTap: () {
                                setState(() => _categoryFilter = cat);
                                Navigator.pop(ctx);
                              },
                            );
                          }),
                        ]),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ====== Total Card ======

class _TotalCard extends StatelessWidget {
  const _TotalCard({
    required this.total,
    required this.trend,
    required this.lastTotal,
  });

  final double total;
  final double trend;
  final double lastTotal;

  @override
  Widget build(BuildContext context) {
    final isUp = trend > 0;
    final hasTrend = lastTotal > 0;
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

    return Semantics(
      label: 'Total spent: ${formatter.format(total)}'
          '${hasTrend ? ', ${isUp ? 'up' : 'down'} ${trend.abs().toStringAsFixed(1)} percent versus last month' : ''}',
      container: true,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Total Spent',
              style: TextStyle(
                fontSize: 14,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 4),
            AnimatedCounter(
              value: total,
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurface,
                letterSpacing: -1,
              ),
            ),
            if (hasTrend) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    isUp ? Icons.trending_up : Icons.trending_down,
                    size: 16,
                    color: isUp ? AppColors.error : AppColors.success,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${isUp ? '+' : ''}${trend.toStringAsFixed(1)}% vs last month',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isUp ? AppColors.error : AppColors.success,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ====== Category Totals (simple list, no chart) ======

class _CategoryTotals extends StatelessWidget {
  const _CategoryTotals({required this.categories});

  final List<CategoryBreakdown> categories;

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: categories.map((cat) {
          // Shorten category name for display
          var label = cat.category;
          if (label.startsWith('Home Office - ')) {
            label = label.replaceFirst('Home Office - ', 'Home: ');
          } else if (label.startsWith('Vehicle - ')) {
            label = label.replaceFirst('Vehicle - ', 'Vehicle: ');
          }
          final parenIdx = label.indexOf('(');
          if (parenIdx > 0) {
            label = label.substring(0, parenIdx).trim();
          }

          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  formatter.format(cat.amount),
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ====== Section Title ======

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        const Spacer(),
        if (trailing != null) trailing!,
      ],
    );
  }
}

// ====== Export Sheet ======

class _ExportSheet extends StatefulWidget {
  const _ExportSheet({required this.ref});

  final WidgetRef ref;

  @override
  State<_ExportSheet> createState() => _ExportSheetState();
}

class _ExportSheetState extends State<_ExportSheet> {
  bool _exporting = false;

  String _periodLabel(DashboardPeriod period, DateTimeRange? customRange) {
    return switch (period) {
      DashboardPeriod.thisWeek => 'this_week',
      DashboardPeriod.thisMonth => 'this_month',
      DashboardPeriod.lastMonth => 'last_month',
      DashboardPeriod.threeMonths => '3_months',
      DashboardPeriod.thisYear => 'this_year',
      DashboardPeriod.custom => customRange != null
          ? '${DateFormat('yyyy-MM-dd').format(customRange.start)}_${DateFormat('yyyy-MM-dd').format(customRange.end)}'
          : 'custom',
    };
  }

  String _periodDisplayLabel(
      DashboardPeriod period, DateTimeRange? customRange) {
    return switch (period) {
      DashboardPeriod.thisWeek => 'This Week',
      DashboardPeriod.thisMonth => 'This Month',
      DashboardPeriod.lastMonth => 'Last Month',
      DashboardPeriod.threeMonths => 'Last 3 Months',
      DashboardPeriod.thisYear => 'This Year',
      DashboardPeriod.custom => customRange != null
          ? '${DateFormat('MMM d').format(customRange.start)} - ${DateFormat('MMM d').format(customRange.end)}'
          : 'Custom Range',
    };
  }

  String _filterSummary(ExpenseFilter filter) {
    final parts = <String>[];
    if (filter.typeFilter == ExpenseTypeFilter.personal) {
      parts.add('Personal only');
    } else if (filter.typeFilter == ExpenseTypeFilter.group) {
      parts.add('Group only');
    }
    if (filter.categoryFilter != null) {
      var cat = filter.categoryFilter!;
      final parenIdx = cat.indexOf('(');
      if (parenIdx > 0) cat = cat.substring(0, parenIdx).trim();
      parts.add(cat);
    }
    return parts.isEmpty ? 'All expenses' : parts.join(', ');
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final expenses = widget.ref.read(filteredExpensesProvider);
      final groups =
          widget.ref.read(userGroupsProvider).valueOrNull ?? [];
      final groupNames = {for (final g in groups) g.id: g.name};
      final period = widget.ref.read(dashboardPeriodProvider);
      final customRange = widget.ref.read(customDateRangeProvider);
      final dateRangeLabel = _periodLabel(period, customRange);

      await widget.ref.read(exportServiceProvider).shareExpenseCsv(
            expenses,
            groupNames: groupNames,
            dateRangeLabel: dateRangeLabel,
          );

      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Export failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final expenses = widget.ref.read(filteredExpensesProvider);
    final period = widget.ref.read(dashboardPeriodProvider);
    final customRange = widget.ref.read(customDateRangeProvider);
    final filter = widget.ref.read(expenseFilterProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Export Expenses',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),

            // Summary info
            Container(
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
                      Icon(Icons.date_range,
                          size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Text(
                        _periodDisplayLabel(period, customRange),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(Icons.filter_alt_outlined,
                          size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Text(
                        _filterSummary(filter),
                        style: TextStyle(
                          fontSize: 14,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(Icons.receipt_long_outlined,
                          size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Text(
                        '${expenses.length} expense${expenses.length == 1 ? '' : 's'}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            ElevatedButton.icon(
              onPressed: expenses.isEmpty || _exporting ? null : _export,
              icon: _exporting
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.file_download_outlined),
              label: Text(_exporting ? 'Generating...' : 'Export as CSV'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),

            if (expenses.isEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'No expenses match the current filters',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
