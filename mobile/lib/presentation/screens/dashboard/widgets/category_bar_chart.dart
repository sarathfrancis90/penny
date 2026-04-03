import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';

class CategoryBarChart extends StatelessWidget {
  const CategoryBarChart({super.key, required this.categories});

  final List<CategoryBreakdown> categories;

  @override
  Widget build(BuildContext context) {
    final top = categories.take(6).toList();
    final maxAmount = top.isNotEmpty ? top.first.amount : 1.0;
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return Column(
      children: top.map((cat) {
        final fraction = maxAmount > 0 ? cat.amount / maxAmount : 0.0;
        // Shorten long category names
        final label = _shortenCategory(cat.category);

        return Semantics(
          label: '$label: ${formatter.format(cat.amount)}, '
              '${(fraction * 100).toStringAsFixed(0)} percent of top category',
          container: true,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: AppColors.textPrimary,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      formatter.format(cat.amount),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Semantics(
                  label: '${(fraction * 100).toStringAsFixed(0)} percent',
                  value: '${(fraction * 100).toStringAsFixed(0)} percent',
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: fraction,
                      minHeight: 8,
                      backgroundColor: AppColors.surface,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        AppColors.primary.withValues(
                          alpha: 0.5 + (fraction * 0.5),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  String _shortenCategory(String category) {
    // Remove common prefixes for cleaner display
    if (category.startsWith('Home Office - ')) {
      return category.replaceFirst('Home Office - ', 'Home: ');
    }
    if (category.startsWith('Vehicle - ')) {
      return category.replaceFirst('Vehicle - ', 'Vehicle: ');
    }
    // Truncate parenthetical details
    final parenIndex = category.indexOf('(');
    if (parenIndex > 0) {
      return category.substring(0, parenIndex).trim();
    }
    return category;
  }
}
