import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';

/// Data class representing one month's income and expense totals.
class MonthCashFlow {
  const MonthCashFlow({
    required this.monthLabel,
    required this.income,
    required this.expenses,
  });

  final String monthLabel;
  final double income;
  final double expenses;
}

/// A grouped bar chart showing income vs expenses for each month.
class CashFlowChart extends StatelessWidget {
  const CashFlowChart({super.key, required this.data});

  final List<MonthCashFlow> data;

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return SizedBox(
        height: 200,
        child: Center(
          child: Text(
            'No data available',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ),
      );
    }

    final maxVal = data.fold<double>(0.0, (prev, m) {
      final localMax = m.income > m.expenses ? m.income : m.expenses;
      return localMax > prev ? localMax : prev;
    });
    // Add 20% headroom so bars don't touch the top
    final maxY = maxVal > 0 ? maxVal * 1.2 : 100.0;

    final formatter = NumberFormat.compactCurrency(symbol: '\$', decimalDigits: 0);

    return Column(
      children: [
        SizedBox(
          height: 200,
          child: BarChart(
            BarChartData(
              maxY: maxY,
              barTouchData: BarTouchData(
                touchTooltipData: BarTouchTooltipData(
                  getTooltipItem: (group, groupIndex, rod, rodIndex) {
                    final label = rodIndex == 0 ? 'Expenses' : 'Income';
                    final formatted = NumberFormat.currency(
                      symbol: '\$',
                      decimalDigits: 0,
                    ).format(rod.toY);
                    return BarTooltipItem(
                      '$label\n$formatted',
                      const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    );
                  },
                ),
              ),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(
                  sideTitles: SideTitles(showTitles: false),
                ),
                rightTitles: const AxisTitles(
                  sideTitles: SideTitles(showTitles: false),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 28,
                    getTitlesWidget: (value, meta) {
                      final index = value.toInt();
                      if (index < 0 || index >= data.length) {
                        return const SizedBox.shrink();
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          data[index].monthLabel,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      );
                    },
                  ),
                ),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 48,
                    getTitlesWidget: (value, meta) {
                      if (value == 0) return const SizedBox.shrink();
                      return Text(
                        formatter.format(value),
                        style: TextStyle(
                          fontSize: 11,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      );
                    },
                  ),
                ),
              ),
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: maxY / 4,
                getDrawingHorizontalLine: (value) => FlLine(
                  color: Theme.of(context).dividerColor,
                  strokeWidth: 0.5,
                ),
              ),
              borderData: FlBorderData(show: false),
              barGroups: List.generate(data.length, (index) {
                final month = data[index];
                return BarChartGroupData(
                  x: index,
                  barRods: [
                    // Expenses bar (blue / primary)
                    BarChartRodData(
                      toY: month.expenses,
                      color: AppColors.primary,
                      width: 16,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(4),
                      ),
                    ),
                    // Income bar (green / success)
                    BarChartRodData(
                      toY: month.income,
                      color: AppColors.success,
                      width: 16,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(4),
                      ),
                    ),
                  ],
                  barsSpace: 4,
                );
              }),
            ),
            duration: const Duration(milliseconds: 600),
            curve: Curves.easeOutCubic,
          ),
        ),
        const SizedBox(height: 12),
        // Legend row
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _LegendDot(color: AppColors.primary, label: 'Expenses'),
            const SizedBox(width: 24),
            _LegendDot(color: AppColors.success, label: 'Income'),
          ],
        ),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
