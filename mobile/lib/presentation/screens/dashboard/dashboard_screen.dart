import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_detail_screen.dart';
import 'package:penny_mobile/presentation/screens/dashboard/widgets/cash_flow_chart.dart';
import 'package:penny_mobile/presentation/screens/dashboard/widgets/category_bar_chart.dart';
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
    final categories = ref.watch(categoryBreakdownProvider);
    final cashFlow = ref.watch(cashFlowProvider);
    final expenses = ref.watch(currentMonthExpensesProvider);

    final trend = lastTotal > 0
        ? ((currentTotal - lastTotal) / lastTotal * 100)
        : 0.0;

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
          const SizedBox(height: 16),

          // Total spending card
          _TotalCard(
            total: currentTotal,
            trend: trend,
            lastTotal: lastTotal,
          ),
          const SizedBox(height: 24),

          // Category breakdown
          if (categories.isNotEmpty) ...[
            const _SectionTitle(title: 'By Category'),
            const SizedBox(height: 12),
            CategoryBarChart(categories: categories),
            const SizedBox(height: 24),
          ],

          // Cash flow chart
          const _SectionTitle(title: 'Cash Flow'),
          const SizedBox(height: 12),
          CashFlowChart(data: cashFlow),
          const SizedBox(height: 24),

          // Recent expenses
          _SectionTitle(
            title: 'Recent Expenses',
            trailing: expenses.length > 5
                ? TextButton(
                    onPressed: () {
                      // TODO: Navigate to full expense list
                    },
                    child: const Text('See All'),
                  )
                : null,
          ),
          const SizedBox(height: 8),

          if (expenses.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(
                  'No expenses this month',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
              ),
            )
          else
            ...expenses.take(10).map((e) => ExpenseListTile(
              expense: e,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ExpenseDetailScreen(expense: e),
                  ),
                );
              },
            )),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

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
            side: isActive ? BorderSide.none : const BorderSide(color: AppColors.divider),
          ),
        );
      }).toList(),
    );
  }
}

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
