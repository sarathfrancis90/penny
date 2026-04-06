import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

class ExpenseListTile extends StatelessWidget {
  const ExpenseListTile({
    super.key,
    required this.expense,
    this.onTap,
  });

  final ExpenseModel expense;
  final VoidCallback? onTap;

  static Widget _flightShuttleBuilder(
    BuildContext flightContext,
    Animation<double> animation,
    HeroFlightDirection flightDirection,
    BuildContext fromHeroContext,
    BuildContext toHeroContext,
  ) {
    return DefaultTextStyle(
      style: DefaultTextStyle.of(toHeroContext).style,
      child: toHeroContext.widget,
    );
  }

  IconData get _categoryIcon {
    final cat = expense.category.toLowerCase();
    if (cat.contains('meal') || cat.contains('groceries')) {
      return Icons.restaurant_outlined;
    }
    if (cat.contains('travel') || cat.contains('motor')) {
      return Icons.directions_car_outlined;
    }
    if (cat.contains('office')) return Icons.business_outlined;
    if (cat.contains('telephone')) return Icons.phone_outlined;
    if (cat.contains('insurance')) return Icons.shield_outlined;
    if (cat.contains('vehicle') || cat.contains('fuel')) {
      return Icons.local_gas_station_outlined;
    }
    if (cat.contains('home office')) return Icons.home_outlined;
    if (cat.contains('subscription') || cat.contains('fees')) {
      return Icons.receipt_long_outlined;
    }
    if (cat.contains('legal') || cat.contains('accounting')) {
      return Icons.gavel_outlined;
    }
    if (cat.contains('advertising')) return Icons.campaign_outlined;
    if (cat.contains('supplies')) return Icons.inventory_2_outlined;
    return Icons.receipt_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final dateStr = DateFormat('MMM d').format(expense.date.toDate());
    final amountStr = NumberFormat.currency(symbol: '\$', decimalDigits: 2)
        .format(expense.amount);

    // Shorten category for display
    var categoryDisplay = expense.category;
    final parenIdx = categoryDisplay.indexOf('(');
    if (parenIdx > 0) {
      categoryDisplay = categoryDisplay.substring(0, parenIdx).trim();
    }
    if (categoryDisplay.startsWith('Home Office - ')) {
      categoryDisplay = categoryDisplay.replaceFirst('Home Office - ', 'Home: ');
    }
    if (categoryDisplay.startsWith('Vehicle - ')) {
      categoryDisplay = categoryDisplay.replaceFirst('Vehicle - ', '');
    }

    return Semantics(
      button: true,
      label: '${expense.vendor}, $categoryDisplay, '
          'Amount: $amountStr, $dateStr',
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              // Category icon
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  _categoryIcon,
                  size: 20,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(width: 12),

              // Vendor + Category
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Hero(
                      tag: 'expense-vendor-${expense.id}',
                      flightShuttleBuilder: _flightShuttleBuilder,
                      child: Material(
                        type: MaterialType.transparency,
                        child: Text(
                          expense.vendor,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      categoryDisplay,
                      style: TextStyle(
                        fontSize: 13,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),

              // Amount + Date + Approval badge
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Hero(
                    tag: 'expense-amount-${expense.id}',
                    flightShuttleBuilder: _flightShuttleBuilder,
                    child: Material(
                      type: MaterialType.transparency,
                      child: Text(
                        amountStr,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (expense.expenseType == 'group' && expense.isPending)
                    _ApprovalBadge(
                      label: 'Pending',
                      color: AppColors.warning,
                    )
                  else if (expense.expenseType == 'group' && expense.isRejected)
                    _ApprovalBadge(
                      label: 'Rejected',
                      color: AppColors.error,
                    )
                  else if (expense.expenseType == 'group' &&
                      expense.approvalStatus == 'approved')
                    const Icon(Icons.check_circle,
                        size: 14, color: AppColors.success)
                  else
                    Text(
                      dateStr,
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).hintColor,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ApprovalBadge extends StatelessWidget {
  const _ApprovalBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
