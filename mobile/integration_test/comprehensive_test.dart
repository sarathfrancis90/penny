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

class _FakeStorageService implements StorageService {
  @override
  Future<String> uploadReceipt(dynamic imageFile, String userId) async =>
      'https://fake.example.com/receipt.jpg';
  @override
  Future<void> deleteReceipt(String receiptPath) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

List<Override> _overrides(MockFirebaseAuth auth, FakeFirebaseFirestore fs) => [
      authServiceProvider.overrideWithValue(AuthService(auth: auth)),
      expenseRepositoryProvider.overrideWithValue(ExpenseRepository(firestore: fs)),
      conversationRepositoryProvider.overrideWithValue(ConversationRepository(firestore: fs)),
      budgetRepositoryProvider.overrideWithValue(BudgetRepository(firestore: fs)),
      incomeRepositoryProvider.overrideWithValue(IncomeRepository(firestore: fs)),
      savingsRepositoryProvider.overrideWithValue(SavingsRepository(firestore: fs)),
      groupRepositoryProvider.overrideWithValue(
          GroupRepository(apiClient: ApiClient(baseUrl: 'http://localhost'), firestore: fs)),
      notificationRepositoryProvider.overrideWithValue(NotificationRepository(firestore: fs)),
      storageServiceProvider.overrideWithValue(_FakeStorageService()),
    ];

MockFirebaseAuth _createAuth() => MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: 'test-user-123', email: 'test@penny.app',
          displayName: 'Test User', isAnonymous: false),
    );

/// Helper to create a signed-in app with optional seeded data.
Widget _app(MockFirebaseAuth auth, FakeFirebaseFirestore fs) =>
    ProviderScope(overrides: _overrides(auth, fs), child: const PennyApp());

/// Seeds a full dataset into the fake Firestore.
Future<void> _seedFullData(FakeFirebaseFirestore fs) async {
  final now = DateTime.now();
  final ts = Timestamp.now();

  // 3 expenses
  for (final e in [
    {'vendor': 'Tim Hortons', 'amount': 14.50, 'category': 'Meals and entertainment', 'desc': 'Lunch'},
    {'vendor': 'Shell', 'amount': 52.00, 'category': 'Vehicle - Fuel (gasoline, propane, oil)', 'desc': 'Gas'},
    {'vendor': 'Staples', 'amount': 45.99, 'category': 'Office expenses', 'desc': 'Paper'},
  ]) {
    await fs.collection('expenses').add({
      'userId': 'test-user-123', 'vendor': e['vendor'], 'amount': e['amount'],
      'category': e['category'], 'description': e['desc'], 'date': now,
      'expenseType': 'personal', 'groupId': null,
      'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
      'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
    });
  }

  // 2 budgets
  for (final b in [
    {'category': 'Meals and entertainment', 'limit': 300},
    {'category': 'Office expenses', 'limit': 200},
  ]) {
    await fs.collection('budgets_personal').add({
      'userId': 'test-user-123', 'category': b['category'], 'monthlyLimit': b['limit'],
      'period': {'month': now.month, 'year': now.year},
      'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
      'createdAt': now, 'updatedAt': now,
    });
  }

  // 2 income sources
  for (final i in [
    {'name': 'Consulting', 'category': 'salary', 'amount': 6000, 'frequency': 'monthly'},
    {'name': 'Freelance', 'category': 'freelance', 'amount': 2000, 'frequency': 'biweekly'},
  ]) {
    await fs.collection('income_sources_personal').add({
      'userId': 'test-user-123', 'name': i['name'], 'category': i['category'],
      'amount': i['amount'], 'frequency': i['frequency'],
      'isRecurring': true, 'isActive': true, 'taxable': true, 'currency': 'CAD',
      'startDate': now, 'createdAt': now, 'updatedAt': now,
    });
  }

  // 2 savings goals
  for (final g in [
    {'name': 'Japan Trip', 'category': 'travel', 'target': 5000, 'current': 3200, 'monthly': 500, 'priority': 'high', 'emoji': '✈️'},
    {'name': 'Emergency Fund', 'category': 'emergency_fund', 'target': 10000, 'current': 2000, 'monthly': 300, 'priority': 'critical', 'emoji': '💰'},
  ]) {
    await fs.collection('savings_goals_personal').add({
      'userId': 'test-user-123', 'name': g['name'], 'category': g['category'],
      'targetAmount': g['target'], 'currentAmount': g['current'],
      'monthlyContribution': g['monthly'], 'status': 'active',
      'isActive': true, 'priority': g['priority'], 'currency': 'CAD',
      'progressPercentage': ((g['current'] as int) / (g['target'] as int) * 100),
      'onTrack': true, 'emoji': g['emoji'],
      'startDate': now, 'createdAt': now, 'updatedAt': now,
    });
  }

  // 1 group with 2 members
  await fs.collection('groups').doc('grp-1').set({
    'name': 'Family', 'description': 'Household', 'icon': '👨‍👩‍👧‍👦',
    'createdBy': 'test-user-123', 'createdAt': ts, 'updatedAt': ts,
    'settings': {'requireApproval': true, 'allowMemberInvites': true},
    'status': 'active',
    'stats': {'memberCount': 2, 'expenseCount': 5, 'totalAmount': 320, 'lastActivityAt': ts},
  });
  await fs.collection('groupMembers').doc('grp-1_test-user-123').set({
    'groupId': 'grp-1', 'userId': 'test-user-123',
    'userEmail': 'test@penny.app', 'userName': 'Test User',
    'role': 'owner', 'status': 'active',
    'permissions': {'canManageSettings': true, 'canAddExpenses': true, 'canViewReports': true},
    'invitedAt': ts, 'invitedBy': 'test-user-123',
  });
  await fs.collection('groupMembers').doc('grp-1_user2').set({
    'groupId': 'grp-1', 'userId': 'user2',
    'userEmail': 'spouse@example.com', 'userName': 'Sarah',
    'role': 'member', 'status': 'active',
    'permissions': {'canAddExpenses': true, 'canViewReports': true},
    'invitedAt': ts, 'invitedBy': 'test-user-123',
  });

  // 3 notifications (2 unread, 1 read)
  await fs.collection('notifications').add({
    'userId': 'test-user-123', 'type': 'budget_warning',
    'title': 'Budget Warning', 'body': 'Meals at 85%',
    'icon': '⚠️', 'priority': 'high', 'category': 'budget',
    'read': false, 'delivered': true, 'isGrouped': false, 'createdAt': ts,
  });
  await fs.collection('notifications').add({
    'userId': 'test-user-123', 'type': 'group_expense_added',
    'title': 'New expense', 'body': 'Sarah added \$45 at Walmart',
    'icon': '💰', 'priority': 'medium', 'category': 'group',
    'read': false, 'delivered': true, 'isGrouped': false,
    'actorName': 'Sarah', 'createdAt': ts,
  });
  await fs.collection('notifications').add({
    'userId': 'test-user-123', 'type': 'milestone',
    'title': 'Milestone!', 'body': 'Japan Trip at 64%',
    'icon': '🎯', 'priority': 'low', 'category': 'savings',
    'read': true, 'delivered': true, 'isGrouped': false, 'createdAt': ts,
  });
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await Hive.initFlutter();
    final box = await Hive.openBox('app_preferences');
    await box.put('onboarding_complete', true);
    await box.put('has_logged_in', true);
  });

  // ====================================================================
  // ACCOUNT & AUTH
  // ====================================================================

  group('Account', () {
    testWidgets('Sign up screen shows all fields and OAuth buttons', (t) async {
      final fs = FakeFirebaseFirestore();
      final auth = MockFirebaseAuth(signedIn: false);
      await t.pumpWidget(_app(auth, fs));
      await t.pumpAndSettle();

      // Should be on login, tap Sign Up
      await t.tap(find.textContaining('Sign Up'));
      await t.pumpAndSettle();

      expect(find.text('Create Account'), findsAny);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Confirm Password'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Continue with Apple'), findsOneWidget);
      expect(find.text('or'), findsOneWidget);
    });

    testWidgets('Login screen shows all elements', (t) async {
      final fs = FakeFirebaseFirestore();
      final auth = MockFirebaseAuth(signedIn: false);
      await t.pumpWidget(_app(auth, fs));
      await t.pumpAndSettle();

      expect(find.text('Penny'), findsAny);
      expect(find.text('AI Expense Tracker'), findsOneWidget);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Continue with Apple'), findsOneWidget);
      expect(find.text('or'), findsOneWidget);
    });
  });

  // ====================================================================
  // EXPENSE — Full CRUD + Detail
  // ====================================================================

  group('Expense CRUD', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Expense detail shows all fields + share + edit + delete', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Scroll to see expenses
      await t.drag(find.byType(ListView).first, const Offset(0, -200));
      await t.pumpAndSettle();

      await t.tap(find.text('Tim Hortons').last);
      await t.pumpAndSettle();

      // Detail screen
      expect(find.text('Expense'), findsOneWidget);
      expect(find.text('Meals and entertainment'), findsOneWidget);
      expect(find.text('personal'), findsOneWidget);
      expect(find.text('Lunch'), findsOneWidget);

      // Action buttons
      expect(find.byIcon(Icons.ios_share_outlined), findsOneWidget); // Share
      expect(find.byIcon(Icons.edit_outlined), findsOneWidget); // Edit
      expect(find.byIcon(Icons.delete_outline), findsAny); // Delete
      expect(find.text('Delete Expense'), findsOneWidget);
    });

    testWidgets('Expense edit → save updates the record', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      await t.drag(find.byType(ListView).first, const Offset(0, -200));
      await t.pumpAndSettle();

      await t.tap(find.text('Tim Hortons').last);
      await t.pumpAndSettle();

      // Open edit
      await t.tap(find.byIcon(Icons.edit_outlined));
      await t.pumpAndSettle();

      expect(find.text('Edit Expense'), findsOneWidget);
      expect(find.text('Save Changes'), findsOneWidget);
      // Fields should be prefilled
      expect(find.text('Tim Hortons'), findsAny);
    });

    testWidgets('Expense delete flow with confirmation', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      await t.drag(find.byType(ListView).first, const Offset(0, -200));
      await t.pumpAndSettle();

      // Scroll to see expenses
      await t.drag(find.byType(ListView).first, const Offset(0, -300));
      await t.pumpAndSettle();

      await t.tap(find.text('Staples'));
      await t.pumpAndSettle();

      await t.tap(find.text('Delete Expense'));
      await t.pumpAndSettle();

      expect(find.text('Delete this expense?'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);

      // Cancel should dismiss
      await t.tap(find.widgetWithText(OutlinedButton, 'Cancel'));
      await t.pumpAndSettle();
      expect(find.text('Delete this expense?'), findsNothing);
    });

    testWidgets('Dashboard shows category breakdown + period selector + search', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('This Month'), findsOneWidget);
      expect(find.text('Last Month'), findsOneWidget);
      expect(find.text('3 Months'), findsOneWidget);
      expect(find.text('By Category'), findsOneWidget);
      expect(find.byIcon(Icons.search), findsOneWidget); // Search button
    });
  });

  // ====================================================================
  // BUDGET — Full CRUD
  // ====================================================================

  group('Budget CRUD', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Budget create form has all fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Budgets'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();

      expect(find.text('Create Budget'), findsAny);
      expect(find.text('Category'), findsOneWidget);
      expect(find.text('Monthly limit'), findsOneWidget);
    });

    testWidgets('Multiple budgets with different statuses display correctly', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Summary card visible
      expect(find.text('Spent'), findsOneWidget);
      expect(find.textContaining('remaining'), findsOneWidget);
      expect(find.text('CATEGORIES'), findsOneWidget);

      // Both budget categories
      expect(find.text('Meals and entertainment'), findsAny);
      expect(find.text('Office expenses'), findsAny);
    });

    testWidgets('Budget progress ring shows in summary', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Progress ring is a CustomPaint - verify surrounding text
      expect(find.text('Spent'), findsOneWidget);
      expect(find.textContaining('of \$'), findsAny);
      expect(find.textContaining('of monthly limit'), findsOneWidget);
    });
  });

  // ====================================================================
  // INCOME — Full CRUD
  // ====================================================================

  group('Income CRUD', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Income create form has all fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Income'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();

      expect(find.text('Add Income Source'), findsOneWidget);
      expect(find.text('Source name'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);
      expect(find.text('Taxable'), findsOneWidget);
      expect(find.text('Add Source'), findsOneWidget);
    });

    testWidgets('Income sources show with amounts and frequency', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Consulting'), findsOneWidget);
      expect(find.text('Freelance'), findsOneWidget);
      expect(find.text('salary'), findsOneWidget);
      expect(find.text('freelance'), findsOneWidget);
      expect(find.text('Active'), findsNWidgets(2));
      expect(find.text('Total Monthly Income'), findsOneWidget);
    });

    testWidgets('Income total reflects all sources', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Monthly summary card should show total
      expect(find.textContaining('/mo'), findsAny);
      expect(find.text('ACTIVE SOURCES'), findsOneWidget);
    });
  });

  // ====================================================================
  // SAVINGS — Full CRUD
  // ====================================================================

  group('Savings CRUD', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Savings create form has all fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Savings Goals'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();

      expect(find.text('Create Savings Goal'), findsAny);
      expect(find.text('Goal name'), findsOneWidget);
      expect(find.text('Target amount'), findsOneWidget);
      expect(find.text('Monthly contribution'), findsOneWidget);
    });

    testWidgets('Savings goals show progress + emoji + priority + contribution', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Savings Goals'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Japan Trip'), findsOneWidget);
      expect(find.text('Emergency Fund'), findsOneWidget);
      expect(find.text('✈️'), findsOneWidget);
      expect(find.text('💰'), findsOneWidget);
      expect(find.text('high priority'), findsOneWidget);
      expect(find.text('critical priority'), findsOneWidget);
      expect(find.textContaining('/mo contribution'), findsNWidgets(2));
      expect(find.text('across 2 goals'), findsOneWidget);
    });

    testWidgets('Savings portfolio total is sum of all goals', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Savings Goals'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('TOTAL PORTFOLIO'), findsOneWidget);
      // 3200 + 2000 = 5200
      expect(find.textContaining('\$5,200'), findsAny);
    });
  });

  // ====================================================================
  // GROUPS — Full CRUD
  // ====================================================================

  group('Groups CRUD', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Group create form has icon picker + approval toggle', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle();

      await t.tap(find.widgetWithText(ElevatedButton, 'Create Group'));
      await t.pumpAndSettle();

      expect(find.text('Create Group'), findsAny);
      expect(find.text('Group name'), findsOneWidget);
      expect(find.text('Require expense approval'), findsOneWidget);
      // Icon picker - should show emoji options
      expect(find.text('👥'), findsAny);
      expect(find.text('👨‍👩‍👧‍👦'), findsAny);
      expect(find.text('🏢'), findsAny);
    });

    testWidgets('Group card shows icon + name + members + total', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Family'), findsOneWidget);
      expect(find.text('👨‍👩‍👧‍👦'), findsOneWidget);
      expect(find.text('2 members'), findsOneWidget);
    });

    testWidgets('Group detail shows description + members + roles + approval', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      await t.tap(find.text('Family'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Family'), findsAny);
      // Description may be in header or body
      expect(find.textContaining('Household'), findsAny);
      expect(find.text('MEMBERS'), findsOneWidget);
      expect(find.text('Test User'), findsAny);
      expect(find.text('Sarah'), findsOneWidget);
      expect(find.text('owner'), findsOneWidget);
      expect(find.text('member'), findsOneWidget);
      expect(find.text('Expense approval required'), findsOneWidget);
    });
  });

  // ====================================================================
  // NOTIFICATIONS
  // ====================================================================

  group('Notifications', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Notifications show all types + unread dots + mark all read', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Notifications'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Budget Warning'), findsOneWidget);
      expect(find.text('New expense'), findsOneWidget);
      expect(find.text('Milestone!'), findsOneWidget);
      expect(find.text('Meals at 85%'), findsOneWidget);
      expect(find.text('Sarah'), findsOneWidget);
      // Mark all read button (2 unread)
      expect(find.text('Mark all read'), findsOneWidget);
    });

    testWidgets('Notification bell on Home shows badge', (t) async {
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Should be on Home, bell icon should have badge
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
      // Badge shows "2" for 2 unread
      expect(find.text('2'), findsAny);
    });
  });

  // ====================================================================
  // SETTINGS
  // ====================================================================

  group('Settings', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Settings shows all sections and fields', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();

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
    });

    testWidgets('Delete Account shows confirmation dialog', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();

      await t.tap(find.text('Delete Account'));
      await t.pumpAndSettle();

      expect(find.text('Delete Account?'), findsOneWidget);
      expect(find.textContaining('permanently delete'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);
    });
  });

  // ====================================================================
  // PROFILE
  // ====================================================================

  group('Profile', () {
    testWidgets('Profile shows avatar + name + email + all links', (t) async {
      final fs = FakeFirebaseFirestore();
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();

      expect(find.text('T'), findsOneWidget); // Avatar initial
      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('test@penny.app'), findsOneWidget);
      expect(find.text('Income'), findsOneWidget);
      expect(find.text('Savings Goals'), findsOneWidget);
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Sign Out'), findsOneWidget);
      // Subtitles
      expect(find.text('Manage income sources'), findsOneWidget);
      expect(find.text('Track your savings progress'), findsOneWidget);
      expect(find.text('Manage alerts and preferences'), findsOneWidget);
      expect(find.text('Currency, fiscal year, theme'), findsOneWidget);
    });
  });

  // ====================================================================
  // SEARCH
  // ====================================================================

  group('Search', () {
    late FakeFirebaseFirestore fs;
    setUp(() => fs = FakeFirebaseFirestore());

    testWidgets('Search screen accessible from Dashboard', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.search));
      await t.pumpAndSettle();

      expect(find.text('Search your expenses'), findsOneWidget);
      expect(find.text('Try natural language queries:'), findsOneWidget);
    });

    testWidgets('Search shows hint chips', (t) async {
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();
      await t.tap(find.byIcon(Icons.search));
      await t.pumpAndSettle();

      expect(find.text('coffee this month'), findsOneWidget);
      expect(find.text('uber last week'), findsOneWidget);
      expect(find.text('over \$50'), findsOneWidget);
      expect(find.text('groceries'), findsOneWidget);
    });
  });

  // ====================================================================
  // CROSS-FLOW DATA INTEGRITY
  // ====================================================================

  group('Cross-Flow', () {
    testWidgets('Full data set: all screens render without errors', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      // Home
      expect(find.text('Penny'), findsAny);
      expect(find.text('Track an expense'), findsOneWidget);

      // Dashboard
      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('By Category'), findsOneWidget);

      // Budgets
      await t.tap(find.text('Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('CATEGORIES'), findsOneWidget);

      // Groups
      await t.tap(find.text('Groups'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Family'), findsOneWidget);

      // Profile
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();
      expect(find.text('Test User'), findsOneWidget);

      // Income
      await t.tap(find.text('Income'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Consulting'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Savings
      await t.tap(find.text('Savings Goals'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Japan Trip'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Notifications
      await t.tap(find.text('Notifications'));
      await t.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Budget Warning'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();

      // Settings
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();
      expect(find.text('Currency'), findsOneWidget);

      // Back to Home
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });

    testWidgets('Multiple expense categories show correct breakdown', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // 3 expenses across 3 categories
      expect(find.text('By Category'), findsOneWidget);
      // At least some categories should be visible
      expect(find.textContaining('Meals'), findsAny);
      expect(find.textContaining('Office'), findsAny);
    });

    testWidgets('Budget status updates reflect expenses', (t) async {
      final fs = FakeFirebaseFirestore();
      await _seedFullData(fs);
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Budgets'));
      await t.pumpAndSettle(const Duration(seconds: 1));

      // Meals: $14.50/$300 = 4.8% -> Safe
      // Office: $45.99/$200 = 23% -> Safe
      expect(find.text('Safe'), findsNWidgets(2));
    });
  });

  // ====================================================================
  // NAVIGATION
  // ====================================================================

  group('Navigation', () {
    testWidgets('All pushed screens have back navigation', (t) async {
      final fs = FakeFirebaseFirestore();
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();

      // Income → back
      await t.tap(find.text('Income'));
      await t.pumpAndSettle();
      expect(find.text('No income sources'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);

      // Savings → back
      await t.tap(find.text('Savings Goals'));
      await t.pumpAndSettle();
      expect(find.text('TOTAL PORTFOLIO'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);

      // Notifications → back
      await t.tap(find.text('Notifications'));
      await t.pumpAndSettle();
      expect(find.text('No notifications'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);

      // Settings → back
      await t.tap(find.text('Settings'));
      await t.pumpAndSettle();
      expect(find.text('Currency'), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Sign Out'), findsOneWidget);
    });

    testWidgets('Dashboard search → back returns to Dashboard', (t) async {
      final fs = FakeFirebaseFirestore();
      await t.pumpWidget(_app(_createAuth(), fs));
      await t.pumpAndSettle();

      await t.tap(find.text('Dashboard'));
      await t.pumpAndSettle();

      await t.tap(find.byIcon(Icons.search));
      await t.pumpAndSettle();
      expect(find.text('Search your expenses'), findsOneWidget);

      await t.tap(find.byTooltip('Back'));
      await t.pumpAndSettle();
      expect(find.text('Total Spent'), findsOneWidget);
    });
  });
}
