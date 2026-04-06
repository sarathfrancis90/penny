import 'package:flutter/material.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';

class ExpenseCard extends StatelessWidget {
  const ExpenseCard({
    super.key,
    required this.expense,
    this.onConfirm,
    this.onEdit,
    this.confirmed = false,
  });

  final ParsedExpense expense;
  final VoidCallback? onConfirm;
  final VoidCallback? onEdit;
  final bool confirmed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${expense.vendor}, ${expense.category}, '
          '\$${expense.amount.toStringAsFixed(2)}, ${expense.date}'
          '${confirmed ? ', saved' : ''}',
      container: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
          border: confirmed
              ? Border.all(color: AppColors.success.withValues(alpha: 0.3))
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Vendor + Amount row
            Row(
              children: [
                Expanded(
                  child: Text(
                    expense.vendor,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
                Semantics(
                  label: 'Amount: \$${expense.amount.toStringAsFixed(2)}',
                  child: Text(
                    '\$${expense.amount.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 8),

          // Category + Date row
          Row(
            children: [
              _Tag(label: expense.category),
              const SizedBox(width: 8),
              Text(
                expense.date,
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const Spacer(),
              if (expense.confidence != null)
                Text(
                  '${(expense.confidence! * 100).round()}%',
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).hintColor,
                  ),
                ),
            ],
          ),

          // Action buttons
          if (!confirmed && (onConfirm != null || onEdit != null)) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (onConfirm != null)
                  Expanded(
                    child: SizedBox(
                      height: 40,
                      child: Semantics(
                        button: true,
                        label: 'Confirm expense: ${expense.vendor}, '
                            '\$${expense.amount.toStringAsFixed(2)}',
                        child: ElevatedButton(
                          onPressed: onConfirm,
                          child: const Text('Confirm', style: TextStyle(fontSize: 14)),
                        ),
                      ),
                    ),
                  ),
                if (onConfirm != null && onEdit != null)
                  const SizedBox(width: 8),
                if (onEdit != null)
                  SizedBox(
                    height: 40,
                    child: Semantics(
                      button: true,
                      label: 'Edit expense: ${expense.vendor}',
                      child: OutlinedButton(
                        onPressed: onEdit,
                        child: const Text('Edit', style: TextStyle(fontSize: 14)),
                      ),
                    ),
                  ),
              ],
            ),
          ],

          // Confirmed indicator
          if (confirmed)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Icon(Icons.check_circle, size: 16, color: AppColors.success),
                  const SizedBox(width: 4),
                  Text(
                    'Saved',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ),
        ],
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
    // Truncate long category names
    final display = label.length > 25 ? '${label.substring(0, 25)}...' : label;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        display,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: AppColors.primary,
        ),
      ),
    );
  }
}
