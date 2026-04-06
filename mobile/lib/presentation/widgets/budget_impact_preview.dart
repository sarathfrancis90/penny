import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';

/// Inline preview showing how an expense will affect the budget for a category.
class BudgetImpactPreview extends ConsumerWidget {
  const BudgetImpactPreview({
    super.key,
    required this.category,
    required this.amount,
  });

  final String category;
  final double amount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usage = ref.watch(budgetUsageForCategoryProvider(category));
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    // No budget set for this category
    if (usage == null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline,
                size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'No budget set for "$_shortCategory"',
                style: TextStyle(
                    fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
      );
    }

    final projectedSpent = usage.totalSpent + amount;
    final projectedPercentage = usage.budgetLimit > 0
        ? (projectedSpent / usage.budgetLimit * 100)
        : 0.0;
    final projectedStatus = BudgetUsage.computeStatus(projectedPercentage);
    final projectedRemaining = usage.budgetLimit - projectedSpent;

    final statusColor = _statusColor(projectedStatus);
    final borderColor = statusColor.withValues(alpha: 0.3);
    final bgColor = statusColor.withValues(alpha: 0.05);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: title + status badge
          Row(
            children: [
              Expanded(
                child: Text(
                  'Budget Impact',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ),
              _StatusBadge(
                label: _statusLabel(projectedStatus),
                color: statusColor,
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Two columns: Current vs After
          Row(
            children: [
              // Current
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Current',
                        style: TextStyle(
                            fontSize: 11,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                            fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    Text(formatter.format(usage.totalSpent),
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600)),
                    Text('${usage.percentageUsed.toStringAsFixed(0)}% used',
                        style: TextStyle(
                            fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),

              // Arrow
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.arrow_forward,
                    size: 16, color: statusColor),
              ),

              // After
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('After',
                        style: TextStyle(
                            fontSize: 11,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                            fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    Text(formatter.format(projectedSpent),
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: statusColor)),
                    Text('+${formatter.format(amount)}',
                        style: TextStyle(
                            fontSize: 11,
                            color: statusColor,
                            fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (projectedPercentage / 100).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: Theme.of(context).dividerColor,
              valueColor: AlwaysStoppedAnimation<Color>(statusColor),
            ),
          ),
          const SizedBox(height: 8),

          // Footer: budget limit + remaining/over
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Budget: ${formatter.format(usage.budgetLimit)}',
                  style: TextStyle(
                      fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              Text(
                projectedRemaining >= 0
                    ? '${formatter.format(projectedRemaining)} remaining'
                    : '${formatter.format(projectedRemaining.abs())} over',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: projectedRemaining >= 0
                      ? AppColors.success
                      : AppColors.error,
                ),
              ),
            ],
          ),

          // Over-budget warning row
          if (projectedRemaining < 0) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 14, color: AppColors.error),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'This expense will exceed your ${formatter.format(usage.budgetLimit)} budget by ${formatter.format(projectedRemaining.abs())}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.error),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String get _shortCategory {
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

  Color _statusColor(BudgetStatus status) => switch (status) {
        BudgetStatus.safe => AppColors.primary,
        BudgetStatus.warning => AppColors.warning,
        BudgetStatus.critical => AppColors.error,
        BudgetStatus.over => AppColors.error,
      };

  String _statusLabel(BudgetStatus status) => switch (status) {
        BudgetStatus.safe => 'Safe',
        BudgetStatus.warning => 'Warning',
        BudgetStatus.critical => 'Critical',
        BudgetStatus.over => 'Over Budget',
      };
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
