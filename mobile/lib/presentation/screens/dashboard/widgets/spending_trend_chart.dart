import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';

/// A line chart showing daily spending totals over the selected period.
class SpendingTrendChart extends ConsumerWidget {
  const SpendingTrendChart({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(dailySpendingProvider);

    // Need at least 2 data points to draw a line
    if (data.length < 2) return const SizedBox.shrink();

    final maxY = data.fold<double>(0, (prev, d) => d.amount > prev ? d.amount : prev);
    final chartMaxY = maxY > 0 ? maxY * 1.2 : 100.0;
    final dateFormat = DateFormat.MMMd();
    final currencyFormat =
        NumberFormat.compactCurrency(symbol: '\$', decimalDigits: 0);

    // Show ~5 labels on the x-axis
    final labelInterval = (data.length / 5).ceil().clamp(1, data.length);

    return SizedBox(
      height: 180,
      child: LineChart(
        LineChartData(
          maxY: chartMaxY,
          minY: 0,
          lineBarsData: [
            LineChartBarData(
              spots: List.generate(
                data.length,
                (i) => FlSpot(i.toDouble(), data[i].amount),
              ),
              isCurved: true,
              curveSmoothness: 0.3,
              color: AppColors.primary,
              barWidth: 2.5,
              isStrokeCapRound: true,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                color: AppColors.primary.withAlpha(20),
              ),
            ),
          ],
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipItems: (spots) => spots.map((spot) {
                final idx = spot.x.toInt().clamp(0, data.length - 1);
                final d = data[idx];
                return LineTooltipItem(
                  '${dateFormat.format(d.date)}\n',
                  TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                  children: [
                    TextSpan(
                      text: NumberFormat.currency(symbol: '\$', decimalDigits: 2)
                          .format(d.amount),
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                );
              }).toList(),
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
                interval: labelInterval.toDouble(),
                getTitlesWidget: (value, meta) {
                  final idx = value.toInt();
                  if (idx < 0 || idx >= data.length) {
                    return const SizedBox.shrink();
                  }
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      DateFormat.MMMd().format(data[idx].date),
                      style: TextStyle(
                        fontSize: 11,
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
                    currencyFormat.format(value),
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
            horizontalInterval: chartMaxY / 4,
            getDrawingHorizontalLine: (value) => FlLine(
              color: Theme.of(context).dividerColor,
              strokeWidth: 0.5,
            ),
          ),
          borderData: FlBorderData(show: false),
        ),
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeOutCubic,
      ),
    );
  }
}
