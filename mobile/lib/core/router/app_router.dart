import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/screens/auth/forgot_password_screen.dart';
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
import 'package:penny_mobile/presentation/screens/finances/finances_screen.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_detail_screen.dart';
import 'package:penny_mobile/presentation/screens/expenses/expense_search_screen.dart';
import 'package:penny_mobile/presentation/screens/profile/profile_screen.dart';
import 'package:penny_mobile/presentation/screens/groups/group_detail_screen.dart';
import 'package:penny_mobile/presentation/screens/settings/notification_preferences_screen.dart';
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
      GoRoute(
        path: '/auth/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
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
        path: '/budgets',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const BudgetsScreen(),
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
        path: '/settings/notifications',
        pageBuilder: (context, state) => _buildCupertinoPage(
          key: state.pageKey,
          child: const NotificationPreferencesScreen(),
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
            path: '/finances',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: FinancesScreen(),
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
              child: ProfileScreen(),
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
