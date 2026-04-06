import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';

/// Bottom sheet warning shown before saving an expense that exceeds the budget.
class OverBudgetWarningSheet extends StatelessWidget {
  const OverBudgetWarningSheet({
    super.key,
    required this.category,
    required this.budgetLimit,
    required this.currentSpent,
    required this.expenseAmount,
  });

  final String category;
  final double budgetLimit;
  final double currentSpent;
  final double expenseAmount;

  /// Show the warning sheet. Returns `true` if the user chooses to proceed.
  static Future<bool?> show(
    BuildContext context, {
    required String category,
    required double budgetLimit,
    required double currentSpent,
    required double expenseAmount,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => OverBudgetWarningSheet(
        category: category,
        budgetLimit: budgetLimit,
        currentSpent: currentSpent,
        expenseAmount: expenseAmount,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final formatter =
        NumberFormat.currency(symbol: '\$', decimalDigits: 2);
    final totalAfter = currentSpent + expenseAmount;
    final overAmount = totalAfter - budgetLimit;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Warning icon
            const Icon(Icons.warning_amber_rounded,
                size: 48, color: AppColors.error),
            const SizedBox(height: 16),

            // Title
            const Text(
              'Budget Exceeded',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 6),

            // Subtitle
            Text(
              'Adding this expense will exceed your budget for "$category"',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 20),

            // Breakdown card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  _BreakdownRow(
                    label: 'Budget Limit',
                    value: formatter.format(budgetLimit),
                  ),
                  const SizedBox(height: 10),
                  _BreakdownRow(
                    label: 'Already Spent',
                    value: formatter.format(currentSpent),
                  ),
                  const SizedBox(height: 10),
                  _BreakdownRow(
                    label: 'New Expense',
                    value: '+${formatter.format(expenseAmount)}',
                    valueColor: AppColors.warning,
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1, color: AppColors.divider),
                  ),
                  _BreakdownRow(
                    label: 'Total After',
                    value: formatter.format(totalAfter),
                    bold: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Over-budget amount
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.arrow_upward,
                      size: 16, color: AppColors.error),
                  const SizedBox(width: 6),
                  Text(
                    '${formatter.format(overAmount)} over budget',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.error,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.warning,
                      ),
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Add Anyway'),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.bold = false,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
            color: AppColors.textSecondary,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            color: valueColor ?? AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
