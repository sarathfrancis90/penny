import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';

/// Shows a bottom sheet prompting the guest to create an account.
/// Returns `true` if the user chose to sign up (navigated to signup).
Future<bool> showGuestSignUpPrompt(BuildContext context) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.person_add_outlined, size: 48, color: AppColors.primary),
            const SizedBox(height: 16),
            const Text(
              'Create an Account',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Sign up to save your expenses, budgets, and financial data securely across all your devices.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Sign Up'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Not Now'),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  if (result == true && context.mounted) {
    context.go('/auth/signup');
    return true;
  }
  return false;
}
