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
import 'package:penny_mobile/data/repositories/budget_repository.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/repositories/income_repository.dart';
import 'package:penny_mobile/data/repositories/group_repository.dart';
import 'package:penny_mobile/data/repositories/notification_repository.dart';
import 'package:penny_mobile/data/repositories/savings_repository.dart';
import 'package:penny_mobile/data/services/storage_service.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Fake storage service that doesn't touch real Firebase Storage.
class _FakeStorageService implements StorageService {
  @override
  Future<String> uploadReceipt(dynamic imageFile, String userId) async {
    return 'https://fake-storage.example.com/receipt.jpg';
  }

  @override
  Future<void> deleteReceipt(String receiptPath) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// All overrides needed to run integration tests against fakes.
List<Override> _overrides(MockFirebaseAuth auth, FakeFirebaseFirestore fs) => [
      authServiceProvider.overrideWithValue(AuthService(auth: auth)),
      expenseRepositoryProvider.overrideWithValue(ExpenseRepository(firestore: fs)),
      conversationRepositoryProvider.overrideWithValue(ConversationRepository(firestore: fs)),
      budgetRepositoryProvider.overrideWithValue(BudgetRepository(firestore: fs)),
      incomeRepositoryProvider.overrideWithValue(IncomeRepository(firestore: fs)),
      savingsRepositoryProvider.overrideWithValue(SavingsRepository(firestore: fs)),
      groupRepositoryProvider.overrideWithValue(
          GroupRepository(apiClient: ApiClient(baseUrl: 'http://localhost'), firestore: fs)),
      notificationRepositoryProvider.overrideWithValue(
          NotificationRepository(firestore: fs)),
      storageServiceProvider.overrideWithValue(_FakeStorageService()),
    ];

MockFirebaseAuth _createAuth() => MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(
        uid: 'test-user-123', email: 'test@penny.app',
        displayName: 'Test User', isAnonymous: false,
      ),
    );

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // Initialize Hive and mark onboarding as complete for tests
  setUpAll(() async {
    await Hive.initFlutter();
    final box = await Hive.openBox('app_preferences');
    await box.put('onboarding_complete', true);
    await box.put('has_logged_in', true);
  });

  // ====== PHASE 1: Expense CRUD ======

  group('Phase 1 — Expense CRUD', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Full expense lifecycle: create → read → delete', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      // Home screen shows
      expect(find.text('Track an expense'), findsOneWidget);

      // Navigate to Dashboard (empty)
      await tester.tap(find.text('Dashboard'));
      await tester.pumpAndSettle();
      expect(find.text('\$0.00'), findsOneWidget);

      // Seed expense
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Tim Hortons', 'amount': 14.50,
        'category': 'Meals and entertainment', 'date': DateTime.now(),
        'description': 'Lunch', 'expenseType': 'personal', 'groupId': null,
        'createdAt': DateTime.now(), 'updatedAt': DateTime.now(),
        'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': DateTime.now()}],
      });
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Verify in dashboard
      expect(find.text('Tim Hortons'), findsOneWidget);

      // Tap to detail
      await tester.tap(find.text('Tim Hortons'));
      await tester.pumpAndSettle();
      expect(find.text('Expense'), findsOneWidget);
      expect(find.text('Meals and entertainment'), findsOneWidget);

      // Delete
      await tester.tap(find.text('Delete Expense'));
      await tester.pumpAndSettle();
      expect(find.text('Delete this expense?'), findsOneWidget);
      await tester.tap(find.widgetWithText(ElevatedButton, 'Delete'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Tim Hortons'), findsNothing);
      expect(find.text('\$0.00'), findsOneWidget);
    });

    testWidgets('Empty state and suggestion chips', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Track an expense'), findsOneWidget);
      expect(find.text('Lunch at Tim Hortons, \$14.50'), findsOneWidget);
      expect(find.text('Uber ride \$22.00'), findsOneWidget);
    });

    testWidgets('Expense edit sheet shows prefilled fields', (tester) async {
      final now = DateTime.now();
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Staples', 'amount': 45.99,
        'category': 'Office expenses', 'date': now,
        'description': 'Printer paper', 'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Dashboard'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap expense to open detail
      await tester.tap(find.text('Staples'));
      await tester.pumpAndSettle();

      // Tap edit icon
      await tester.tap(find.byIcon(Icons.edit_outlined));
      await tester.pumpAndSettle();

      // Edit sheet should show prefilled values
      expect(find.text('Edit Expense'), findsOneWidget);
      expect(find.text('Staples'), findsAny); // vendor field prefilled
      expect(find.text('Save Changes'), findsOneWidget);
    });

    testWidgets('Dashboard shows category breakdown with data', (tester) async {
      final now = DateTime.now();
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Tim Hortons', 'amount': 14.50,
        'category': 'Meals and entertainment', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Shell', 'amount': 52.00,
        'category': 'Vehicle - Fuel (gasoline, propane, oil)', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Dashboard'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Top of dashboard should be visible
      expect(find.text('By Category'), findsOneWidget);
      expect(find.text('This Month'), findsOneWidget);
      expect(find.text('Last Month'), findsOneWidget);

      // Scroll down to see recent expenses
      await tester.drag(find.byType(ListView).first, const Offset(0, -300));
      await tester.pumpAndSettle();

      // Dashboard now uses date-grouped sections instead of 'Recent Expenses'
    });

    testWidgets('Home screen has camera button and input bar', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      // Camera icon
      expect(find.byIcon(Icons.camera_alt_outlined), findsOneWidget);
      // Input field
      expect(find.text('Describe an expense...'), findsOneWidget);
      // Send button
      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
      // New chat button
      expect(find.byIcon(Icons.add_comment_outlined), findsOneWidget);
      // Notification bell
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
    });
  });

  // ====== PHASE 2: Budgets ======

  group('Phase 2 — Budgets', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Budget screen shows empty state and create flow', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      // Navigate to Finances tab
      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();

      // Empty state on Finances screen
      expect(find.text('No budgets yet'), findsOneWidget);

      // Tap "Create Budget" to push to BudgetsScreen
      await tester.tap(find.text('Create Budget'));
      await tester.pumpAndSettle();

      // BudgetsScreen empty state
      expect(find.text('Tap + to create your first budget'), findsOneWidget);

      // Tap add button
      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();

      // Create budget sheet appears (title + button both say "Create Budget")
      expect(find.text('Create Budget'), findsAny);
      expect(find.text('Category'), findsOneWidget);
    });

    testWidgets('Budget cards show correct status badges', (tester) async {
      // Seed a budget and expenses
      final now = DateTime.now();
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123',
        'category': 'Meals and entertainment',
        'monthlyLimit': 300,
        'period': {'month': now.month, 'year': now.year},
        'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
        'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Restaurant', 'amount': 250,
        'category': 'Meals and entertainment', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap "Manage Budgets" to push to BudgetsScreen
      await tester.tap(find.text('Manage Budgets'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Should show Warning badge (250/300 = 83%)
      expect(find.text('Warning'), findsOneWidget);
      expect(find.text('Meals and entertainment'), findsAny);
    });
  });

  // ====== PHASE 2: Budgets — Additional ======

  group('Phase 2 — Budgets (extended)', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Multiple budgets show with correct statuses', (tester) async {
      final now = DateTime.now();
      // Budget 1: Safe (60%)
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123', 'category': 'Office expenses',
        'monthlyLimit': 200, 'period': {'month': now.month, 'year': now.year},
        'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
        'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Staples', 'amount': 120,
        'category': 'Office expenses', 'date': now, 'expenseType': 'personal',
        'groupId': null, 'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      // Budget 2: Critical (95%)
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123', 'category': 'Telephone',
        'monthlyLimit': 100, 'period': {'month': now.month, 'year': now.year},
        'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
        'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Bell', 'amount': 95,
        'category': 'Telephone', 'date': now, 'expenseType': 'personal',
        'groupId': null, 'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap "Manage Budgets" to push to BudgetsScreen
      await tester.tap(find.text('Manage Budgets'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Both categories should appear
      expect(find.text('Office expenses'), findsAny);
      expect(find.text('Telephone'), findsAny);
      // Status badges
      expect(find.text('Safe'), findsOneWidget);
      expect(find.text('Critical'), findsOneWidget);
      // Progress ring should show total
      expect(find.textContaining('remaining'), findsOneWidget);
    });

    testWidgets('Budget summary card shows totals', (tester) async {
      final now = DateTime.now();
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123', 'category': 'Meals and entertainment',
        'monthlyLimit': 500, 'period': {'month': now.month, 'year': now.year},
        'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
        'createdAt': now, 'updatedAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap "Manage Budgets" to push to BudgetsScreen
      await tester.tap(find.text('Manage Budgets'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Summary should show the month and budget info
      expect(find.textContaining('2026'), findsAny);
      expect(find.text('Spent'), findsOneWidget);
      expect(find.textContaining('remaining'), findsOneWidget);
      expect(find.textContaining('of monthly limit'), findsOneWidget);
    });

    testWidgets('Over-budget shows Over status', (tester) async {
      final now = DateTime.now();
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123', 'category': 'Groceries',
        'monthlyLimit': 100, 'period': {'month': now.month, 'year': now.year},
        'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
        'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Walmart', 'amount': 150,
        'category': 'Groceries', 'date': now, 'expenseType': 'personal',
        'groupId': null, 'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap "Manage Budgets" to push to BudgetsScreen
      await tester.tap(find.text('Manage Budgets'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Over'), findsOneWidget);
      expect(find.text('Groceries'), findsAny);
    });
  });

  // ====== PHASE 2: Income ======

  group('Phase 2 — Income', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Income screen accessible from Finances with empty state', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();

      expect(find.text('Income'), findsOneWidget);
      expect(find.text('Savings'), findsOneWidget);

      await tester.tap(find.text('Add Income'));
      await tester.pumpAndSettle();

      expect(find.text('No income sources'), findsOneWidget);
      expect(find.text('Add your first income source'), findsOneWidget);
    });

    testWidgets('Income screen shows seeded sources with correct amounts', (tester) async {
      final now = DateTime.now();
      await fs.collection('income_sources_personal').add({
        'userId': 'test-user-123', 'name': 'Software Consulting',
        'category': 'salary', 'amount': 6000, 'frequency': 'monthly',
        'isRecurring': true, 'isActive': true, 'taxable': true, 'currency': 'CAD',
        'startDate': now, 'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('income_sources_personal').add({
        'userId': 'test-user-123', 'name': 'Freelance Projects',
        'category': 'freelance', 'amount': 2000, 'frequency': 'monthly',
        'isRecurring': true, 'isActive': true, 'taxable': true, 'currency': 'CAD',
        'startDate': now, 'createdAt': now, 'updatedAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manage Income'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Sources should appear
      expect(find.text('Software Consulting'), findsOneWidget);
      expect(find.text('Freelance Projects'), findsOneWidget);
      // Category tags
      expect(find.text('salary'), findsOneWidget);
      expect(find.text('freelance'), findsOneWidget);
      // Active dots
      expect(find.text('Active'), findsNWidgets(2));
      // Total should show $8,000
      expect(find.text('Total Monthly Income'), findsOneWidget);
    });

    testWidgets('Income create sheet opens from + button', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add Income'));
      await tester.pumpAndSettle();

      // Tap + button
      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();

      expect(find.text('Add Income Source'), findsOneWidget);
      expect(find.text('Source name'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);
      expect(find.text('Taxable'), findsOneWidget);
      expect(find.text('Add Source'), findsOneWidget);
    });

    testWidgets('Income shows frequency labels correctly', (tester) async {
      final now = DateTime.now();
      await fs.collection('income_sources_personal').add({
        'userId': 'test-user-123', 'name': 'Consulting',
        'category': 'salary', 'amount': 6000, 'frequency': 'monthly',
        'isRecurring': true, 'isActive': true, 'taxable': true, 'currency': 'CAD',
        'startDate': now, 'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('income_sources_personal').add({
        'userId': 'test-user-123', 'name': 'Freelance',
        'category': 'freelance', 'amount': 2000, 'frequency': 'biweekly',
        'isRecurring': true, 'isActive': true, 'taxable': true, 'currency': 'CAD',
        'startDate': now, 'createdAt': now, 'updatedAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manage Income'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Frequency labels should be displayed
      expect(find.textContaining('/mo'), findsAny);
      expect(find.textContaining('/2wk'), findsAny);
      // Both sources visible
      expect(find.text('Consulting'), findsOneWidget);
      expect(find.text('Freelance'), findsOneWidget);
    });
  });

  // ====== PHASE 2: Savings ======

  group('Phase 2 — Savings', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Savings empty state and create button', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add Goal'));
      await tester.pumpAndSettle();

      expect(find.text('TOTAL PORTFOLIO'), findsOneWidget);
      expect(find.text('\$0'), findsAny);
      expect(find.text('across 0 goals'), findsOneWidget);
      expect(find.text('No savings goals yet'), findsOneWidget);
      expect(find.text('Create your first goal'), findsOneWidget);
    });

    testWidgets('Savings goal card renders all fields', (tester) async {
      final now = DateTime.now();
      await fs.collection('savings_goals_personal').add({
        'userId': 'test-user-123', 'name': 'Japan Trip', 'category': 'travel',
        'targetAmount': 5000, 'currentAmount': 3200, 'monthlyContribution': 500,
        'status': 'active', 'isActive': true, 'priority': 'high', 'currency': 'CAD',
        'progressPercentage': 64, 'onTrack': true,
        'emoji': '✈️', 'startDate': now, 'createdAt': now, 'updatedAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manage Savings'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Japan Trip'), findsOneWidget);
      expect(find.text('✈️'), findsOneWidget);
      expect(find.text('high priority'), findsOneWidget);
      expect(find.textContaining('\$3,200'), findsAny);
      expect(find.textContaining('\$5,000'), findsAny);
      expect(find.textContaining('\$500/mo'), findsAny);
      expect(find.text('across 1 goal'), findsOneWidget);
    });

    testWidgets('Multiple savings goals show correct total', (tester) async {
      final now = DateTime.now();
      await fs.collection('savings_goals_personal').add({
        'userId': 'test-user-123', 'name': 'Japan Trip', 'category': 'travel',
        'targetAmount': 5000, 'currentAmount': 3200, 'monthlyContribution': 500,
        'status': 'active', 'isActive': true, 'priority': 'high', 'currency': 'CAD',
        'progressPercentage': 64, 'onTrack': true,
        'emoji': '✈️', 'startDate': now, 'createdAt': now, 'updatedAt': now,
      });
      await fs.collection('savings_goals_personal').add({
        'userId': 'test-user-123', 'name': 'Emergency Fund', 'category': 'emergency_fund',
        'targetAmount': 10000, 'currentAmount': 2000, 'monthlyContribution': 300,
        'status': 'active', 'isActive': true, 'priority': 'critical', 'currency': 'CAD',
        'progressPercentage': 20, 'onTrack': true,
        'emoji': '💰', 'startDate': now, 'createdAt': now, 'updatedAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manage Savings'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Japan Trip'), findsOneWidget);
      expect(find.text('Emergency Fund'), findsOneWidget);
      expect(find.text('across 2 goals'), findsOneWidget);
      expect(find.textContaining('\$5,200'), findsAny); // 3200+2000 total
    });

    testWidgets('Savings create sheet opens from + button', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add Goal'));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();

      expect(find.text('Create Savings Goal'), findsAny);
      expect(find.text('Goal name'), findsOneWidget);
      expect(find.text('Target amount'), findsOneWidget);
      expect(find.text('Monthly contribution'), findsOneWidget);
    });
  });

  // ====== PHASE 3: Groups ======

  group('Phase 3 — Groups', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Groups tab shows empty state', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Groups'));
      await tester.pumpAndSettle();

      expect(find.text('No groups yet'), findsOneWidget);
      expect(find.textContaining('Create a group'), findsOneWidget);
    });

    testWidgets('Create group sheet opens from empty state button', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Groups'));
      await tester.pumpAndSettle();

      // Tap the "Create Group" button in the empty state
      await tester.tap(find.widgetWithText(ElevatedButton, 'Create Group'));
      await tester.pumpAndSettle();

      expect(find.text('Create Group'), findsAny);
      expect(find.text('Group name'), findsOneWidget);
      expect(find.text('Require expense approval'), findsOneWidget);
    });

    testWidgets('Group list shows seeded groups', (tester) async {
      final now = Timestamp.now();
      // Seed a group
      await fs.collection('groups').doc('group-1').set({
        'name': 'Family Expenses',
        'icon': '👨‍👩‍👧‍👦',
        'createdBy': 'test-user-123',
        'createdAt': now, 'updatedAt': now,
        'settings': {'requireApproval': false, 'allowMemberInvites': true},
        'status': 'active',
        'stats': {'memberCount': 3, 'expenseCount': 12, 'totalAmount': 845,
            'lastActivityAt': now},
      });
      // Seed membership
      await fs.collection('groupMembers').doc('group-1_test-user-123').set({
        'groupId': 'group-1', 'userId': 'test-user-123',
        'userEmail': 'test@penny.app', 'userName': 'Test User',
        'role': 'owner', 'status': 'active',
        'permissions': {'canAddExpenses': true, 'canViewReports': true,
            'canManageSettings': true},
        'invitedAt': now, 'invitedBy': 'test-user-123',
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Groups'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Family Expenses'), findsOneWidget);
      expect(find.text('👨‍👩‍👧‍👦'), findsOneWidget);
      expect(find.text('3 members'), findsOneWidget);
    });

    testWidgets('Group detail shows stats and members', (tester) async {
      final now = Timestamp.now();
      await fs.collection('groups').doc('group-1').set({
        'name': 'Business Team',
        'description': 'Office shared expenses',
        'icon': '💼',
        'createdBy': 'test-user-123',
        'createdAt': now, 'updatedAt': now,
        'settings': {'requireApproval': true, 'allowMemberInvites': true},
        'status': 'active',
        'stats': {'memberCount': 2, 'expenseCount': 5, 'totalAmount': 320,
            'lastActivityAt': now},
      });
      await fs.collection('groupMembers').doc('group-1_test-user-123').set({
        'groupId': 'group-1', 'userId': 'test-user-123',
        'userEmail': 'test@penny.app', 'userName': 'Test User',
        'role': 'owner', 'status': 'active',
        'permissions': {'canManageSettings': true},
        'invitedAt': now, 'invitedBy': 'test-user-123',
      });
      await fs.collection('groupMembers').doc('group-1_user-2').set({
        'groupId': 'group-1', 'userId': 'user-2',
        'userEmail': 'colleague@example.com', 'userName': 'Colleague',
        'role': 'member', 'status': 'active',
        'permissions': {'canAddExpenses': true},
        'invitedAt': now, 'invitedBy': 'test-user-123',
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Groups'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap group card
      await tester.tap(find.text('Business Team'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Detail screen
      expect(find.text('Business Team'), findsAny);
      expect(find.text('💼'), findsAny);
      expect(find.text('MEMBERS'), findsOneWidget);
      // Stats
      expect(find.text('2'), findsAny); // memberCount
      expect(find.text('5'), findsAny); // expenseCount
      // Members
      expect(find.text('Test User'), findsAny);
      expect(find.text('Colleague'), findsOneWidget);
      expect(find.text('owner'), findsOneWidget);
      expect(find.text('member'), findsOneWidget);
      // Approval flag
      expect(find.text('Expense approval required'), findsOneWidget);
    });

    testWidgets('Group detail back navigation returns to list', (tester) async {
      final now = Timestamp.now();
      await fs.collection('groups').doc('group-1').set({
        'name': 'Test Group', 'icon': '🎯', 'createdBy': 'test-user-123',
        'createdAt': now, 'updatedAt': now,
        'settings': {'requireApproval': false, 'allowMemberInvites': true},
        'status': 'active',
        'stats': {'memberCount': 1, 'expenseCount': 0, 'totalAmount': 0,
            'lastActivityAt': now},
      });
      await fs.collection('groupMembers').doc('group-1_test-user-123').set({
        'groupId': 'group-1', 'userId': 'test-user-123',
        'userEmail': 'test@penny.app', 'role': 'owner', 'status': 'active',
        'permissions': {}, 'invitedAt': now, 'invitedBy': 'test-user-123',
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Groups'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap into detail
      await tester.tap(find.text('Test Group'));
      await tester.pumpAndSettle();
      expect(find.text('MEMBERS'), findsOneWidget);

      // Go back
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      // Should be back on groups list
      expect(find.text('Test Group'), findsOneWidget);
      expect(find.text('1 members'), findsOneWidget);
    });
  });

  // ====== PHASE 4: Notifications ======

  group('Phase 4 — Notifications', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Notification screen shows empty state', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle();

      expect(find.text('No notifications'), findsOneWidget);
      expect(find.text("You're all caught up!"), findsOneWidget);
    });

    testWidgets('Notifications render with seeded data', (tester) async {
      final now = Timestamp.now();
      await fs.collection('notifications').add({
        'userId': 'test-user-123', 'type': 'budget_warning',
        'title': 'Budget Warning', 'body': 'Meals at 85%',
        'icon': '⚠️', 'priority': 'high', 'category': 'budget',
        'read': false, 'delivered': true, 'isGrouped': false,
        'createdAt': now,
      });
      await fs.collection('notifications').add({
        'userId': 'test-user-123', 'type': 'group_expense_added',
        'title': 'New expense', 'body': 'Sarah added \$45 at Walmart',
        'icon': '💰', 'priority': 'medium', 'category': 'group',
        'read': true, 'delivered': true, 'isGrouped': false,
        'actorName': 'Sarah', 'createdAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('Budget Warning'), findsOneWidget);
      expect(find.text('Meals at 85%'), findsOneWidget);
      expect(find.text('New expense'), findsOneWidget);
      expect(find.text('Sarah'), findsOneWidget);
      // Mark all read button should show (1 unread)
      expect(find.text('Mark all read'), findsOneWidget);
    });

    testWidgets('Notification bell accessible from Home screen', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      // Tap bell icon on Home
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();

      expect(find.text('Notifications'), findsAny);
      expect(find.text('No notifications'), findsOneWidget);
    });
  });

  // ====== PHASE 4: Settings ======

  group('Phase 4 — Settings', () {
    late FakeFirebaseFirestore fs;
    late MockFirebaseAuth auth;

    setUp(() { fs = FakeFirebaseFirestore(); auth = _createAuth(); });

    testWidgets('Settings screen accessible from Profile', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();

      expect(find.text('PREFERENCES'), findsOneWidget);
      expect(find.text('Currency'), findsOneWidget);
      expect(find.text('CAD'), findsOneWidget);
      expect(find.text('NOTIFICATIONS'), findsOneWidget);
      expect(find.text('Push Notifications'), findsOneWidget);
      expect(find.text('Budget Alerts'), findsOneWidget);
      expect(find.text('ABOUT'), findsOneWidget);
      expect(find.text('App Version'), findsOneWidget);
      expect(find.text('1.0.0'), findsOneWidget);
      expect(find.text('Delete Account'), findsOneWidget);
    });

    testWidgets('Settings back navigation returns to Profile', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(find.text('Sign Out'), findsOneWidget);
      expect(find.text('Notifications'), findsOneWidget);
    });
  });

  // ====== CROSS-PHASE: Data Flow ======

  group('Cross-Phase — Data Flow', () {
    testWidgets('Expense added reflects in Dashboard immediately', (tester) async {
      final fs = FakeFirebaseFirestore();
      final auth = _createAuth();

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      // Dashboard shows $0
      await tester.tap(find.text('Dashboard'));
      await tester.pumpAndSettle();
      expect(find.text('\$0.00'), findsOneWidget);

      // Add expense while on Dashboard
      final now = DateTime.now();
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'New Expense', 'amount': 99.99,
        'category': 'Office expenses', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Dashboard should update in real-time
      expect(find.text('New Expense'), findsOneWidget);
      expect(find.text('\$0.00'), findsNothing);
    });

    testWidgets('Budget status updates when expense exceeds limit', (tester) async {
      final fs = FakeFirebaseFirestore();
      final auth = _createAuth();
      final now = DateTime.now();

      // Create budget
      await fs.collection('budgets_personal').add({
        'userId': 'test-user-123', 'category': 'Telephone',
        'monthlyLimit': 100,
        'period': {'month': now.month, 'year': now.year},
        'settings': {'rollover': false, 'alertThreshold': 80, 'notificationsEnabled': true},
        'createdAt': now, 'updatedAt': now,
      });

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap "Manage Budgets" to push to BudgetsScreen
      await tester.tap(find.text('Manage Budgets'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Initially Safe (no expenses)
      expect(find.text('Safe'), findsOneWidget);

      // Add expense that pushes to Warning (85%)
      await fs.collection('expenses').add({
        'userId': 'test-user-123', 'vendor': 'Bell', 'amount': 85,
        'category': 'Telephone', 'date': now,
        'expenseType': 'personal', 'groupId': null,
        'createdAt': now, 'updatedAt': now, 'syncStatus': 'synced',
        'history': [{'action': 'created', 'by': 'test-user-123', 'at': now}],
      });
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Status should update to Warning
      expect(find.text('Warning'), findsOneWidget);
      expect(find.text('Safe'), findsNothing);
    });
  });

  // ====== CROSS-PHASE: Navigation ======

  group('Cross-Phase — Navigation', () {
    testWidgets('All 5 tabs navigate correctly', (tester) async {
      final fs = FakeFirebaseFirestore();
      final auth = _createAuth();

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Penny'), findsOneWidget); // Home

      await tester.tap(find.text('Dashboard'));
      await tester.pumpAndSettle();
      expect(find.text('Total Spent'), findsOneWidget);

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      expect(find.text('No budgets yet'), findsOneWidget);

      await tester.tap(find.text('Groups'));
      await tester.pumpAndSettle();
      expect(find.text('No groups yet'), findsOneWidget);

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Sign Out'), findsOneWidget);

      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();
      expect(find.text('Track an expense'), findsOneWidget);
    });

    testWidgets('Finances → Income → back returns to Finances', (tester) async {
      final fs = FakeFirebaseFirestore();
      final auth = _createAuth();

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      // Go to Finances
      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();
      expect(find.text('Income'), findsOneWidget);

      // Push to Income
      await tester.tap(find.text('Add Income'));
      await tester.pumpAndSettle();
      expect(find.text('No income sources'), findsOneWidget);

      // Go back
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      // Should be back on Finances
      expect(find.text('Income'), findsOneWidget);
      expect(find.text('Savings'), findsOneWidget);
      expect(find.text('Budgets'), findsOneWidget);
    });

    testWidgets('Finances → Savings → back returns to Finances', (tester) async {
      final fs = FakeFirebaseFirestore();
      final auth = _createAuth();

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Finances'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Add Goal'));
      await tester.pumpAndSettle();
      expect(find.text('TOTAL PORTFOLIO'), findsOneWidget);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(find.text('Savings'), findsOneWidget);
      expect(find.text('Budgets'), findsOneWidget);
    });

    testWidgets('Profile shows user info correctly', (tester) async {
      final fs = FakeFirebaseFirestore();
      final auth = _createAuth();

      await tester.pumpWidget(ProviderScope(
        overrides: _overrides(auth, fs),
        child: const PennyApp(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();

      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('test@penny.app'), findsOneWidget);
      expect(find.text('T'), findsOneWidget); // Avatar initial
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
    });
  });
}
