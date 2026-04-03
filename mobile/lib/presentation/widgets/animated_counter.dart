import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Animates a numeric value from 0 to the target value with a smooth ease-out
/// curve. Formats the result as currency (e.g. $1,234.56).
class AnimatedCounter extends StatelessWidget {
  const AnimatedCounter({
    super.key,
    required this.value,
    this.style,
    this.prefix = '\$',
    this.decimals = 2,
    this.duration = const Duration(milliseconds: 800),
  });

  /// Target numeric value to animate toward.
  final double value;

  /// Optional text style applied to the formatted string.
  final TextStyle? style;

  /// Currency prefix shown before the number. Defaults to '$'.
  final String prefix;

  /// Number of decimal digits. Defaults to 2.
  final int decimals;

  /// Animation duration. Defaults to 800ms.
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: value),
      duration: duration,
      curve: Curves.easeOutCubic,
      builder: (context, animatedValue, _) {
        final formatted = NumberFormat.currency(
          symbol: prefix,
          decimalDigits: decimals,
        ).format(animatedValue);
        return Text(formatted, style: style);
      },
    );
  }
}
