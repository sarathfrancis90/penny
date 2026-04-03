import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Wraps a child widget with a staggered fade-in + slide-up animation.
/// Use in ListView.builder for smooth list appearance.
class AnimatedListItem extends StatelessWidget {
  const AnimatedListItem({
    super.key,
    required this.index,
    required this.child,
  });

  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return child
        .animate()
        .fadeIn(
          duration: 300.ms,
          delay: (50 * index).ms,
        )
        .slideY(
          begin: 0.05,
          end: 0,
          duration: 300.ms,
          delay: (50 * index).ms,
          curve: Curves.easeOut,
        );
  }
}
