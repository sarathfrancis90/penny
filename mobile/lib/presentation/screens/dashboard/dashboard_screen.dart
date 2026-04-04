import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
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
            icon: const Icon(Icons.search),
            tooltip: 'Search expenses',
            onPressed: () => context.push('/search'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            builder: (_) => QuickAddExpense(ref: ref),
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

          // Filter row
          const _FilterRow(),
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
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(
                  'No expenses for this period',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
              ),
            )
          else
            ...grouped.entries.expand((entry) => [
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 4),
                    child: Text(
                      entry.key,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
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

// ====== Period Selector ======

class _PeriodSelector extends ConsumerWidget {
  const _PeriodSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(dashboardPeriodProvider);

    return Row(
      children: DashboardPeriod.values.map((period) {
        final isActive = period == selected;
        final label = switch (period) {
          DashboardPeriod.thisMonth => 'This Month',
          DashboardPeriod.lastMonth => 'Last Month',
          DashboardPeriod.threeMonths => '3 Months',
        };

        return Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            label: Text(label),
            selected: isActive,
            onSelected: (_) =>
                ref.read(dashboardPeriodProvider.notifier).state = period,
            selectedColor: AppColors.primary,
            labelStyle: TextStyle(
              color: isActive ? Colors.white : AppColors.textPrimary,
              fontWeight: FontWeight.w500,
              fontSize: 13,
            ),
            showCheckmark: false,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            side: isActive
                ? BorderSide.none
                : const BorderSide(color: AppColors.divider),
          ),
        );
      }).toList(),
    );
  }
}

// ====== Filter Row ======

class _FilterRow extends ConsumerWidget {
  const _FilterRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(expenseFilterProvider);

    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          // All chip
          _FilterChip(
            label: 'All',
            isActive: filter.typeFilter == ExpenseTypeFilter.all &&
                filter.categoryFilter == null,
            onTap: () {
              ref.read(expenseFilterProvider.notifier).state =
                  const ExpenseFilter();
            },
          ),
          const SizedBox(width: 8),

          // Personal chip
          _FilterChip(
            label: 'Personal',
            isActive: filter.typeFilter == ExpenseTypeFilter.personal,
            onTap: () {
              ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
                typeFilter: filter.typeFilter == ExpenseTypeFilter.personal
                    ? ExpenseTypeFilter.all
                    : ExpenseTypeFilter.personal,
              );
            },
          ),
          const SizedBox(width: 8),

          // Group chip
          _FilterChip(
            label: 'Group',
            isActive: filter.typeFilter == ExpenseTypeFilter.group,
            onTap: () {
              ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
                typeFilter: filter.typeFilter == ExpenseTypeFilter.group
                    ? ExpenseTypeFilter.all
                    : ExpenseTypeFilter.group,
              );
            },
          ),
          const SizedBox(width: 8),

          // Category dropdown chip
          _CategoryDropdownChip(
            selectedCategory: filter.categoryFilter,
            onChanged: (category) {
              ref.read(expenseFilterProvider.notifier).state = filter.copyWith(
                categoryFilter: () => category,
              );
            },
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final String label;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.primary.withValues(alpha: 0.12)
              : AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: isActive
              ? Border.all(color: AppColors.primary, width: 1)
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: isActive ? AppColors.primary : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _CategoryDropdownChip extends StatelessWidget {
  const _CategoryDropdownChip({
    required this.selectedCategory,
    required this.onChanged,
  });

  final String? selectedCategory;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final hasFilter = selectedCategory != null;

    // Shorten the display label
    String displayLabel;
    if (hasFilter) {
      var cat = selectedCategory!;
      if (cat.startsWith('Home Office - ')) {
        cat = cat.replaceFirst('Home Office - ', 'Home: ');
      } else if (cat.startsWith('Vehicle - ')) {
        cat = cat.replaceFirst('Vehicle - ', 'Vehicle: ');
      }
      final parenIdx = cat.indexOf('(');
      if (parenIdx > 0) cat = cat.substring(0, parenIdx).trim();
      displayLabel = cat.length > 20 ? '${cat.substring(0, 20)}...' : cat;
    } else {
      displayLabel = 'Category';
    }

    return GestureDetector(
      onTap: () => _showCategoryPicker(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: hasFilter
              ? AppColors.primary.withValues(alpha: 0.12)
              : AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: hasFilter
              ? Border.all(color: AppColors.primary, width: 1)
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              displayLabel,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color:
                    hasFilter ? AppColors.primary : AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              hasFilter ? Icons.close : Icons.expand_more,
              size: 16,
              color: hasFilter ? AppColors.primary : AppColors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }

  void _showCategoryPicker(BuildContext context) {
    if (selectedCategory != null) {
      // Clear filter
      onChanged(null);
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.6,
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
                    const Text(
                      'Filter by Category',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        onChanged(null);
                      },
                      child: const Text('Clear'),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: expenseCategories.length,
                  itemBuilder: (ctx, index) {
                    final cat = expenseCategories[index];
                    // Shorten for display
                    var label = cat;
                    final parenIdx = label.indexOf('(');
                    if (parenIdx > 0) {
                      label = label.substring(0, parenIdx).trim();
                    }

                    return ListTile(
                      dense: true,
                      title: Text(
                        label,
                        style: const TextStyle(fontSize: 14),
                      ),
                      onTap: () {
                        Navigator.pop(ctx);
                        onChanged(cat);
                      },
                    );
                  },
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
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Total Spent',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 4),
            AnimatedCounter(
              value: total,
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
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
        color: AppColors.surface,
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
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.textPrimary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  formatter.format(cat.amount),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
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
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        const Spacer(),
        if (trailing != null) trailing!,
      ],
    );
  }
}
