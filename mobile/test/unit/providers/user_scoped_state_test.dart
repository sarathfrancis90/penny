import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/expense_refresh.dart';
import 'package:penny_mobile/presentation/providers/group_budget_providers.dart';
import 'package:penny_mobile/presentation/providers/group_income_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/group_savings_providers.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/notification_preferences_providers.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/savings_providers.dart';
import 'package:penny_mobile/presentation/providers/session_reset.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';
import 'package:penny_mobile/presentation/screens/home/conversation_list_screen.dart';
import 'package:penny_mobile/presentation/screens/settings/settings_screen.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

void main() {
  late FakeApiClient api;
  late StreamController<User?> auth;
  late ProviderContainer container;
  late int imageCacheClears;

  setUp(() {
    api = FakeApiClient();
    imageCacheClears = 0;
    auth = StreamController<User?>();
    container = ProviderContainer(
      overrides: [
        guestModeProvider.overrideWith((ref) => false),
        authStateProvider.overrideWith((ref) => auth.stream),
        apiClientProvider.overrideWithValue(api),
        clearImageCacheProvider.overrideWithValue(() => imageCacheClears++),
      ],
    );
  });

  tearDown(() async {
    container.dispose();
    await auth.close();
  });

  /// Lets stream events, provider rebuilds and fake API calls finish.
  Future<void> settle() async {
    for (var i = 0; i < 10; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  Future<void> signIn(String? uid) async {
    auth.add(uid == null ? null : createMockUser(uid: uid));
    await settle();
  }

  int gets(String path) =>
      api.calls.where((c) => c.method == 'GET' && c.path == path).length;

  test('dashboard filters are reset when a different user signs in', () async {
    container.read(sessionResetProvider);
    await signIn('user-a');

    container.read(expenseFilterProvider.notifier).state = const ExpenseFilter(
      typeFilter: ExpenseTypeFilter.group,
      categoryFilter: 'Groceries',
      groupIdFilter: 'g-of-user-a',
    );
    container.read(dashboardPeriodProvider.notifier).state =
        DashboardPeriod.custom;
    container.read(customDateRangeProvider.notifier).state = DateTimeRange(
      start: DateTime(2026, 1, 1),
      end: DateTime(2026, 1, 31),
    );

    await signIn(null);
    await signIn('user-b');

    expect(container.read(expenseFilterProvider).groupIdFilter, isNull);
    expect(container.read(expenseFilterProvider).categoryFilter, isNull);
    expect(
      container.read(expenseFilterProvider).typeFilter,
      ExpenseTypeFilter.all,
    );
    expect(container.read(dashboardPeriodProvider), DashboardPeriod.thisMonth);
    expect(container.read(customDateRangeProvider), isNull);
  });

  test('group data cached for one user is dropped at sign-out and loaded '
      'again for the next user', () async {
    await signIn('user-a');
    final providers = [
      groupMembersProvider('g1'),
      groupExpensesProvider('g1'),
      pendingGroupExpensesProvider('g1'),
      groupActivitiesProvider('g1'),
    ];
    var subs = [for (final p in providers) container.listen(p, (_, _) {})];
    await settle();
    expect(gets(ApiEndpoints.groupMembers('g1')), 1);
    expect(gets(ApiEndpoints.expenses), 2);
    expect(gets(ApiEndpoints.groupActivities('g1')), 1);

    // Signing out closes the group screen: nothing listens any more.
    for (final s in subs) {
      s.close();
    }
    await signIn(null);
    for (final p in providers) {
      expect(container.exists(p), isFalse, reason: '$p is still cached');
    }

    await signIn('user-b');
    subs = [for (final p in providers) container.listen(p, (_, _) {})];
    await settle();
    expect(gets(ApiEndpoints.groupMembers('g1')), 2);
    expect(gets(ApiEndpoints.expenses), 4);
    expect(gets(ApiEndpoints.groupActivities('g1')), 2);

    // A user change while a screen is still open reloads too.
    await signIn('user-c');
    expect(gets(ApiEndpoints.groupMembers('g1')), 3);
    for (final s in subs) {
      s.close();
    }
  });

  test(
    'refreshExpenseData reloads the expense list and the group data',
    () async {
      await signIn('user-a');
      final subs = [
        container.listen(allExpensesProvider, (_, _) {}),
        container.listen(groupExpensesProvider('g1'), (_, _) {}),
        container.listen(groupByIdProvider('g1'), (_, _) {}),
      ];
      addTearDown(() {
        for (final s in subs) {
          s.close();
        }
      });
      await settle();
      expect(gets(ApiEndpoints.expenses), 2);
      expect(gets(ApiEndpoints.groupById('g1')), 1);

      refreshExpenseData(container.invalidate);
      await settle();
      expect(gets(ApiEndpoints.expenses), 3);

      refreshExpenseData(container.invalidate, groupId: 'g1');
      await settle();
      expect(gets(ApiEndpoints.expenses), 5);
      expect(gets(ApiEndpoints.groupById('g1')), 2);
    },
  );

  group('switching accounts on the same phone', () {
    /// What every screen of the app can show for the signed-in user.
    final rootProviders = <ProviderListenable<AsyncValue<Object?>>>[
      allExpensesProvider,
      userGroupsProvider,
      notificationsProvider,
      incomeSourcesProvider,
      savingsGoalsProvider,
      budgetsProvider,
      conversationsListProvider,
      searchAllConversationsProvider('a'),
      userPreferencesProvider,
      defaultGroupProvider,
      notificationSettingsProvider,
      notificationTypePrefsProvider,
      pendingInvitationsProvider,
      groupByIdProvider('g1'),
      currentUserMembershipProvider('g1'),
      groupBudgetsProvider('g1'),
      groupIncomeSourcesProvider('g1'),
      groupSavingsGoalsProvider('g1'),
      messagesProvider('c1'),
    ];

    /// Totals and lists derived from the data above.
    final derivedProviders = <ProviderListenable<Object?>>[
      currentMonthExpensesProvider,
      currentMonthTotalProvider,
      lastMonthTotalProvider,
      categoryBreakdownProvider,
      filteredExpensesProvider,
      filteredCountedExpensesProvider,
      dailySpendingProvider,
      cashFlowProvider,
      budgetPeriodExpensesProvider,
      budgetUsageProvider,
      totalBudgetLimitProvider,
      totalBudgetSpentProvider,
      budgetUsageForCategoryProvider('Groceries'),
      activeIncomeSourcesProvider,
      totalMonthlyIncomeProvider,
      totalSavedProvider,
      totalTargetProvider,
      unreadCountProvider,
      addableGroupsProvider,
      totalGroupBudgetLimitProvider('g1'),
      totalGroupMonthlyIncomeProvider('g1'),
      groupTotalSavedProvider('g1'),
      groupTotalTargetProvider('g1'),
    ];

    void serveUserA() {
      final today = DateTime.now().toUtc().toIso8601String();
      api.stub(
        ApiEndpoints.expenses,
        () => {
          'expenses': [
            {
              'id': 'e-a',
              'userId': 'user-a',
              'vendor': 'A private vendor',
              'amount': 42.0,
              'category': 'Groceries',
              'date': today,
              'createdAt': today,
              'updatedAt': today,
            },
          ],
        },
      );
      api.stub(
        ApiEndpoints.notifications,
        () => {
          'notifications': [
            {
              'id': 'n-a',
              'type': 'budget_warning',
              'title': 'For A',
              'body': 'A only',
              'read': false,
            },
          ],
        },
      );
    }

    List<ProviderSubscription<Object?>> listenAll() => [
      for (final p in [...rootProviders, ...derivedProviders])
        container.listen<Object?>(p, (_, _) {}),
    ];

    test('nothing loaded for one user is shown to the next user while their '
        'own data loads', () async {
      container.read(sessionResetProvider);
      serveUserA();
      await signIn('user-a');
      var subs = listenAll();
      await settle();
      expect(container.read(allExpensesProvider).valueOrNull, hasLength(1));
      expect(container.read(currentMonthTotalProvider), 42);
      expect(container.read(unreadCountProvider), 1);

      // Sign-out closes every screen.
      for (final s in subs) {
        s.close();
      }
      await signIn(null);

      // User B's data is slow to arrive.
      api.holdResponses = true;
      await signIn('user-b');
      subs = listenAll();
      await settle();

      for (final p in rootProviders) {
        final value = container.read(p);
        expect(value.hasValue, isFalse, reason: '$p shows $value');
        expect(value.isLoading, isTrue, reason: '$p');
      }
      expect(container.read(currentMonthExpensesProvider), isEmpty);
      expect(container.read(filteredExpensesProvider), isEmpty);
      expect(container.read(currentMonthTotalProvider), 0);
      expect(container.read(unreadCountProvider), 0);
      expect(container.read(addableGroupsProvider).hasValue, isFalse);
      for (final s in subs) {
        s.close();
      }
    });

    test(
      'everything cached for a user is dropped once they sign out',
      () async {
        serveUserA();
        await signIn('user-a');
        final subs = listenAll();
        await settle();
        for (final s in subs) {
          s.close();
        }
        await settle();

        await signIn(null);
        for (final p in [...rootProviders, ...derivedProviders]) {
          final provider = p is ProviderBase ? p : null;
          if (provider == null) continue;
          expect(
            container.exists(provider),
            isFalse,
            reason: '$p still cached',
          );
        }
      },
    );

    test('while the same user stays signed in, data is not reloaded just '
        'because a screen was closed', () async {
      serveUserA();
      await signIn('user-a');
      var sub = container.listen(allExpensesProvider, (_, _) {});
      await settle();
      sub.close();
      await settle();

      sub = container.listen(allExpensesProvider, (_, _) {});
      await settle();
      expect(gets(ApiEndpoints.expenses), 1);
      expect(container.read(allExpensesProvider).valueOrNull, hasLength(1));
      sub.close();
    });

    test('the selected budget month and cached images are reset too', () async {
      container.read(sessionResetProvider);
      await signIn('user-a');
      container.read(budgetPeriodProvider.notifier).state = const BudgetPeriod(
        month: 3,
        year: 2025,
      );

      await signIn(null);
      await signIn('user-b');

      final now = DateTime.now();
      expect(
        container.read(budgetPeriodProvider),
        BudgetPeriod(month: now.month, year: now.year),
      );
      expect(imageCacheClears, greaterThanOrEqualTo(2));
    });
  });
}
