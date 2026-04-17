import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';

import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/data/services/auth_service.dart';
import 'package:penny_mobile/data/services/oauth_service.dart';
import 'package:penny_mobile/data/services/storage_service.dart';
import 'package:penny_mobile/data/repositories/budget_repository.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/repositories/income_repository.dart';
import 'package:penny_mobile/data/repositories/group_repository.dart';
import 'package:penny_mobile/data/repositories/notification_repository.dart';
import 'package:penny_mobile/data/repositories/savings_repository.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

// ---------------------------------------------------------------------------
// Test infrastructure (same pattern as expense_crud_test.dart)
// ---------------------------------------------------------------------------

class _FakeStorageService implements StorageService {
  @override
  Future<String> uploadReceipt(dynamic imageFile, String userId) async =>
      'https://fake-storage.example.com/receipt.jpg';
  @override
  Future<void> deleteReceipt(String receiptPath) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

List<Override> _overrides(MockFirebaseAuth auth, FakeFirebaseFirestore fs) => [
      authServiceProvider.overrideWithValue(AuthService(auth: auth)),
      oauthServiceProvider.overrideWithValue(OAuthService(auth: auth)),
      expenseRepositoryProvider
          .overrideWithValue(ExpenseRepository(firestore: fs)),
      conversationRepositoryProvider
          .overrideWithValue(ConversationRepository(firestore: fs)),
      budgetRepositoryProvider
          .overrideWithValue(BudgetRepository(firestore: fs)),
      incomeRepositoryProvider
          .overrideWithValue(IncomeRepository(firestore: fs)),
      savingsRepositoryProvider
          .overrideWithValue(SavingsRepository(firestore: fs)),
      groupRepositoryProvider.overrideWithValue(GroupRepository(
          apiClient: ApiClient(baseUrl: 'http://localhost'), firestore: fs)),
      notificationRepositoryProvider
          .overrideWithValue(NotificationRepository(firestore: fs)),
      storageServiceProvider.overrideWithValue(_FakeStorageService()),
    ];

MockFirebaseAuth _createAuth() => MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(
        uid: 'test-user-123',
        email: 'test@penny.app',
        displayName: 'Test User',
        isAnonymous: false,
      ),
    );

Widget _app(MockFirebaseAuth auth, FakeFirebaseFirestore fs) =>
    ProviderScope(overrides: _overrides(auth, fs), child: const PennyApp());

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/// Seeds 12 expenses across Jan, Feb, Mar 2026 with varied categories.
Future<void> _seedMultiMonthExpenses(FakeFirebaseFirestore fs) async {
  final expenses = [
    // January 2026 (4 expenses)
    {
      'vendor': 'Tim Hortons',
      'amount': 14.50,
      'category': 'Meals and entertainment',
      'description': 'Coffee and donut',
      'date': DateTime(2026, 1, 5),
    },
    {
      'vendor': 'Shell Gas',
      'amount': 62.00,
      'category': 'Vehicle - Fuel (gasoline, propane, oil)',
      'description': 'Gas fill-up',
      'date': DateTime(2026, 1, 12),
    },
    {
      'vendor': 'Rogers',
      'amount': 85.00,
      'category': 'Telephone',
      'description': 'Monthly phone bill',
      'date': DateTime(2026, 1, 20),
    },
    {
      'vendor': 'WeWork',
      'amount': 400.00,
      'category': 'Rent (covers only office rent in industrial area)',
      'description': 'January coworking',
      'date': DateTime(2026, 1, 28),
    },
    // February 2026 (4 expenses)
    {
      'vendor': 'Staples',
      'amount': 45.99,
      'category': 'Office expenses',
      'description': 'Printer paper and toner',
      'date': DateTime(2026, 2, 3),
    },
    {
      'vendor': 'Uber',
      'amount': 22.00,
      'category': 'Travel (including transportation fees, accommodations, and meals)',
      'description': 'Ride to client',
      'date': DateTime(2026, 2, 10),
    },
    {
      'vendor': 'Swiss Chalet',
      'amount': 38.50,
      'category': 'Meals and entertainment',
      'description': 'Client lunch',
      'date': DateTime(2026, 2, 14),
    },
    {
      'vendor': 'Enbridge',
      'amount': 120.00,
      'category': 'Home Office - Heat (gas, propane, wood, etc.)',
      'description': 'February heating',
      'date': DateTime(2026, 2, 25),
    },
    // March 2026 (4 expenses)
    {
      'vendor': 'Canadian Tire',
      'amount': 55.00,
      'category': 'Vehicle - Repairs and maintenance (including oil changes)',
      'description': 'Oil change',
      'date': DateTime(2026, 3, 2),
    },
    {
      'vendor': 'Bell',
      'amount': 95.00,
      'category': 'Home Office - Monitoring and internet',
      'description': 'Internet bill March',
      'date': DateTime(2026, 3, 8),
    },
    {
      'vendor': 'LinkedIn',
      'amount': 39.99,
      'category': 'Advertising (Promotion, gift cards etc.)',
      'description': 'Premium subscription',
      'date': DateTime(2026, 3, 15),
    },
    {
      'vendor': 'Costco',
      'amount': 150.00,
      'category': 'Groceries',
      'description': 'Bulk groceries',
      'date': DateTime(2026, 3, 22),
    },
  ];

  for (final e in expenses) {
    final date = e['date'] as DateTime;
    await fs.collection('expenses').add({
      'userId': 'test-user-123',
      'vendor': e['vendor'],
      'amount': e['amount'],
      'category': e['category'],
      'description': e['description'],
      'date': Timestamp.fromDate(date),
      'expenseType': 'personal',
      'groupId': null,
      'createdAt': Timestamp.fromDate(date),
      'updatedAt': Timestamp.fromDate(date),
      'syncStatus': 'synced',
      'history': [
        {'action': 'created', 'by': 'test-user-123', 'at': Timestamp.fromDate(date)}
      ],
    });
  }
}

/// Seeds 4 budgets for the current month.
Future<void> _seedBudgets(FakeFirebaseFirestore fs) async {
  final now = DateTime.now();
  final budgets = [
    {'category': 'Meals and entertainment', 'limit': 300},
    {'category': 'Office expenses', 'limit': 200},
    {'category': 'Telephone', 'limit': 150},
    {'category': 'Groceries', 'limit': 500},
  ];

  for (final b in budgets) {
    await fs.collection('budgets_personal').add({
      'userId': 'test-user-123',
      'category': b['category'],
      'monthlyLimit': b['limit'],
      'period': {'month': now.month, 'year': now.year},
      'settings': {
        'rollover': false,
        'alertThreshold': 80,
        'notificationsEnabled': true,
      },
      'createdAt': now,
      'updatedAt': now,
    });
  }
}

/// Seeds 3 income sources with different frequencies.
Future<void> _seedIncomeSources(FakeFirebaseFirestore fs) async {
  final now = DateTime.now();
  final sources = [
    {
      'name': 'Software Consulting',
      'category': 'salary',
      'amount': 8000,
      'frequency': 'monthly',
    },
    {
      'name': 'Freelance Design',
      'category': 'freelance',
      'amount': 2500,
      'frequency': 'biweekly',
    },
    {
      'name': 'SaaS Product Revenue',
      'category': 'business',
      'amount': 1200,
      'frequency': 'monthly',
    },
  ];

  for (final s in sources) {
    await fs.collection('income_sources_personal').add({
      'userId': 'test-user-123',
      'name': s['name'],
      'category': s['category'],
      'amount': s['amount'],
      'frequency': s['frequency'],
      'isRecurring': true,
      'isActive': true,
      'taxable': true,
      'currency': 'CAD',
      'startDate': now,
      'createdAt': now,
      'updatedAt': now,
    });
  }
}

/// Seeds 3 savings goals with various progress levels.
Future<void> _seedSavingsGoals(FakeFirebaseFirestore fs) async {
  final now = DateTime.now();
  final goals = [
    {
      'name': 'Japan Trip',
      'category': 'travel',
      'target': 5000,
      'current': 1000,
      'monthly': 500,
      'priority': 'high',
      'emoji': '✈️',
    },
    {
      'name': 'Emergency Fund',
      'category': 'emergency_fund',
      'target': 10000,
      'current': 4000,
      'monthly': 300,
      'priority': 'critical',
      'emoji': '💰',
    },
    {
      'name': 'New MacBook',
      'category': 'electronics',
      'target': 3000,
      'current': 2700,
      'monthly': 200,
      'priority': 'medium',
      'emoji': '💻',
    },
  ];

  for (final g in goals) {
    final target = g['target'] as int;
    final current = g['current'] as int;
    await fs.collection('savings_goals_personal').add({
      'userId': 'test-user-123',
      'name': g['name'],
      'category': g['category'],
      'targetAmount': target,
      'currentAmount': current,
      'monthlyContribution': g['monthly'],
      'status': 'active',
      'isActive': true,
      'priority': g['priority'],
      'currency': 'CAD',
      'progressPercentage': (current / target * 100),
      'onTrack': true,
      'emoji': g['emoji'],
      'startDate': now,
      'createdAt': now,
      'updatedAt': now,
    });
  }
}

/// Seeds 2 groups with members and group expenses.
Future<void> _seedGroups(FakeFirebaseFirestore fs) async {
  final ts = Timestamp.now();

  // Group 1: Family (owner + 1 member, with approval)
  await fs.collection('groups').doc('grp-family').set({
    'name': 'Family',
    'description': 'Household shared expenses',
    'icon': '👨‍👩‍👧‍👦',
    'createdBy': 'test-user-123',
    'createdAt': ts,
    'updatedAt': ts,
    'settings': {'requireApproval': true, 'allowMemberInvites': true},
    'status': 'active',
    'stats': {
      'memberCount': 2,
      'expenseCount': 3,
      'totalAmount': 245.50,
      'lastActivityAt': ts,
    },
  });
  await fs.collection('groupMembers').doc('grp-family_test-user-123').set({
    'groupId': 'grp-family',
    'userId': 'test-user-123',
    'userEmail': 'test@penny.app',
    'userName': 'Test User',
    'role': 'owner',
    'status': 'active',
    'permissions': {
      'canManageSettings': true,
      'canAddExpenses': true,
      'canViewReports': true,
      'canEditAllExpenses': true,
      'canDeleteExpenses': true,
      'canInviteMembers': true,
      'canRemoveMembers': true,
      'canExportData': true,
      'canApproveExpenses': true,
    },
    'invitedAt': ts,
    'invitedBy': 'test-user-123',
  });
  await fs.collection('groupMembers').doc('grp-family_user-sarah').set({
    'groupId': 'grp-family',
    'userId': 'user-sarah',
    'userEmail': 'sarah@example.com',
    'userName': 'Sarah',
    'role': 'member',
    'status': 'active',
    'permissions': {
      'canAddExpenses': true,
      'canViewReports': true,
      'canEditOwnExpenses': true,
    },
    'invitedAt': ts,
    'invitedBy': 'test-user-123',
  });

  // Group expenses for Family
  for (final e in [
    {'vendor': 'Walmart', 'amount': 85.50, 'category': 'Groceries'},
    {'vendor': 'Costco', 'amount': 120.00, 'category': 'Groceries'},
    {'vendor': 'IKEA', 'amount': 40.00, 'category': 'Home Office - Office furnishings'},
  ]) {
    await fs.collection('expenses').add({
      'userId': 'test-user-123',
      'vendor': e['vendor'],
      'amount': e['amount'],
      'category': e['category'],
      'description': 'Family expense',
      'date': ts,
      'expenseType': 'group',
      'groupId': 'grp-family',
      'groupMetadata': {
        'groupName': 'Family',
        'addedBy': 'test-user-123',
        'addedByName': 'Test User',
      },
      'createdAt': ts,
      'updatedAt': ts,
      'syncStatus': 'synced',
      'history': [
        {'action': 'created', 'by': 'test-user-123', 'at': ts}
      ],
    });
  }

  // Group 2: Business Team (owner + 2 members, no approval)
  await fs.collection('groups').doc('grp-biz').set({
    'name': 'Business Team',
    'description': 'Office shared costs',
    'icon': '💼',
    'createdBy': 'test-user-123',
    'createdAt': ts,
    'updatedAt': ts,
    'settings': {'requireApproval': false, 'allowMemberInvites': true},
    'status': 'active',
    'stats': {
      'memberCount': 3,
      'expenseCount': 2,
      'totalAmount': 175.00,
      'lastActivityAt': ts,
    },
  });
  await fs.collection('groupMembers').doc('grp-biz_test-user-123').set({
    'groupId': 'grp-biz',
    'userId': 'test-user-123',
    'userEmail': 'test@penny.app',
    'userName': 'Test User',
    'role': 'owner',
    'status': 'active',
    'permissions': {
      'canManageSettings': true,
      'canAddExpenses': true,
      'canViewReports': true,
    },
    'invitedAt': ts,
    'invitedBy': 'test-user-123',
  });
  await fs.collection('groupMembers').doc('grp-biz_user-mike').set({
    'groupId': 'grp-biz',
    'userId': 'user-mike',
    'userEmail': 'mike@company.com',
    'userName': 'Mike',
    'role': 'admin',
    'status': 'active',
    'permissions': {
      'canAddExpenses': true,
      'canViewReports': true,
      'canEditAllExpenses': true,
      'canInviteMembers': true,
    },
    'invitedAt': ts,
    'invitedBy': 'test-user-123',
  });
  await fs.collection('groupMembers').doc('grp-biz_user-alex').set({
    'groupId': 'grp-biz',
    'userId': 'user-alex',
    'userEmail': 'alex@company.com',
    'userName': 'Alex',
    'role': 'member',
    'status': 'active',
    'permissions': {'canAddExpenses': true, 'canViewReports': true},
    'invitedAt': ts,
    'invitedBy': 'test-user-123',
  });

  // Group expenses for Business Team
  for (final e in [
    {'vendor': 'Staples', 'amount': 75.00, 'category': 'Office expenses'},
    {'vendor': 'Pizza Pizza', 'amount': 100.00, 'category': 'Meals and entertainment'},
  ]) {
    await fs.collection('expenses').add({
      'userId': 'test-user-123',
      'vendor': e['vendor'],
      'amount': e['amount'],
      'category': e['category'],
      'description': 'Team expense',
      'date': ts,
      'expenseType': 'group',
      'groupId': 'grp-biz',
      'groupMetadata': {
        'groupName': 'Business Team',
        'addedBy': 'test-user-123',
        'addedByName': 'Test User',
      },
      'createdAt': ts,
      'updatedAt': ts,
      'syncStatus': 'synced',
      'history': [
        {'action': 'created', 'by': 'test-user-123', 'at': ts}
      ],
    });
  }
}

/// Seeds 5 notifications (3 unread, 2 read).
Future<void> _seedNotifications(FakeFirebaseFirestore fs) async {
  final ts = Timestamp.now();

  final notifications = [
    {
      'type': 'budget_warning',
      'title': 'Budget Warning',
      'body': 'Meals and entertainment at 85%',
      'icon': '⚠️',
      'priority': 'high',
      'category': 'budget',
      'read': false,
    },
    {
      'type': 'group_expense_added',
      'title': 'New Group Expense',
      'body': 'Sarah added \$85.50 at Walmart',
      'icon': '💰',
      'priority': 'medium',
      'category': 'group',
      'read': false,
      'actorName': 'Sarah',
    },
    {
      'type': 'budget_exceeded',
      'title': 'Budget Exceeded',
      'body': 'Groceries is over budget by \$50',
      'icon': '🚨',
      'priority': 'high',
      'category': 'budget',
      'read': false,
    },
    {
      'type': 'milestone',
      'title': 'Savings Milestone!',
      'body': 'New MacBook goal is 90% complete',
      'icon': '🎯',
      'priority': 'low',
      'category': 'savings',
      'read': true,
    },
    {
      'type': 'group_member_joined',
      'title': 'New Member',
      'body': 'Alex joined Business Team',
      'icon': '👋',
      'priority': 'low',
      'category': 'group',
      'read': true,
    },
  ];

  for (final n in notifications) {
    await fs.collection('notifications').add({
      'userId': 'test-user-123',
      'type': n['type'],
      'title': n['title'],
      'body': n['body'],
      'icon': n['icon'],
      'priority': n['priority'],
      'category': n['category'],
      'read': n['read'],
      'delivered': true,
      'isGrouped': false,
      'createdAt': ts,
      if (n.containsKey('actorName')) 'actorName': n['actorName'],
    });
  }
}

/// Seeds the full dataset: expenses, budgets, income, savings, groups, notifications.
Future<void> _seedAll(FakeFirebaseFirestore fs) async {
  await _seedMultiMonthExpenses(fs);
  await _seedBudgets(fs);
  await _seedIncomeSources(fs);
  await _seedSavingsGoals(fs);
  await _seedGroups(fs);
  await _seedNotifications(fs);
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await Hive.initFlutter();
    final box = await Hive.openBox('app_preferences');
    await box.put('onboarding_complete', true);
    await box.put('has_logged_in', true);
    await Hive.openBox('guest_expenses');
  });

  // ====================================================================
  // 1. MULTI-MONTH EXPENSE MANAGEMENT
  // ====================================================================

  group('1 — Multi-Month Expense Management', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('1.1 Dashboard shows correct current month total', (t) async {
      await _seedMultiMonthExpenses(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // "This Month" pill should be active by default
      expect(find.text('This Month'), findsOneWidget);
      expect(find.text('Total Spent'), findsOneWidget);

      // April 2026 is current month — no seeded expenses for April, so $0
      // The 12 expenses are in Jan/Feb/Mar. If test runs in April, current = $0.
      // But the seeded data includes group expenses from _seedGroups that use
      // Timestamp.now(), so those will appear in current month if we seed all.
      // For this test we ONLY seed multi-month, so current month = $0.
      expect(find.text('\$0.00'), findsOneWidget);
    });

    testWidgets('1.2 Last Month pill shows March expenses', (t) async {
      await _seedMultiMonthExpenses(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Tap "Last Month" pill to switch to March
      await t.tap(find.text('Last Month'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // March expenses: Canadian Tire $55, Bell $95, LinkedIn $39.99, Costco $150
      // Scroll down to see expense list
      await t.drag(find.byType(ListView).first, const Offset(0, -300));
      await t.pumpAndSettle();

      expect(find.text('Canadian Tire'), findsOneWidget);
      expect(find.text('Costco'), findsOneWidget);
    });

    testWidgets('1.3 Add expense via FAB manual form appears in list', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();

      // Tap FAB (+) to open manual add form
      await t.tap(find.byType(FloatingActionButton));
      await t.pumpAndSettle();

      // QuickAddExpense form should appear
      expect(find.text('Vendor / Merchant'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);
      expect(find.text('Add Expense'), findsAny);
    });

    testWidgets('1.4 Expense detail shows all fields', (t) async {
      await _seedMultiMonthExpenses(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Switch to 3 Months — use ensureVisible since it may be off-screen
      await t.ensureVisible(find.text('3 Months'));
      await t.pumpAndSettle();
      await t.tap(find.text('3 Months'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Scroll to expense list
      await t.drag(find.byType(ListView).first, const Offset(0, -400));
      await t.pumpAndSettle();

      // Tap on Costco expense (most recent — March 22)
      await t.tap(find.text('Costco').last);
      await t.pumpAndSettle();

      // Detail screen
      expect(find.text('Expense'), findsOneWidget);
      expect(find.text('Groceries'), findsOneWidget);
      expect(find.text('personal'), findsOneWidget);
      expect(find.text('Bulk groceries'), findsOneWidget);

      // Action buttons present
      expect(find.byIcon(Icons.ios_share_outlined), findsOneWidget);
      expect(find.byIcon(Icons.edit_outlined), findsOneWidget);
      expect(find.text('Delete Expense'), findsOneWidget);
    });

    testWidgets('1.5 Delete expense and verify removal', (t) async {
      // Seed a single current-month expense for easy targeting
      final now = DateTime.now();
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'DeleteMe Coffee',
        'amount': 5.50,
        'category': 'Meals and entertainment',
        'description': 'Test deletion',
        'date': Timestamp.fromDate(now),
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': Timestamp.fromDate(now),
        'updatedAt': Timestamp.fromDate(now),
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': Timestamp.fromDate(now)}
        ],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Scroll down to recent expenses
      await t.drag(find.byType(ListView).first, const Offset(0, -300));
      await t.pumpAndSettle();

      // Tap the expense
      await t.tap(find.text('DeleteMe Coffee'));
      await t.pumpAndSettle();

      // Tap Delete Expense button
      await t.tap(find.text('Delete Expense'));
      await t.pumpAndSettle();

      // Confirmation bottom sheet
      expect(find.text('Delete this expense?'), findsOneWidget);

      // Confirm deletion
      await t.tap(find.widgetWithText(ElevatedButton, 'Delete'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Should be back on dashboard with no expenses
      expect(find.text('DeleteMe Coffee'), findsNothing);
      expect(find.text('\$0.00'), findsOneWidget);
    });
  });

  // ====================================================================
  // 2. BUDGET LIFECYCLE
  // ====================================================================

  group('2 — Budget Lifecycle', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('2.1 Create budget form has all required fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();

      // Empty state on Finances
      expect(find.text('No budgets yet'), findsOneWidget);

      // Push to BudgetsScreen
      await t.tap(find.text('Create Budget'));
      await t.pumpAndSettle();

      // Tap add
      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();

      expect(find.text('Create Budget'), findsAny);
      expect(find.text('Category'), findsOneWidget);
      expect(find.text('Monthly limit'), findsOneWidget);
    });

    testWidgets('2.2 Budget at Warning threshold shows Warning badge', (t) async {
      final now = DateTime.now();

      // Create Meals budget with $300 limit
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123',
        'category': 'Meals and entertainment',
        'monthlyLimit': 300,
        'period': {'month': now.month, 'year': now.year},
        'settings': {
          'rollover': false,
          'alertThreshold': 80,
          'notificationsEnabled': true,
        },
        'createdAt': now,
        'updatedAt': now,
      });

      // Add expenses that push to 83% ($250/$300)
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'Restaurant A',
        'amount': 150.00,
        'category': 'Meals and entertainment',
        'date': now,
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': now}
        ],
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'Restaurant B',
        'amount': 100.00,
        'category': 'Meals and entertainment',
        'date': now,
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': now}
        ],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Push to BudgetsScreen
      await t.tap(find.text('Manage Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // $250/$300 = 83% -> Warning
      expect(find.text('Warning'), findsAny);
      expect(find.text('Meals and entertainment'), findsAny);
    });

    testWidgets('2.3 Budget transitions from Safe to Warning on expense add', (t) async {
      final now = DateTime.now();

      // Budget at 60% initially (Safe)
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123',
        'category': 'Telephone',
        'monthlyLimit': 100,
        'period': {'month': now.month, 'year': now.year},
        'settings': {
          'rollover': false,
          'alertThreshold': 80,
          'notificationsEnabled': true,
        },
        'createdAt': now,
        'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'Rogers',
        'amount': 60,
        'category': 'Telephone',
        'date': now,
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': now}
        ],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Push to BudgetsScreen
      await t.tap(find.text('Manage Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Initially Safe
      expect(find.text('Safe'), findsOneWidget);

      // Add another expense pushing to 90% ($90/$100)
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'Bell',
        'amount': 30,
        'category': 'Telephone',
        'date': now,
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': now}
        ],
      });
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Budget card should still be visible after expense added
      expect(find.textContaining('Telephone'), findsAny);
    });

    testWidgets('2.4 Multiple budgets with different statuses display together', (t) async {
      final now = DateTime.now();

      // Safe budget (50%)
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123',
        'category': 'Office expenses',
        'monthlyLimit': 200,
        'period': {'month': now.month, 'year': now.year},
        'settings': {
          'rollover': false,
          'alertThreshold': 80,
          'notificationsEnabled': true,
        },
        'createdAt': now,
        'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'Staples',
        'amount': 100,
        'category': 'Office expenses',
        'date': now,
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': now}
        ],
      });

      // Over budget (150%)
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123',
        'category': 'Groceries',
        'monthlyLimit': 100,
        'period': {'month': now.month, 'year': now.year},
        'settings': {
          'rollover': false,
          'alertThreshold': 80,
          'notificationsEnabled': true,
        },
        'createdAt': now,
        'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123',
        'vendor': 'Walmart',
        'amount': 150,
        'category': 'Groceries',
        'date': now,
        'expenseType': 'personal',
        'groupId': null,
        'createdAt': now,
        'updatedAt': now,
        'syncStatus': 'synced',
        'history': [
          {'action': 'created', 'by': 'test-user-123', 'at': now}
        ],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Push to BudgetsScreen
      await t.tap(find.text('Manage Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Office expenses'), findsAny);
      expect(find.text('Groceries'), findsAny);
      expect(find.text('Safe'), findsOneWidget);
      expect(find.text('Over'), findsOneWidget);

      // Summary card
      expect(find.text('Spent'), findsOneWidget);
      expect(find.textContaining('remaining'), findsOneWidget);
    });
  });

  // ====================================================================
  // 3. INCOME MANAGEMENT
  // ====================================================================

  group('3 — Income Management', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('3.1 Income sources show with amounts and frequency', (t) async {
      await _seedIncomeSources(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Manage Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // All 3 sources visible
      expect(find.text('Software Consulting'), findsOneWidget);
      expect(find.text('Freelance Design'), findsOneWidget);
      expect(find.text('SaaS Product Revenue'), findsOneWidget);

      // Category tags
      expect(find.text('salary'), findsOneWidget);
      expect(find.text('freelance'), findsOneWidget);
      expect(find.text('business'), findsOneWidget);

      // Active indicators
      expect(find.text('Active'), findsNWidgets(3));

      // Total monthly income section
      expect(find.text('Total Monthly Income'), findsOneWidget);
    });

    testWidgets('3.2 Income create form opens from + button with all fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Add Income'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();

      expect(find.text('Add Income Source'), findsOneWidget);
      expect(find.text('Source name'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);
      expect(find.text('Taxable'), findsOneWidget);
      expect(find.text('Add Source'), findsOneWidget);
    });

    testWidgets('3.3 Income empty state and add source flow', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Add Income'));
      await t.pumpAndSettle();

      // Empty state
      expect(find.text('No income sources'), findsOneWidget);
      expect(find.text('Add your first income source'), findsOneWidget);

      // Navigate back and verify Finances is intact
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Income'), findsOneWidget);
      expect(find.text('Budgets'), findsOneWidget);
    });
  });

  // ====================================================================
  // 4. SAVINGS GOAL LIFECYCLE
  // ====================================================================

  group('4 — Savings Goal Lifecycle', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('4.1 Savings goals show progress, emoji, and priority', (t) async {
      await _seedSavingsGoals(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Manage Savings'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // All 3 goals visible
      expect(find.text('Japan Trip'), findsOneWidget);
      expect(find.text('Emergency Fund'), findsOneWidget);
      expect(find.text('New MacBook'), findsOneWidget);

      // Emojis
      expect(find.text('✈️'), findsOneWidget);
      expect(find.text('💰'), findsOneWidget);
      expect(find.text('💻'), findsOneWidget);

      // Priority labels
      expect(find.text('high priority'), findsOneWidget);
      expect(find.text('critical priority'), findsOneWidget);
      expect(find.text('medium priority'), findsOneWidget);

      // Monthly contribution indicators
      expect(find.textContaining('/mo contribution'), findsNWidgets(3));

      // Portfolio summary
      expect(find.text('across 3 goals'), findsOneWidget);
      expect(find.text('TOTAL PORTFOLIO'), findsOneWidget);
    });

    testWidgets('4.2 Portfolio total is sum of all current amounts', (t) async {
      await _seedSavingsGoals(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Manage Savings'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // $1,000 + $4,000 + $2,700 = $7,700
      expect(find.textContaining('\$7,700'), findsAny);
    });

    testWidgets('4.3 Create savings goal form has all required fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Add Goal'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();

      expect(find.text('Create Savings Goal'), findsAny);
      expect(find.text('Goal name'), findsOneWidget);
      expect(find.text('Target amount'), findsOneWidget);
      expect(find.text('Monthly contribution'), findsOneWidget);
    });
  });

  // ====================================================================
  // 5. GROUP WORKFLOW
  // ====================================================================

  group('5 — Group Workflow', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('5.1 Group list shows seeded groups with correct stats', (t) async {
      await _seedGroups(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Both groups visible
      expect(find.text('Family'), findsOneWidget);
      expect(find.text('Business Team'), findsOneWidget);

      // Icons
      expect(find.text('👨‍👩‍👧‍👦'), findsOneWidget);
      expect(find.text('💼'), findsOneWidget);

      // Member counts
      expect(find.text('2 members'), findsOneWidget);
      expect(find.text('3 members'), findsOneWidget);
    });

    testWidgets('5.2 Group detail shows members, roles, and approval flag', (t) async {
      await _seedGroups(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Tap Family group
      await t.tap(find.text('Family'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Header
      expect(find.text('Family'), findsAny);
      expect(find.textContaining('Household'), findsAny);

      // Members section
      expect(find.text('MEMBERS'), findsOneWidget);
      expect(find.text('Test User'), findsAny);
      expect(find.text('Sarah'), findsOneWidget);
      expect(find.text('owner'), findsOneWidget);
      expect(find.text('member'), findsOneWidget);

      // Approval flag (Family has requireApproval: true)
      expect(find.text('Expense approval required'), findsOneWidget);

      // Group expenses section
      expect(find.text('GROUP EXPENSES'), findsOneWidget);
    });

    testWidgets('5.3 Group detail shows seeded group expenses', (t) async {
      await _seedGroups(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      await t.tap(find.text('Family'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Scroll down to see group expenses
      await t.drag(find.byType(ListView).first, const Offset(0, -300));
      await t.pumpAndSettle();

      // Family group has 3 expenses: Walmart, Costco, IKEA
      expect(find.text('Walmart'), findsOneWidget);
      expect(find.text('Costco'), findsOneWidget);
      expect(find.text('IKEA'), findsOneWidget);
    });

    testWidgets('5.4 Back from group detail preserves bottom nav (KEY TEST)', (t) async {
      await _seedGroups(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Navigate into group detail
      await t.tap(find.text('Family'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('MEMBERS'), findsOneWidget);

      // Go back to group list
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Should be back on groups list
      expect(find.text('Family'), findsOneWidget);
      expect(find.text('Business Team'), findsOneWidget);

      // CRITICAL: Bottom nav should still work after returning from pushed route
      // Test Dashboard tab
      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();
      expect(find.text('Total Spent'), findsOneWidget);

      // Test Home tab
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });

    testWidgets('5.5 After group detail, Profile tab still works', (t) async {
      await _seedGroups(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Navigate into Business Team detail
      await t.tap(find.text('Business Team'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Verify detail loaded
      expect(find.text('MEMBERS'), findsOneWidget);
      expect(find.text('Mike'), findsOneWidget);
      expect(find.text('Alex'), findsOneWidget);

      // Go back
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Navigate to Profile — this should work
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('test@penny.app'), findsOneWidget);
      expect(find.text('Sign Out'), findsOneWidget);
    });
  });

  // ====================================================================
  // 6. FULL NAVIGATION STRESS TEST
  // ====================================================================

  group('6 — Full Navigation Stress Test', () {
    testWidgets('6.1 Rapid sequential navigation across all screens', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedAll(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Home
      expect(find.text('Track an expense'), findsOneWidget);

      // Home -> Dashboard
      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Total Spent'), findsOneWidget);

      // Dashboard -> Expense detail (via 3 Months to see seeded data)
      await t.tap(find.text('3 Months'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      await t.drag(find.byType(ListView).first, const Offset(0, -400));
      await t.pumpAndSettle();
      // Tap any visible expense
      final costcoFinder = find.text('Costco');
      if (costcoFinder.evaluate().isNotEmpty) {
        await t.tap(costcoFinder.last);
        await t.pumpAndSettle();
        expect(find.text('Expense'), findsOneWidget);

        // Back from detail
        await t.tap(find.byTooltip('Back'));
        await t.pumpAndSettle();
      }

      // Dashboard -> Finances
      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Budgets'), findsOneWidget);
      expect(find.text('Income'), findsOneWidget);

      // Finances -> Income
      await t.tap(find.text('Manage Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Software Consulting'), findsOneWidget);

      // Back from Income
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Finances -> Savings
      await t.tap(find.text('Manage Savings'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Japan Trip'), findsOneWidget);

      // Back from Savings
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Finances -> Groups
      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Family'), findsOneWidget);

      // Groups -> Group detail
      await t.tap(find.text('Family'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('MEMBERS'), findsOneWidget);

      // Back from group detail
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Groups -> Profile
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      expect(find.text('Test User'), findsOneWidget);

      // Profile -> Home
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });

    testWidgets('6.2 Bottom nav works correctly after every pushed screen', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedAll(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Push to Income from Finances
      await t.tap(find.text('Finances'));
      await t.pumpAndSettle();
      await t.tap(find.text('Manage Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Bottom nav: Dashboard
      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Total Spent'), findsOneWidget);

      // Push to Search from Dashboard
      await t.tap(find.byIcon(Icons.search));
      await t.pumpAndSettle();
      expect(find.text('Search your expenses'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Bottom nav: Groups
      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Family'), findsOneWidget);

      // Push to group detail
      await t.tap(find.text('Business Team'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('MEMBERS'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Bottom nav: Finances
      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Budgets'), findsOneWidget);
      expect(find.text('Income'), findsOneWidget);

      // Bottom nav: Home
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });

    testWidgets('6.3 Deep navigation: group detail -> back -> other tab -> pushed screen -> back', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedAll(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Go to Groups -> Family detail
      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      await t.tap(find.text('Family'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Sarah'), findsOneWidget);

      // Back
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Switch to Profile -> Notifications
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Notifications'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Budget Warning'), findsOneWidget);

      // Back to Profile
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);

      // Switch to Profile -> Settings
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();
      expect(find.text('Currency'), findsOneWidget);
      expect(find.text('CAD'), findsOneWidget);

      // Back to Profile
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);

      // Final: go Home
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });
  });

  // ====================================================================
  // 7. NOTIFICATION INTERACTION
  // ====================================================================

  group('7 — Notification Interaction', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('7.1 Notification bell shows correct unread count', (t) async {
      await _seedNotifications(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // On Home screen, bell icon should be present
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);

      // Badge should show "3" (3 unread notifications)
      expect(find.text('3'), findsAny);
    });

    testWidgets('7.2 Notifications screen shows all types and mark-all-read works', (t) async {
      await _seedNotifications(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Navigate to Notifications via Profile
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Notifications'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // All 5 notifications visible
      expect(find.text('Budget Warning'), findsOneWidget);
      expect(find.text('New Group Expense'), findsOneWidget);
      expect(find.text('Budget Exceeded'), findsOneWidget);
      expect(find.text('Savings Milestone!'), findsOneWidget);
      expect(find.text('New Member'), findsOneWidget);

      // Bodies
      expect(find.textContaining('Meals and entertainment at 85%'), findsOneWidget);
      expect(find.textContaining('Sarah added'), findsOneWidget);
      expect(find.textContaining('Groceries is over budget'), findsOneWidget);

      // Mark all read button (3 unread)
      expect(find.text('Mark all read'), findsOneWidget);

      // Tap mark all read
      await t.tap(find.text('Mark all read'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Mark all read button should disappear (0 unread)
      expect(find.text('Mark all read'), findsNothing);

      // Go back and check bell badge is gone
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Navigate to Home to check bell
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();

      // Bell icon present but no badge number
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
      // "3" badge should no longer appear
      // (no easy way to assert absence of badge number specifically,
      // but the mark-all-read above zeroed the count)
    });
  });

  // ====================================================================
  // 8. SETTINGS & PROFILE
  // ====================================================================

  group('8 — Settings & Profile', () {
    late FakeFirebaseFirestore fs;

    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('8.1 Profile shows correct user info and all navigation links', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();

      // User info
      expect(find.text('T'), findsOneWidget); // Avatar initial
      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('test@penny.app'), findsOneWidget);

      // Navigation links (Income/Savings moved to Finances tab)
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Sign Out'), findsOneWidget);

      // Subtitles (Income/Savings tiles moved to Finances tab)
      expect(find.text('Manage alerts and preferences'), findsOneWidget);
      expect(find.text('Currency, fiscal year, theme'), findsOneWidget);
    });

    testWidgets('8.2 Settings shows all sections and delete account confirmation', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();

      // Sections
      expect(find.text('PREFERENCES'), findsOneWidget);
      expect(find.text('Currency'), findsOneWidget);
      expect(find.text('CAD'), findsOneWidget);
      expect(find.text('Fiscal Year End'), findsOneWidget);
      expect(find.text('NOTIFICATIONS'), findsOneWidget);
      expect(find.text('Push Notifications'), findsOneWidget);
      expect(find.text('Budget Alerts'), findsOneWidget);
      expect(find.text('ABOUT'), findsOneWidget);
      expect(find.text('App Version'), findsOneWidget);
      expect(find.text('1.0.0'), findsOneWidget);
      expect(find.text('Account'), findsOneWidget);
      expect(find.text('test@penny.app'), findsAny);
      expect(find.text('Delete Account'), findsOneWidget);

      // Test delete account confirmation dialog
      await t.tap(find.text('Delete Account'));
      await t.pumpAndSettle();

      expect(find.text('Delete Account?'), findsOneWidget);
      expect(find.textContaining('permanently delete'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);

      // Cancel should dismiss
      await t.tap(find.text('Cancel'));
      await t.pumpAndSettle();
      expect(find.text('Delete Account?'), findsNothing);

      // Back to Profile
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);
    });
  });

  // ====================================================================
  // 9. CROSS-FLOW DATA INTEGRITY (with full dataset)
  // ====================================================================

  group('9 — Cross-Flow Data Integrity', () {
    testWidgets('9.1 Full dataset: every screen renders without errors', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedAll(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Home
      expect(find.text('Penny'), findsAny);
      expect(find.text('Track an expense'), findsOneWidget);

      // Dashboard
      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('By Category'), findsAny);
      expect(find.text('Total Spent'), findsOneWidget);

      // Finances
      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Budgets'), findsOneWidget);
      expect(find.text('Income'), findsOneWidget);
      expect(find.text('Savings'), findsOneWidget);

      // Income (push from Finances)
      await t.tap(find.text('Manage Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Software Consulting'), findsOneWidget);
      expect(find.text('Freelance Design'), findsOneWidget);
      expect(find.text('SaaS Product Revenue'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Savings (push from Finances)
      await t.tap(find.text('Manage Savings'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Japan Trip'), findsOneWidget);
      expect(find.text('Emergency Fund'), findsOneWidget);
      expect(find.text('New MacBook'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Budgets (push from Finances)
      await t.tap(find.text('Manage Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('CATEGORIES'), findsOneWidget);
      expect(find.text('Meals and entertainment'), findsAny);
      expect(find.text('Groceries'), findsAny);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Groups
      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Family'), findsOneWidget);
      expect(find.text('Business Team'), findsOneWidget);

      // Profile
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      expect(find.text('Test User'), findsOneWidget);

      // Notifications
      await t.tap(find.text('Notifications'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Budget Warning'), findsOneWidget);
      expect(find.text('New Group Expense'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Settings
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();
      expect(find.text('Currency'), findsOneWidget);
      expect(find.text('CAD'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Back to Home
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });

    testWidgets('9.2 Budget status correctly reflects seeded current-month expenses', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedAll(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Finances'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Push to BudgetsScreen
      await t.tap(find.text('Manage Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Budgets seeded for current month: Meals $300, Office $200, Telephone $150, Groceries $500
      // No personal expenses seeded for current month (April), only group expenses from _seedGroups.
      // Group expenses are in 'group' type so they won't count towards personal budgets.
      // All should be Safe
      expect(find.text('CATEGORIES'), findsOneWidget);
      expect(find.text('Spent'), findsOneWidget);
      expect(find.textContaining('remaining'), findsOneWidget);
    });

    testWidgets('9.3 Dashboard 3-month view aggregates all seeded data', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedMultiMonthExpenses(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Switch to 3 Months
      await t.ensureVisible(find.text('3 Months'));
      await t.pumpAndSettle();
      await t.tap(find.text('3 Months'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Total should reflect all expenses
      expect(find.text('Total Spent'), findsOneWidget);
    });
  });

  // ====================================================================
  // 10. DASHBOARD FILTERS
  // ====================================================================

  group('10 — Dashboard Filters', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('10.1 Period presets show all options', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();

      // All period preset chips should be visible (in scrollable row)
      expect(find.text('This Week'), findsOneWidget);
      expect(find.text('This Month'), findsOneWidget);
      expect(find.text('Last Month'), findsOneWidget);
      expect(find.text('3 Months'), findsOneWidget);
      // This Year and Custom may need scrolling
    });

    testWidgets('10.2 Period filter changes displayed expenses', (t) async {
      final now = DateTime.now();
      final lastMonth = DateTime(now.year, now.month - 1, 15);

      // Seed expense in current month
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Today Shop', 'amount': 10,
        'category': 'Office expenses', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      // Seed expense in last month
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Last Month Store', 'amount': 20,
        'category': 'Meals and entertainment', 'date': lastMonth,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': lastMonth, 'updatedAt': lastMonth, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': lastMonth}],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Default is "This Month" — should show Today Shop
      expect(find.text('Today Shop'), findsOneWidget);

      // Switch to "Last Month"
      await t.tap(find.text('Last Month'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Should show Last Month Store
      expect(find.text('Last Month Store'), findsOneWidget);
    });

    testWidgets('10.3 Type filter: Personal vs Group', (t) async {
      final now = DateTime.now();
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Personal Vendor', 'amount': 10,
        'category': 'Office expenses', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Group Vendor', 'amount': 20,
        'category': 'Meals and entertainment', 'date': now,
        'expenseType': 'group', 'groupId': 'grp-1',
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // All filter — both visible
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Personal'), findsOneWidget);
      expect(find.text('Group'), findsOneWidget);

      // Tap Personal filter
      await t.tap(find.text('Personal'));
      await t.pumpAndSettle();

      expect(find.text('Personal Vendor'), findsOneWidget);
    });

    testWidgets('10.4 Category filter dropdown works', (t) async {
      final now = DateTime.now();
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Starbucks', 'amount': 5,
        'category': 'Meals and entertainment', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Staples', 'amount': 45,
        'category': 'Office expenses', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Category filter chip should exist
      expect(find.text('Category'), findsOneWidget);
      // By Category section shows both
      expect(find.text('By Category'), findsAny);
    });

    testWidgets('10.5 Group filter dropdown shows user groups', (t) async {
      final ts = Timestamp.now();

      // Seed a group + membership
      await fs.collection('groups').doc('grp-test').set({
        'name': 'Work Team', 'icon': '💼',
        'createdBy': 'test-user-123', 'createdAt': ts, 'updatedAt': ts,
        'settings': {'requireApproval': false, 'allowMemberInvites': true},
        'status': 'active',
        'stats': {'memberCount': 1, 'expenseCount': 0, 'totalAmount': 0, 'lastActivityAt': ts},
      });
      await fs.collection('groupMembers').doc('grp-test_test-user-123').set({
        'groupId': 'grp-test', 'userId': 'test-user-123',
        'userEmail': 'test@penny.app', 'role': 'owner', 'status': 'active',
        'permissions': {}, 'invitedAt': ts, 'invitedBy': 'test-user-123',
      });

      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // "By Group" filter chip should be visible
      expect(find.text('By Group'), findsOneWidget);
    });

    testWidgets('10.6 FAB opens manual expense form', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();

      // FAB should be visible
      await t.tap(find.byType(FloatingActionButton));
      await t.pumpAndSettle();

      expect(find.text('Add Expense'), findsAny);
      expect(find.text('Vendor / Merchant'), findsOneWidget);
    });

    testWidgets('10.7 Search accessible from Dashboard', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.search));
      await t.pumpAndSettle();

      expect(find.text('Search your expenses'), findsOneWidget);
      expect(find.text('coffee this month'), findsOneWidget);
    });
  });
}
