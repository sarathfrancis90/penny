import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/screens/auth/login_screen.dart';
import 'package:penny_mobile/presentation/screens/auth/signup_screen.dart';
import 'package:penny_mobile/presentation/screens/budgets/budgets_screen.dart';
import 'package:penny_mobile/presentation/screens/dashboard/dashboard_screen.dart';
import 'package:penny_mobile/presentation/screens/home/home_screen.dart';
import 'package:penny_mobile/presentation/screens/income/income_screen.dart';
import 'package:penny_mobile/presentation/screens/groups/groups_screen.dart';
import 'package:penny_mobile/presentation/screens/notifications/notifications_screen.dart';
import 'package:penny_mobile/presentation/screens/onboarding/onboarding_screen.dart';
import 'package:penny_mobile/presentation/screens/savings/savings_screen.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_detail_screen.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_search_screen.dart';
import 'package:penny_mobile/presentation/screens/groups/group_detail_screen.dart';
import 'package:penny_mobile/presentation/screens/settings/settings_screen.dart';
import 'package:penny_mobile/presentation/widgets/app_shell.dart';
import 'package:penny_mobile/data/models/expense_model.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');
      final isOnboarding = state.matchedLocation == '/onboarding';
      final onboardingComplete =
          Hive.box('app_preferences').get('onboarding_complete', defaultValue: false) as bool;

      // First-time user: show onboarding
      if (!isLoggedIn && !onboardingComplete && !isOnboarding) {
        return '/onboarding';
      }

      // Onboarding done but not logged in: go to login
      if (!isLoggedIn && !isAuthRoute && !isOnboarding) return '/auth/login';

      // Logged in user trying to access auth/onboarding: go home
      if (isLoggedIn && (isAuthRoute || isOnboarding)) return '/';

      return null;
    },
    routes: [
      // Onboarding (first-time users only)
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),

      // Auth routes (no shell, no transition — direct build)
      GoRoute(
        path: '/auth/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/auth/signup',
        builder: (context, state) => const SignupScreen(),
      ),

      // Pushed routes (no bottom nav) — Cupertino slide transitions
      GoRoute(
        path: '/search',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const ExpenseSearchScreen(),
        ),
      ),
      GoRoute(
        path: '/income',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const IncomeScreen(),
        ),
      ),
      GoRoute(
        path: '/savings',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const SavingsScreen(),
        ),
      ),
      GoRoute(
        path: '/notifications',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const NotificationsScreen(),
        ),
      ),
      GoRoute(
        path: '/settings',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const SettingsScreen(),
        ),
      ),
      GoRoute(
        path: '/groups/:id',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: GroupDetailScreen(groupId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/expenses/detail',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: ExpenseDetailScreen(expense: state.extra as ExpenseModel),
        ),
      ),

      // Main app routes (with bottom nav shell — no transition)
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomeScreen(),
            ),
          ),
          GoRoute(
            path: '/dashboard',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: DashboardScreen(),
            ),
          ),
          GoRoute(
            path: '/budgets',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: BudgetsScreen(),
            ),
          ),
          GoRoute(
            path: '/groups',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: GroupsScreen(),
            ),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: _ProfileScreen(),
            ),
          ),
        ],
      ),
    ],
  );
});

/// Builds a [CustomTransitionPage] with iOS-style Cupertino slide transition.
/// This provides the native swipe-back gesture and parallax effect.
CustomTransitionPage<void> _buildCupertinoPage({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return CupertinoPageTransition(
        primaryRouteAnimation: animation,
        secondaryRouteAnimation: secondaryAnimation,
        linearTransition: false,
        child: child,
      );
    },
  );
}

/// Profile screen with links to Income, Savings, and Settings.
class _ProfileScreen extends ConsumerWidget {
  const _ProfileScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 16),

          // User info
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: const Color(0xFFF5F5F7),
                  child: Text(
                    (user?.displayName ?? user?.email ?? '?')
                        .substring(0, 1)
                        .toUpperCase(),
                    style: const TextStyle(
                        fontSize: 28, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  user?.displayName ?? 'User',
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w600),
                ),
                Text(
                  user?.email ?? '',
                  style: const TextStyle(
                      fontSize: 14, color: Color(0xFF8E8E93)),
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),

          // Navigation links
          _ProfileTile(
            icon: Icons.account_balance_outlined,
            title: 'Income',
            subtitle: 'Manage income sources',
            onTap: () => context.push('/income'),
          ),
          _ProfileTile(
            icon: Icons.savings_outlined,
            title: 'Savings Goals',
            subtitle: 'Track your savings progress',
            onTap: () => context.push('/savings'),
          ),
          _ProfileTile(
            icon: Icons.notifications_outlined,
            title: 'Notifications',
            subtitle: 'Manage alerts and preferences',
            onTap: () => context.push('/notifications'),
          ),
          _ProfileTile(
            icon: Icons.settings_outlined,
            title: 'Settings',
            subtitle: 'Currency, fiscal year, theme',
            onTap: () => context.push('/settings'),
          ),

          const SizedBox(height: 24),

          // Sign out
          TextButton(
            onPressed: () => ref.read(authServiceProvider).signOut(),
            child: const Text('Sign Out',
                style: TextStyle(color: Color(0xFFFF3B30))),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFF5F5F7),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 20, color: const Color(0xFF8E8E93)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w500)),
                  Text(subtitle,
                      style: const TextStyle(
                          fontSize: 13, color: Color(0xFF8E8E93))),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Color(0xFFC7C7CC)),
          ],
        ),
      ),
    );
  }
}
