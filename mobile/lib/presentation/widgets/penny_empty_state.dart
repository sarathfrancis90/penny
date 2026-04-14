import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

/// A reusable empty state widget with an optional Lottie animation.
///
/// Use this across screens when there is no data to display.
/// Falls back to a static icon when [lottieAsset] is null.
class PennyEmptyState extends StatelessWidget {
  const PennyEmptyState({
    super.key,
    required this.title,
    this.subtitle,
    this.lottieAsset,
    this.icon,
    this.onAction,
    this.actionLabel,
  });

  final String title;
  final String? subtitle;
  final String? lottieAsset;
  final IconData? icon;
  final VoidCallback? onAction;
  final String? actionLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (lottieAsset != null)
              Lottie.asset(
                lottieAsset!,
                width: 120,
                height: 120,
                repeat: true,
              )
            else if (icon != null)
              Icon(
                icon,
                size: 48,
                color: Theme.of(context).hintColor,
              ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: TextStyle(
                  fontSize: 14,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (onAction != null && actionLabel != null) ...[
              const SizedBox(height: 12),
              TextButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
