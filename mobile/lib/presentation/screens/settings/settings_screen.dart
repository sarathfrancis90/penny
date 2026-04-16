import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/theme_provider.dart';

/// Provider for user preferences from Firestore.
final userPreferencesProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .snapshots()
      .map((snap) => snap.data()?['preferences'] as Map<String, dynamic>? ?? {});
});

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isGuest = ref.watch(guestModeProvider);
    final prefsAsync = ref.watch(userPreferencesProvider);
    final user = ref.watch(currentUserProvider);
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 16),

          // Appearance (works for guests too — theme is local)
          const _SectionHeader(title: 'PREFERENCES'),
          const SizedBox(height: 8),

          if (!isGuest) ...[
            // Currency
            _SettingsTile(
              icon: Icons.attach_money,
              title: 'Currency',
              subtitle: prefsAsync.valueOrNull?['currency'] as String? ?? 'CAD',
              onTap: () => _showCurrencyPicker(context, ref),
            ),

            // Fiscal Year End
            _SettingsTile(
              icon: Icons.calendar_today_outlined,
              title: 'Fiscal Year End',
              subtitle: prefsAsync.valueOrNull?['fiscalYearEnd'] as String? ?? 'December',
              onTap: () => _showFiscalYearEndPicker(context, ref),
            ),
          ],

          // Appearance
          _SettingsTile(
            icon: Icons.dark_mode_outlined,
            title: 'Appearance',
            subtitle: switch (themeMode) {
              ThemeMode.light => 'Light',
              ThemeMode.dark => 'Dark',
              ThemeMode.system => 'System',
            },
            onTap: () => _showThemePicker(context, ref),
          ),

          if (!isGuest) ...[
            const SizedBox(height: 24),

            // Notifications section
            const _SectionHeader(title: 'NOTIFICATIONS'),
            const SizedBox(height: 8),
            _SettingsTile(
              icon: Icons.notifications_outlined,
              title: 'Notification Preferences',
              subtitle: 'Push, in-app, quiet hours',
              onTap: () => context.push('/settings/notifications'),
            ),
          ],

          const SizedBox(height: 24),

          // About section
          const _SectionHeader(title: 'ABOUT'),
          const SizedBox(height: 8),
          _SettingsTile(
            icon: Icons.info_outline,
            title: 'App Version',
            subtitle: '2.0.0',
            onTap: () {},
          ),
          if (!isGuest)
            _SettingsTile(
              icon: Icons.mail_outline,
              title: 'Account',
              subtitle: user?.email ?? '',
              onTap: () {},
            ),

          if (!isGuest) ...[
            const SizedBox(height: 32),

            // Danger zone
            OutlinedButton.icon(
              onPressed: () => _confirmDeleteAccount(context, ref),
              icon: const Icon(Icons.delete_forever_outlined,
                  color: AppColors.error),
              label: const Text('Delete Account',
                  style: TextStyle(color: AppColors.error)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.error),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  void _showThemePicker(BuildContext context, WidgetRef ref) {
    final currentMode = ref.read(themeModeProvider);
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final option in [
                (ThemeMode.system, 'System', Icons.settings_suggest_outlined),
                (ThemeMode.light, 'Light', Icons.light_mode_outlined),
                (ThemeMode.dark, 'Dark', Icons.dark_mode_outlined),
              ])
                ListTile(
                  leading: Icon(option.$3),
                  title: Text(option.$2),
                  trailing: currentMode == option.$1
                      ? const Icon(Icons.check, color: AppColors.primary)
                      : null,
                  onTap: () {
                    ref.read(themeModeProvider.notifier).setThemeMode(option.$1);
                    HapticFeedback.selectionClick();
                    Navigator.pop(ctx);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showCurrencyPicker(BuildContext context, WidgetRef ref) {
    const currencies = ['CAD', 'USD', 'EUR', 'GBP', 'INR'];
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: currencies.map((c) {
              return ListTile(
                title: Text(c),
                onTap: () async {
                  final user = ref.read(currentUserProvider);
                  if (user != null) {
                    await FirebaseFirestore.instance
                        .collection('users')
                        .doc(user.uid)
                        .set({
                      'preferences': {'currency': c}
                    }, SetOptions(merge: true));
                    HapticFeedback.selectionClick();
                  }
                  if (ctx.mounted) Navigator.pop(ctx);
                },
              );
            }).toList(),
          ),
        ),
      ),
    );
  }

  void _showFiscalYearEndPicker(BuildContext context, WidgetRef ref) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    final current = ref.read(userPreferencesProvider).valueOrNull?['fiscalYearEnd']
            as String? ??
        'December';
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: months.map((month) {
              return ListTile(
                title: Text(month),
                trailing: month == current
                    ? const Icon(Icons.check, color: AppColors.primary)
                    : null,
                onTap: () async {
                  final user = ref.read(currentUserProvider);
                  if (user != null) {
                    await FirebaseFirestore.instance
                        .collection('users')
                        .doc(user.uid)
                        .set({
                      'preferences': {'fiscalYearEnd': month}
                    }, SetOptions(merge: true));
                    HapticFeedback.selectionClick();
                  }
                  if (ctx.mounted) Navigator.pop(ctx);
                },
              );
            }).toList(),
          ),
        ),
      ),
    );
  }

  void _confirmDeleteAccount(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning_amber_rounded,
                  size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              const Text('Delete Account?',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text(
                  'This will permanently delete your account and all data.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.error),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        await _deleteAccount(context, ref);
                      },
                      child: const Text('Delete'),
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

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      // Call API to delete all Firestore data first
      try {
        final apiClient = ref.read(apiClientProvider);
        await apiClient.delete('/api/account/delete');
      } catch (apiError) {
        // API will also delete the auth account, but if the API call
        // fails we still try to delete locally
        debugPrint('[Account Delete] API error: $apiError');
      }

      // Delete the Firebase Auth account (may already be deleted by API)
      try {
        await user.delete();
      } on FirebaseAuthException catch (e) {
        if (e.code != 'user-not-found') rethrow;
        // User already deleted by API — this is fine
      }

      // Clean up local data
      await Hive.box('app_preferences').clear();

      // Auth state listener will redirect to login automatically
    } on FirebaseAuthException catch (e) {
      if (!context.mounted) return;

      if (e.code == 'requires-recent-login') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Please sign out and sign back in, then try again. '
                'Account deletion requires recent authentication.'),
            backgroundColor: AppColors.warning,
            duration: Duration(seconds: 5),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete account: ${e.message}'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to delete account: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(title,
        style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            letterSpacing: 1));
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$title: $subtitle',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            children: [
              Icon(icon, size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(width: 12),
              Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w500)),
              ),
              Text(subtitle,
                  style: TextStyle(
                      fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, size: 18,
                  color: Theme.of(context).hintColor),
            ],
          ),
        ),
      ),
    );
  }
}
