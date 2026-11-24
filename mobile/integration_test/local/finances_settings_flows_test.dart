// End-to-end runs of the finance and settings screens of the REAL app against
// a REAL local API (Firestore/Storage/Auth emulators behind it).
//
// Flows: budgets, income, savings, finances overview, notifications,
// settings / notification preferences, profile, and account deletion (last).
// Every write is checked on screen AND on the server.
//
// Problems that are bugs in the app or API (not in this test) are reported
// with `[E2E-BUG]` lines in the log and worked around (marked `// BUG:`) so
// the later steps still run; they do not fail the test.
//
// Run (simulator, with the local API and emulators already up):
//   flutter test integration_test/local/finances_settings_flows_test.dart \
//     -d <device> \
//     --dart-define=API_BASE_URL=http://127.0.0.1:8787 \
//     --dart-define=AUTH_EMULATOR_HOST=127.0.0.1:9099
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';
import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/firebase_options.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/expense_refresh.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/notification_preferences_providers.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/providers/savings_providers.dart';

const _firestoreHost = String.fromEnvironment(
  'FIRESTORE_EMULATOR_HOST',
  defaultValue: '127.0.0.1:8285',
);

// ---------------------------------------------------------------------------
// Shared state (one user "A" goes through all the flows; deleted at the end)
// ---------------------------------------------------------------------------

final _stamp = DateTime.now().millisecondsSinceEpoch;
final _emailA = 'fin-e2e-$_stamp@example.test';
final _passA = 'local-e2e-$_stamp';
late String _uidA;
_OtherUser? _userB;
final _bugs = <String>[];

void _bug(String id, String detail) {
  final line = '[E2E-BUG] $id: $detail';
  _bugs.add(line);
  debugPrint(line);
}

void _note(String text) => debugPrint('[E2E] $text');

// ---------------------------------------------------------------------------
// Pump helpers
// ---------------------------------------------------------------------------

String _onScreen() => find
    .byType(Text)
    .evaluate()
    .map((e) => (e.widget as Text).data ?? '')
    .where((t) => t.trim().isNotEmpty)
    .take(80)
    .join(' | ');

Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  String? what,
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail(
    'Timed out waiting for ${what ?? finder.describeMatch(Plurality.one)}. '
    'On screen: ${_onScreen()}',
  );
}

/// Like [_pumpUntil] but returns false instead of failing.
Future<bool> _appears(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 6),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return true;
  }
  return false;
}

Future<bool> _disappears(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 6),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return true;
  }
  return false;
}

Future<void> _pumpUntilGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  String? what,
}) async {
  if (await _disappears(tester, finder, timeout: timeout)) return;
  fail(
    'Timed out waiting for ${what ?? 'widget'} to go away. '
    'On screen: ${_onScreen()}',
  );
}

Future<void> _pumpFor(WidgetTester tester, Duration duration) async {
  final end = DateTime.now().add(duration);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

var _insetsLogged = false;

/// Types like a user, then closes the keyboard so it does not stay up for
/// the next screen (the simulator shows the real keyboard).
Future<void> _type(WidgetTester tester, Finder finder, String text) async {
  String? current() {
    final editable = find.descendant(
      of: finder.first,
      matching: find.byType(EditableText),
      matchRoot: true,
    );
    if (editable.evaluate().isEmpty) return null;
    return tester.widget<EditableText>(editable.first).controller.text;
  }

  for (var attempt = 0; attempt < 4; attempt++) {
    await tester.enterText(finder.first, text);
    await _pumpFor(tester, const Duration(milliseconds: 400));
    if (!_insetsLogged) {
      _insetsLogged = true;
      _note('keyboard inset while typing: ${tester.view.viewInsets.bottom}');
    }
    // When the real keyboard reconnects, iOS can send back its old (empty)
    // text a moment later; type again if that happened.
    if (current() == null || current() == text) break;
  }
  await _hideKeyboard(tester);
  if (current() != null && current() != text) {
    await tester.enterText(finder.first, text);
    await _pumpFor(tester, const Duration(milliseconds: 400));
  }
  expect(current() ?? text, text, reason: 'typed text kept in the field');
}

Future<void> _hideKeyboard(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
  await _pumpFor(tester, const Duration(milliseconds: 400));
}

/// Pumps until [finder] shows, scrolling the screen down as needed (list
/// items below the fold are not built).
Future<void> _scrollUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 300));
    if (finder.evaluate().isNotEmpty) return;
    final scrollables = find.byType(Scrollable);
    if (scrollables.evaluate().isNotEmpty) {
      await tester.drag(
        scrollables.first,
        const Offset(0, -250),
        warnIfMissed: false,
      );
    }
  }
  fail(
    'Timed out scrolling to ${finder.describeMatch(Plurality.one)}. '
    'On screen: ${_onScreen()}',
  );
}

final _layoutSeen = <String>{};

/// Layout errors from the app (overflows with the keyboard up, and the
/// assertions that follow them) are app bugs: report each place once and
/// let the flow go on. Anything else still fails the test.
Future<void> Function(WidgetTester) _guarded(
  Future<void> Function(WidgetTester) body,
) {
  return (tester) async {
    final original = FlutterError.onError;
    FlutterError.onError = (details) {
      final text = details.exceptionAsString();
      final layout =
          text.contains('overflowed by') ||
          text.contains('isNonNegative') ||
          text.contains("'attached': is not true") ||
          text.contains('referenceBox.attached') ||
          text.contains('_dependents.isEmpty');
      if (!layout) {
        original?.call(details);
        return;
      }
      final where =
          RegExp(
            r'lib/presentation/[\w/]+\.dart:\d+',
          ).firstMatch(details.toString())?.group(0) ??
          'framework';
      final first = text.split('\n').first;
      final key = '$where $first'.replaceAll(RegExp(r'[\d.]+ pixels'), 'N px');
      if (_layoutSeen.add(key)) {
        _bug(
          'LAYOUT',
          '$first at $where (viewInsets.bottom='
              '${tester.view.viewInsets.bottom})',
        );
      }
    };
    try {
      await body(tester);
    } finally {
      FlutterError.onError = original;
    }
  };
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pump();
  await tester.tap(finder.first);
  await _pumpFor(tester, const Duration(milliseconds: 600));
}

/// Pops pushed screens until the tab bar shows again.
Future<void> _backToShell(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    if (find.byType(NavigationBar).evaluate().isNotEmpty) return;
    final back = find.byTooltip('Back');
    if (back.evaluate().isEmpty) break;
    await tester.tap(back.first, warnIfMissed: false);
    await _pumpFor(tester, const Duration(milliseconds: 800));
  }
  await _pumpUntil(tester, find.byType(NavigationBar), what: 'the tab bar');
}

Future<void> _openTab(WidgetTester tester, String label, Finder showing) async {
  await _backToShell(tester);
  for (var attempt = 0; attempt < 40; attempt++) {
    if (showing.evaluate().isNotEmpty) return;
    final tab = find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text(label),
    );
    if (tab.evaluate().isNotEmpty) {
      await tester.tap(tab.first, warnIfMissed: false);
    }
    await _pumpFor(tester, const Duration(milliseconds: 500));
  }
  fail('Could not open the $label tab. On screen: ${_onScreen()}');
}

/// Pull-to-refresh on the first scrollable of the current screen.
Future<void> _pullToRefresh(WidgetTester tester) async {
  await tester.fling(
    find.byType(Scrollable).first,
    const Offset(0, 450),
    1500,
    warnIfMissed: false,
  );
  await _pumpFor(tester, const Duration(seconds: 2));
}

/// Waits for [finder]. If the screen does not update by itself, reports
/// [bugId] and refreshes the screen (pull-to-refresh, then [provider]).
Future<void> _expectUpdates(
  WidgetTester tester,
  ProviderContainer container,
  Finder finder, {
  required String bugId,
  required String bugText,
  required ProviderOrFamily provider,
  Duration wait = const Duration(seconds: 6),
}) async {
  if (await _appears(tester, finder, timeout: wait)) return;
  _bug(bugId, bugText);
  // BUG: the screen does not reload after the write; refresh it by hand.
  await _pullToRefresh(tester);
  if (await _appears(tester, finder, timeout: const Duration(seconds: 6))) {
    return;
  }
  container.invalidate(provider);
  await _pumpUntil(tester, finder, timeout: const Duration(seconds: 15));
}

Future<void> _expectGoneOrRefresh(
  WidgetTester tester,
  ProviderContainer container,
  Finder finder, {
  required String bugId,
  required String bugText,
  required ProviderOrFamily provider,
}) async {
  if (await _disappears(tester, finder)) return;
  _bug(bugId, bugText);
  // BUG: the screen does not reload after the write; refresh it by hand.
  await _pullToRefresh(tester);
  if (await _disappears(tester, finder)) return;
  container.invalidate(provider);
  await _pumpUntilGone(tester, finder, timeout: const Duration(seconds: 15));
}

Finder _switchInRow(String label) => find.descendant(
  of: find.ancestor(of: find.text(label), matching: find.byType(Row)).first,
  matching: find.byType(Switch),
);

Finder _inSheet(Finder matching) =>
    find.descendant(of: find.byType(BottomSheet), matching: matching);

// ---------------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------------

Future<Map<String, dynamic>> _get(
  ApiClient api,
  String path, [
  Map<String, dynamic>? query,
]) async {
  final response = await api.get<dynamic>(path, queryParameters: query);
  return Map<String, dynamic>.from(response.data as Map);
}

List<Map<String, dynamic>> _list(Map<String, dynamic> data, String key) =>
    ((data[key] as List?) ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();

Future<List<Map<String, dynamic>>> _serverBudgets(ApiClient api) async {
  final now = DateTime.now();
  return _list(
    await _get(api, '/api/budgets/personal', {
      'userId': _uidA,
      'month': now.month,
      'year': now.year,
    }),
    'budgets',
  );
}

Future<List<Map<String, dynamic>>> _serverIncome(ApiClient api) async => _list(
  await _get(api, '/api/income/personal', {'userId': _uidA}),
  'incomeSources',
);

Future<List<Map<String, dynamic>>> _serverSavings(ApiClient api) async => _list(
  await _get(api, '/api/savings/personal', {'userId': _uidA}),
  'savingsGoals',
);

Future<List<Map<String, dynamic>>> _serverNotifications(ApiClient api) async =>
    _list(
      await _get(api, '/api/notifications', {'userId': _uidA}),
      'notifications',
    );

Future<T> _poll<T>(
  Future<T> Function() read,
  bool Function(T value) done, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final end = DateTime.now().add(timeout);
  var value = await read();
  while (!done(value) && DateTime.now().isBefore(end)) {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    value = await read();
  }
  return value;
}

String _today() {
  final d = DateTime.now();
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

class _OtherUser {
  _OtherUser(this.uid, this.email, this.dio);
  final String uid;
  final String email;
  final Dio dio;
}

Future<Map<String, dynamic>> _authEmulator(
  String method,
  Map<String, dynamic> body,
) async {
  final client = HttpClient();
  try {
    final request = await client.postUrl(
      Uri.parse(
        'http://${EnvConfig.authEmulatorHost}/identitytoolkit.googleapis.com/'
        'v1/accounts:$method?key=local-e2e',
      ),
    );
    request.headers.contentType = ContentType.json;
    request.write(jsonEncode(body));
    final response = await request.close();
    return Map<String, dynamic>.from(
      jsonDecode(await response.transform(utf8.decoder).join()) as Map,
    );
  } finally {
    client.close();
  }
}

/// A second person, created straight in the Auth emulator, who talks to the
/// API with their own token (the app stays signed in as A).
Future<_OtherUser> _otherUser() async {
  if (_userB != null) return _userB!;
  final email = 'fin-e2e-b-$_stamp@example.test';
  final created = await _authEmulator('signUp', {
    'email': email,
    'password': 'local-e2e-b-$_stamp',
    'returnSecureToken': true,
  });
  final dio = Dio(
    BaseOptions(
      baseUrl: EnvConfig.apiBaseUrl,
      headers: {
        'Authorization': 'Bearer ${created['idToken']}',
        'Content-Type': 'application/json',
      },
    ),
  );
  return _userB = _OtherUser(created['localId'] as String, email, dio);
}

/// B creates a group and invites A, which gives A a `group_invitation`
/// notification (if A's settings allow it).
Future<String> _inviteAToNewGroup(String name) async {
  final b = await _otherUser();
  final created = await b.dio.post<dynamic>(
    '/api/groups',
    data: {'name': name, 'userName': 'Bea Other'},
  );
  final groupId = (created.data as Map)['groupId'] as String;
  await b.dio.post<dynamic>(
    '/api/groups/$groupId/members',
    data: {'email': _emailA, 'role': 'member'},
  );
  return groupId;
}

Future<int> _firestoreCount(String collection, String field, String uid) async {
  final projectId = Firebase.app().options.projectId;
  final client = HttpClient();
  try {
    final request = await client.postUrl(
      Uri.parse(
        'http://$_firestoreHost/v1/projects/$projectId/databases/(default)/'
        'documents:runQuery',
      ),
    );
    request.headers.contentType = ContentType.json;
    request.headers.set('Authorization', 'Bearer owner');
    request.write(
      jsonEncode({
        'structuredQuery': {
          'from': [
            {'collectionId': collection},
          ],
          'where': {
            'fieldFilter': {
              'field': {'fieldPath': field},
              'op': 'EQUAL',
              'value': {'stringValue': uid},
            },
          },
        },
      }),
    );
    final response = await request.close();
    final body = jsonDecode(await response.transform(utf8.decoder).join());
    return (body as List).where((e) => (e as Map)['document'] != null).length;
  } finally {
    client.close();
  }
}

Future<int> _firestoreDocStatus(String path) async {
  final projectId = Firebase.app().options.projectId;
  final client = HttpClient();
  try {
    final request = await client.getUrl(
      Uri.parse(
        'http://$_firestoreHost/v1/projects/$projectId/databases/(default)/'
        'documents/$path',
      ),
    );
    request.headers.set('Authorization', 'Bearer owner');
    final response = await request.close();
    await response.drain<void>();
    return response.statusCode;
  } finally {
    client.close();
  }
}

// ---------------------------------------------------------------------------
// App start-up (exactly like main()), signed in as A
// ---------------------------------------------------------------------------

var _initialized = false;

Future<void> _initOnce() async {
  if (_initialized) return;
  await Hive.initFlutter();
  final prefs = await Hive.openBox('app_preferences');
  await Hive.openBox('guest_expenses');
  await prefs.put('onboarding_complete', true);
  await prefs.put('guest_mode', false);
  if (defaultTargetPlatform == TargetPlatform.android) {
    await Firebase.initializeApp();
  } else {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  }
  final host = EnvConfig.authEmulatorHost.split(':');
  await FirebaseAuth.instance.useAuthEmulator(host[0], int.parse(host[1]));
  await FirebaseAuth.instance.signOut();
  final credential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
    email: _emailA,
    password: _passA,
  );
  await credential.user!.updateDisplayName('E2E User');
  _uidA = credential.user!.uid;
  _initialized = true;
}

Future<ProviderContainer> _launch(WidgetTester tester) async {
  // Use Flutter's test keyboard: the simulator's real keyboard sends its
  // own (empty) text back on unfocus and wipes what the test typed.
  tester.testTextInput.register();
  await _initOnce();
  if (FirebaseAuth.instance.currentUser?.uid != _uidA) {
    await FirebaseAuth.instance.signOut();
    await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: _emailA,
      password: _passA,
    );
  }
  await tester.pumpWidget(const ProviderScope(child: PennyApp()));
  await _pumpUntil(
    tester,
    find.text('Describe an expense...'),
    what: 'the home screen',
  );
  await _hideKeyboard(tester);
  return ProviderScope.containerOf(tester.element(find.byType(PennyApp)));
}

Future<String> _addExpense(
  ProviderContainer c,
  String vendor,
  double amount,
  String category,
) async {
  final id = await c
      .read(expenseRepositoryProvider)
      .savePersonalExpense(
        userId: _uidA,
        vendor: vendor,
        amount: amount,
        category: category,
        date: _today(),
      );
  // What the app does after its own saves.
  refreshExpenseData(c.invalidate);
  return id;
}

// ---------------------------------------------------------------------------

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final configured =
      EnvConfig.authEmulatorHost.isNotEmpty &&
      EnvConfig.apiBaseUrl.startsWith('http://127.0.0.1');
  const meals = 'Meals and entertainment';
  const groceries = 'Groceries';

  tearDownAll(() {
    debugPrint('[E2E] ===== bug summary (${_bugs.length}) =====');
    for (final b in _bugs) {
      debugPrint(b);
    }
  });

  // ==========================================================================
  testWidgets(
    '1. budgets: empty state, validation, create, usage at '
    '50/80/105 %, edit, delete',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      await _openTab(
        tester,
        'Finances',
        find.widgetWithText(AppBar, 'Finances'),
      );
      await _scrollUntil(tester, find.text('Create Budget'));
      await _tap(tester, find.text('Create Budget'));
      await _pumpUntil(tester, find.text('No budgets yet'));
      expect(find.text('Tap + to create your first budget'), findsOneWidget);

      // -- validation: nothing chosen, then a zero limit --
      await _tap(tester, find.byTooltip('Create budget'));
      final createButton = find.widgetWithText(ElevatedButton, 'Create Budget');
      await _pumpUntil(tester, createButton);
      await _tap(tester, createButton);
      expect(createButton, findsOneWidget, reason: 'empty form must not save');
      await _tap(tester, find.byType(DropdownButtonFormField<String>));
      await _pumpFor(tester, const Duration(milliseconds: 800));
      await tester.tap(find.text(meals).last);
      await _pumpFor(tester, const Duration(milliseconds: 800));
      await _type(tester, _inSheet(find.byType(TextField)), '0');
      await _tap(tester, createButton);
      expect(
        createButton,
        findsOneWidget,
        reason: 'a zero limit must not save',
      );
      if (find.textContaining('greater than').evaluate().isEmpty &&
          find.textContaining('valid').evaluate().isEmpty &&
          find.textContaining('Enter').evaluate().isEmpty) {
        _bug(
          'BUDGET-VALIDATION-SILENT',
          'Create Budget with no category / empty or 0 limit does nothing and '
              'shows no message (budgets_screen.dart:490 returns silently)',
        );
      }
      expect(await _serverBudgets(api), isEmpty);

      // -- create $100 --
      await _type(tester, _inSheet(find.byType(TextField)), '100');
      await _tap(tester, createButton);
      await _pumpUntilGone(tester, createButton, what: 'the create sheet');
      final created = await _serverBudgets(api);
      expect(created, hasLength(1));
      expect(created.single['category'], meals);
      expect((created.single['monthlyLimit'] as num).toDouble(), 100);
      expect(
        ((created.single['settings'] as Map)['alertThreshold'] as num)
            .toDouble(),
        80,
      );
      final budgetId = created.single['id'] as String;
      await _expectUpdates(
        tester,
        c,
        find.text('\$0 / \$100'),
        bugId: 'BUDGET-LIST-STALE-CREATE',
        bugText:
            'New budget does not appear on the Budgets screen until a manual '
            'pull-to-refresh (create sheet never invalidates budgetsProvider; '
            'budget_repository.dart:12 watchBudgets is a one-shot '
            'Stream.fromFuture, budgets_screen.dart:497-511)',
        provider: budgetsProvider,
      );
      expect(find.text('No budgets yet'), findsNothing);

      // -- usage follows the month's expenses in that category --
      final expenseIds = <String>[];
      expenseIds.add(await _addExpense(c, 'E2E Bistro', 50, meals));
      await _pumpUntil(tester, find.text('\$50 / \$100'), what: '50 of 100');
      expect(find.text('Safe'), findsWidgets);
      expect(find.text('50%'), findsWidgets);

      expenseIds.add(await _addExpense(c, 'E2E Diner', 30, meals));
      await _pumpUntil(tester, find.text('\$80 / \$100'), what: '80 of 100');
      expect(find.text('Warning'), findsWidgets);
      expect(find.text('80%'), findsWidgets);

      // Other categories do not count.
      expenseIds.add(await _addExpense(c, 'E2E Market', 10, groceries));
      await _pumpFor(tester, const Duration(seconds: 2));
      expect(find.text('\$80 / \$100'), findsWidgets);

      expenseIds.add(await _addExpense(c, 'E2E Steakhouse', 25, meals));
      await _pumpUntil(tester, find.text('\$105 / \$100'), what: '105 of 100');
      expect(find.text('Over'), findsWidgets);
      expect(find.text('105%'), findsWidgets);
      expect(find.text('-\$5 remaining'), findsOneWidget);
      expect(find.text('105% of monthly limit reached'), findsOneWidget);

      // Does the server raise a budget alert for a personal budget?
      final alerts = await _poll(
        () => _serverNotifications(api),
        (list) => list.isNotEmpty,
        timeout: const Duration(seconds: 5),
      );
      if (alerts.where((n) => '${n['type']}'.startsWith('budget')).isEmpty) {
        _bug(
          'BUDGET-NO-ALERTS',
          'Crossing 80% and 100% of a personal budget (alert threshold 80, '
              '"Budget notifications" on) creates no notification on the '
              'server; nothing in apps/api creates budget_warning / '
              'budget_exceeded notifications (only group types exist, '
              'apps/api/src/services/notifications.ts:15). The toggle in the '
              'budget sheet and the Budget Alerts preferences do nothing.',
        );
      }

      // -- edit: empty limit refused, then 200 --
      await _tap(tester, find.text(meals));
      await _pumpUntil(tester, find.text('Edit Budget'));
      final editField = _inSheet(find.byType(TextField));
      expect(tester.widget<TextField>(editField).controller!.text, '100');
      await _type(tester, editField, '');
      final saveButton = find.widgetWithText(ElevatedButton, 'Save');
      await _tap(tester, saveButton);
      expect(find.text('Edit Budget'), findsOneWidget);
      expect(
        ((await _serverBudgets(api)).single['monthlyLimit'] as num).toDouble(),
        100,
      );
      await _type(tester, editField, '200');
      await _tap(tester, saveButton);
      await _pumpUntilGone(tester, find.text('Edit Budget'));
      expect(await _appears(tester, find.text('Budget updated')), isTrue);
      final edited = await _serverBudgets(api);
      expect((edited.single['monthlyLimit'] as num).toDouble(), 200);
      await _expectUpdates(
        tester,
        c,
        find.text('\$105 / \$200'),
        bugId: 'BUDGET-LIST-STALE-EDIT',
        bugText:
            'After editing the limit the card still shows the old limit until '
            'pull-to-refresh (budgets_screen.dart:743-758 never invalidates '
            'budgetsProvider)',
        provider: budgetsProvider,
      );
      expect(find.text('Safe'), findsWidgets, reason: '105 of 200 is 53 %');

      // -- delete: cancel keeps it, delete removes it --
      await _tap(tester, find.text(meals));
      await _pumpUntil(tester, find.text('Edit Budget'));
      await _tap(tester, find.widgetWithText(TextButton, 'Delete Budget'));
      await _pumpUntil(tester, find.byType(AlertDialog));
      await _tap(tester, find.widgetWithText(TextButton, 'Cancel'));
      await _pumpUntilGone(tester, find.byType(AlertDialog));
      expect(await _serverBudgets(api), hasLength(1));
      await _tap(tester, find.widgetWithText(TextButton, 'Delete Budget'));
      await _pumpUntil(tester, find.byType(AlertDialog));
      await _tap(tester, find.widgetWithText(TextButton, 'Delete'));
      await _pumpUntilGone(tester, find.text('Edit Budget'));
      expect(await _appears(tester, find.text('Budget deleted')), isTrue);
      expect(await _serverBudgets(api), isEmpty);
      expect(await _firestoreDocStatus('budgets_personal/$budgetId'), 404);
      await _expectUpdates(
        tester,
        c,
        find.text('No budgets yet'),
        bugId: 'BUDGET-LIST-STALE-DELETE',
        bugText:
            'Deleted budget stays on the Budgets screen until pull-to-refresh '
            '(budgets_screen.dart:801-809 never invalidates budgetsProvider)',
        provider: budgetsProvider,
      );
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '2. income: empty state, validation, recurring + one-off, '
    'edit, delete, totals',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      await _openTab(
        tester,
        'Finances',
        find.widgetWithText(AppBar, 'Finances'),
      );
      await _scrollUntil(tester, find.text('Add Income'));
      await _tap(tester, find.text('Add Income'));
      await _pumpUntil(tester, find.text('No income sources'));

      // -- validation --
      await _tap(tester, find.byTooltip('Add income source'));
      final addButton = find.widgetWithText(ElevatedButton, 'Add Source');
      await _pumpUntil(tester, addButton);
      await _tap(tester, addButton);
      expect(addButton, findsOneWidget, reason: 'empty form must not save');
      final fields = _inSheet(find.byType(TextField));
      await _type(tester, fields.at(0), 'Acme Payroll');
      await _type(tester, fields.at(1), '0');
      await _tap(tester, addButton);
      expect(addButton, findsOneWidget, reason: 'zero amount must not save');
      await _type(tester, fields.at(0), '   ');
      await _type(tester, fields.at(1), '5000');
      await _tap(tester, addButton);
      expect(addButton, findsOneWidget, reason: 'blank name must not save');
      expect(await _serverIncome(api), isEmpty);

      // -- recurring monthly salary --
      await _type(tester, fields.at(0), 'Acme Payroll');
      await _tap(tester, addButton);
      await _pumpUntilGone(tester, addButton);
      var server = await _serverIncome(api);
      expect(server, hasLength(1));
      expect(server.single['name'], 'Acme Payroll');
      expect((server.single['amount'] as num).toDouble(), 5000);
      expect(server.single['frequency'], 'monthly');
      expect(server.single['isRecurring'], true);
      await _expectUpdates(
        tester,
        c,
        find.text('Acme Payroll'),
        bugId: 'INCOME-LIST-STALE-CREATE',
        bugText:
            'New income source does not appear until pull-to-refresh '
            '(income_screen.dart:402-414 never invalidates '
            'incomeSourcesProvider; income_repository.dart:11 is one-shot)',
        provider: incomeSourcesProvider,
      );
      expect(find.text('\$5,000/mo'), findsWidgets);

      // -- one-off --
      await _tap(tester, find.byTooltip('Add income source'));
      await _pumpUntil(tester, addButton);
      await _type(tester, fields.at(0), 'Conference Talk');
      await _type(tester, fields.at(1), '750');
      await _tap(
        tester,
        _inSheet(find.byType(DropdownButtonFormField<String>)).at(1),
      );
      await _pumpFor(tester, const Duration(milliseconds: 800));
      await tester.tap(find.text('once').last);
      await _pumpFor(tester, const Duration(milliseconds: 800));
      await _tap(tester, addButton);
      await _pumpUntilGone(tester, addButton);
      server = await _serverIncome(api);
      expect(server, hasLength(2));
      final talk = server.singleWhere((s) => s['name'] == 'Conference Talk');
      expect(talk['frequency'], 'once');
      expect(talk['isRecurring'], false);
      await _expectUpdates(
        tester,
        c,
        find.text('Conference Talk'),
        bugId: 'INCOME-LIST-STALE-CREATE',
        bugText: 'second source also needs a manual refresh',
        provider: incomeSourcesProvider,
      );
      // A one-time source received this month counts once this month.
      expect(find.text('\$5,750'), findsWidgets);
      if (find.text('\$750one-time').evaluate().isNotEmpty) {
        _bug(
          'INCOME-ONE-TIME-LABEL',
          'One-time income shows as "\$750one-time" (no space/separator; '
              'income_screen.dart:305 + income_model.dart frequencyLabel)',
        );
      }

      // -- edit: blank name refused, then rename and raise --
      await _tap(tester, find.text('Acme Payroll'));
      final saveButton = find.widgetWithText(ElevatedButton, 'Save Changes');
      await _pumpUntil(tester, saveButton);
      expect(tester.widget<TextField>(fields.at(1)).controller!.text, '5000');
      await _type(tester, fields.at(0), '');
      await _tap(tester, saveButton);
      expect(saveButton, findsOneWidget);
      await _type(tester, fields.at(0), 'Acme Payroll Inc');
      await _type(tester, fields.at(1), '5200');
      await _tap(tester, saveButton);
      await _pumpUntilGone(tester, saveButton);
      expect(
        await _appears(tester, find.text('Income source updated')),
        isTrue,
      );
      server = await _serverIncome(api);
      final acme = server.singleWhere((s) => s['id'] != talk['id']);
      expect(acme['name'], 'Acme Payroll Inc');
      expect((acme['amount'] as num).toDouble(), 5200);
      await _expectUpdates(
        tester,
        c,
        find.text('Acme Payroll Inc'),
        bugId: 'INCOME-LIST-STALE-EDIT',
        bugText:
            'Edited income source keeps its old name/amount until '
            'pull-to-refresh (income_screen.dart:580-596)',
        provider: incomeSourcesProvider,
      );
      expect(find.text('\$5,950'), findsWidgets);

      // -- delete the one-off (no confirmation, no undo) --
      final talkRow = find.ancestor(
        of: find.text('Conference Talk'),
        matching: find.byType(Dismissible),
      );
      await _tap(
        tester,
        find.descendant(
          of: talkRow,
          matching: find.byTooltip('Delete income source'),
        ),
      );
      await _pumpFor(tester, const Duration(milliseconds: 500));
      if (find.byType(AlertDialog).evaluate().isEmpty &&
          find.textContaining('Undo').evaluate().isEmpty) {
        _note(
          'income delete icon removes the source at once: no confirmation, '
          'no undo',
        );
      }
      server = await _poll(() => _serverIncome(api), (s) => s.length == 1);
      expect(server, hasLength(1));
      await _expectGoneOrRefresh(
        tester,
        c,
        find.text('Conference Talk'),
        bugId: 'INCOME-LIST-STALE-DELETE',
        bugText:
            'Deleted income source (trash icon) stays on screen until '
            'pull-to-refresh (income_screen.dart:202-205)',
        provider: incomeSourcesProvider,
      );
      expect(find.text('\$5,200'), findsWidgets);
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '3. savings: validation, create, contribute, edit, reach the '
    'target, delete',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      await _openTab(
        tester,
        'Finances',
        find.widgetWithText(AppBar, 'Finances'),
      );
      await _scrollUntil(tester, find.text('Add Goal'));
      await _tap(tester, find.text('Add Goal'));
      await _pumpUntil(tester, find.text('No savings goals yet'));

      // -- validation --
      await _tap(tester, find.byTooltip('Create savings goal'));
      final createButton = find.widgetWithText(ElevatedButton, 'Create Goal');
      await _pumpUntil(tester, createButton);
      final fields = _inSheet(find.byType(TextField));
      await _tap(tester, createButton);
      expect(createButton, findsOneWidget);
      await _type(tester, fields.at(0), 'Emergency Fund');
      await _type(tester, fields.at(1), '0');
      await _tap(tester, createButton);
      expect(createButton, findsOneWidget, reason: 'zero target must not save');
      expect(await _serverSavings(api), isEmpty);

      // -- create --
      await _type(tester, fields.at(1), '1000');
      await _type(tester, fields.at(2), '100');
      await _tap(tester, createButton);
      await _pumpUntilGone(tester, createButton);
      var server = await _serverSavings(api);
      expect(server, hasLength(1));
      final goalId = server.single['id'] as String;
      expect((server.single['targetAmount'] as num).toDouble(), 1000);
      expect((server.single['currentAmount'] as num).toDouble(), 0);
      expect((server.single['monthlyContribution'] as num).toDouble(), 100);
      expect(server.single['status'], 'active');
      await _expectUpdates(
        tester,
        c,
        find.text('\$0 / \$1,000'),
        bugId: 'SAVINGS-LIST-STALE-CREATE',
        bugText:
            'New savings goal does not appear until pull-to-refresh '
            '(savings_screen.dart:443-454 never invalidates '
            'savingsGoalsProvider)',
        provider: savingsGoalsProvider,
      );
      expect(find.text('\$100/mo contribution'), findsOneWidget);

      // -- contribution: negative refused, then 250 --
      Future<void> contribute(String amount) async {
        await _tap(tester, find.text('Emergency Fund'));
        await _pumpUntil(tester, find.text('Add Contribution'));
        await _tap(tester, find.text('Add Contribution'));
        await _pumpUntil(
          tester,
          find.widgetWithText(ElevatedButton, 'Add Contribution'),
        );
        await _type(tester, _inSheet(find.byType(TextField)), amount);
        await _tap(
          tester,
          find.widgetWithText(ElevatedButton, 'Add Contribution'),
        );
      }

      await contribute('-5');
      expect(
        find.widgetWithText(ElevatedButton, 'Add Contribution'),
        findsOneWidget,
        reason: 'a negative contribution must not save',
      );
      await _type(tester, _inSheet(find.byType(TextField)), '250');
      await _tap(
        tester,
        find.widgetWithText(ElevatedButton, 'Add Contribution'),
      );
      await _pumpUntilGone(
        tester,
        find.widgetWithText(ElevatedButton, 'Add Contribution'),
      );
      expect(
        await _appears(tester, find.text('Added \$250 to Emergency Fund')),
        isTrue,
      );
      server = await _serverSavings(api);
      expect((server.single['currentAmount'] as num).toDouble(), 250);
      expect((server.single['progressPercentage'] as num).toDouble(), 25);
      await _expectUpdates(
        tester,
        c,
        find.text('\$250 / \$1,000'),
        bugId: 'SAVINGS-LIST-STALE-CONTRIBUTION',
        bugText:
            'After adding a contribution the goal still shows the old amount '
            'and progress until pull-to-refresh (savings_screen.dart:801-814)',
        provider: savingsGoalsProvider,
      );
      await _pumpUntil(tester, find.text('25%'), what: '25 % ring');

      // -- edit: blank name refused, then lower the target to 500 --
      await _tap(tester, find.text('Emergency Fund'));
      await _pumpUntil(tester, find.text('Edit Goal'));
      await _tap(tester, find.text('Edit Goal'));
      final saveButton = find.widgetWithText(ElevatedButton, 'Save Changes');
      await _pumpUntil(tester, saveButton);
      await _type(tester, fields.at(0), '');
      await _tap(tester, saveButton);
      expect(saveButton, findsOneWidget);
      await _type(tester, fields.at(0), 'Emergency Fund');
      await _type(tester, fields.at(1), '500');
      await _tap(tester, saveButton);
      await _pumpUntilGone(tester, saveButton);
      expect(await _appears(tester, find.text('Savings goal updated')), isTrue);
      server = await _serverSavings(api);
      expect((server.single['targetAmount'] as num).toDouble(), 500);
      expect((server.single['progressPercentage'] as num).toDouble(), 50);
      await _expectUpdates(
        tester,
        c,
        find.text('\$250 / \$500'),
        bugId: 'SAVINGS-LIST-STALE-EDIT',
        bugText:
            'Edited goal keeps the old target until pull-to-refresh '
            '(savings_screen.dart:677-691)',
        provider: savingsGoalsProvider,
      );
      if (find.textContaining('Mark complete').evaluate().isEmpty &&
          find.textContaining('Pause').evaluate().isEmpty) {
        _note('savings: no mark-complete / pause action is offered in the app');
      }

      // -- a second goal set up on the server, and one to delete --
      final vacation = await api.post<dynamic>(
        '/api/savings/personal',
        data: {
          'userId': _uidA,
          'name': 'Vacation',
          'category': 'travel',
          'targetAmount': 2000,
          'monthlyContribution': 0,
          'priority': 'low',
        },
      );
      final vacationId = (vacation.data as Map)['id'] as String;
      await api.post<dynamic>(
        '/api/savings/personal/$vacationId/contributions',
        data: {'amount': 300},
      );
      await api.post<dynamic>(
        '/api/savings/personal',
        data: {
          'userId': _uidA,
          'name': 'Delete Me',
          'category': 'custom',
          'targetAmount': 50,
          'monthlyContribution': 0,
          'priority': 'low',
        },
      );
      await _pullToRefresh(tester);
      await _pumpUntil(tester, find.text('Delete Me'));
      await _pumpUntil(tester, find.text('\$300 / \$2,000'));

      // -- delete via the trash icon --
      final deleteRow = find.ancestor(
        of: find.text('Delete Me'),
        matching: find.byType(Dismissible),
      );
      await _tap(
        tester,
        find.descendant(
          of: deleteRow,
          matching: find.byTooltip('Delete savings goal'),
        ),
      );
      server = await _poll(() => _serverSavings(api), (s) => s.length == 2);
      expect(server.where((g) => g['name'] == 'Delete Me'), isEmpty);
      await _expectGoneOrRefresh(
        tester,
        c,
        find.text('Delete Me'),
        bugId: 'SAVINGS-LIST-STALE-DELETE',
        bugText:
            'Deleted savings goal (trash icon) stays on screen until '
            'pull-to-refresh (savings_screen.dart:174-177)',
        provider: savingsGoalsProvider,
      );

      // -- reach the target: 250 + 250 of 500 --
      await contribute('250');
      await _pumpUntilGone(
        tester,
        find.widgetWithText(ElevatedButton, 'Add Contribution'),
      );
      server = await _serverSavings(api);
      final done = server.singleWhere((g) => g['id'] == goalId);
      expect((done['currentAmount'] as num).toDouble(), 500);
      expect(done['status'], 'achieved');
      await _pullToRefresh(tester);
      await _pumpFor(tester, const Duration(seconds: 2));
      final stillListed = find.text('Emergency Fund').evaluate().isNotEmpty;
      final portfolio = c.read(totalSavedProvider);
      if (!stillListed) {
        _bug(
          'SAVINGS-ACHIEVED-VANISHES',
          'A goal that reaches its target (server sets status "achieved") '
              'disappears from the Savings screen with no message, and its '
              '\$500 drops out of TOTAL PORTFOLIO (now \$$portfolio) and the '
              'Finances "saved" total. The app only lists status=active '
              '(savings_repository.dart:20) and has no completed view.',
        );
      }
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '4. finances overview matches what was created and the server',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);
      final now = DateTime.now();

      // A budget for the month, set up on the server (Groceries: $10 spent).
      await api.post<dynamic>(
        '/api/budgets/personal',
        data: {
          'userId': _uidA,
          'category': groceries,
          'monthlyLimit': 300,
          'period': {'month': now.month, 'year': now.year},
          'settings': {
            'rollover': false,
            'alertThreshold': 80,
            'notificationsEnabled': true,
          },
        },
      );

      await _openTab(
        tester,
        'Finances',
        find.widgetWithText(AppBar, 'Finances'),
      );

      // What the server holds.
      final income = (await _serverIncome(
        api,
      )).where((s) => s['isActive'] != false).toList();
      final budgets = await _serverBudgets(api);
      // Completed ("achieved") and paused goals still count, as on screen.
      final savings = (await _serverSavings(api))
          .where(
            (g) => const {'active', 'achieved', 'paused'}.contains(g['status']),
          )
          .toList();
      expect(income, hasLength(1));
      expect(budgets, hasLength(1));
      final monthlyIncome = (income.single['amount'] as num).toDouble();
      double sum(String key) =>
          savings.fold(0.0, (t, g) => t + (g[key] as num).toDouble());
      final saved = sum('currentAmount');
      final target = sum('targetAmount');
      expect(monthlyIncome, 5200);
      final savedText = NumberFormat.currency(
        symbol: '\$',
        decimalDigits: 0,
      ).format(saved);

      await _pumpUntil(tester, find.text('\$5,200/mo'), what: 'income total');
      expect(find.text('1 active source'), findsOneWidget);
      await _pumpUntil(tester, find.text('\$300 allocated'));
      expect(find.text('\$10 spent · 1 category'), findsOneWidget);
      await _scrollUntil(tester, find.text('$savedText saved'));
      expect(
        find.text(
          '${(saved / target * 100).toStringAsFixed(0)}% progress '
          '· ${savings.length} goal${savings.length == 1 ? '' : 's'}',
        ),
        findsOneWidget,
      );
      // Budgets is expanded by default and lists the category.
      expect(find.text('\$10/\$300'), findsOneWidget);

      // -- a change made elsewhere shows after pull-to-refresh --
      await api.post<dynamic>(
        '/api/income/personal',
        data: {
          'userId': _uidA,
          'name': 'Side Gig',
          'category': 'side_hustle',
          'amount': 120,
          'frequency': 'weekly',
          'isRecurring': true,
          'isActive': true,
          'taxable': true,
          'currency': 'CAD',
        },
      );
      await _addExpense(c, 'E2E Grocer', 40, groceries);
      await _pullToRefresh(tester);
      // 5200 + 120 * 52 / 12 = 5720
      await _pumpUntil(
        tester,
        find.text('\$5,720/mo'),
        what: 'refreshed income',
      );
      expect(find.text('2 active sources'), findsOneWidget);
      await _pumpUntil(tester, find.text('\$50 spent · 1 category'));

      // -- the Manage buttons open the right screens --
      await _tap(tester, find.text('Income'));
      await _scrollUntil(tester, find.text('Manage Income'));
      await _tap(tester, find.text('Manage Income'));
      await _pumpUntil(tester, find.text('Side Gig'));
      expect(find.text('\$5,720'), findsWidgets);
      await _backToShell(tester);
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '5. notifications: server-made notifications, unread badge, '
    'open, mark read, mark all read, delete',
    _guarded((tester) async {
      await _initOnce();
      final g1 = await _inviteAToNewGroup('Fin Household $_stamp');
      final g2 = await _inviteAToNewGroup('Fin Trip $_stamp');
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      var server = await _poll(
        () => _serverNotifications(api),
        (n) => n.length >= 2,
      );
      final invites = server
          .where((n) => n['type'] == 'group_invitation')
          .toList();
      expect(invites, hasLength(2));
      expect(invites.every((n) => n['read'] == false), isTrue);
      // Flow 1's budget alerts are also unread; mark them read so this flow
      // counts only the two invitations.
      for (final n in server.where(
        (n) => n['type'] != 'group_invitation' && n['read'] == false,
      )) {
        await api.patch('/api/notifications/${n['id']}/read');
      }
      c.invalidate(notificationsProvider);

      // Unread count on the home bell and the Home tab.
      await _pumpUntil(
        tester,
        find.byTooltip('2 unread notifications'),
        what: 'the bell with 2 unread',
      );
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );

      await _tap(tester, find.byTooltip('2 unread notifications'));
      await _pumpUntil(tester, find.text('Mark all read'));
      expect(find.text('Group invitation'), findsNWidgets(2));
      expect(find.textContaining('Fin Household $_stamp'), findsOneWidget);
      expect(find.textContaining('Fin Trip $_stamp'), findsOneWidget);

      // -- open one: marked read, goes to its group --
      await _tap(tester, find.textContaining('Fin Household $_stamp'));
      await _pumpFor(tester, const Duration(seconds: 3));
      final opened = _onScreen();
      _note('opening an invitation (not yet a member) shows: $opened');
      final error = tester.takeException();
      if (error != null) {
        _bug('NOTIF-OPEN-INVITE-CRASH', 'Opening an invitation threw: $error');
      }
      if (opened.contains('Could not') ||
          opened.contains('not found') ||
          opened.contains('denied') ||
          opened.contains('Error')) {
        _bug(
          'NOTIF-OPEN-INVITE-ERROR',
          'Tapping a group invitation notification opens /groups/<id> '
              '(actionUrl) for a group the user is not a member of yet, which '
              'shows an error instead of the invitation '
              '(notifications_screen.dart:165-171). Screen: $opened',
        );
      }
      server = await _serverNotifications(api);
      final first = server.singleWhere((n) => n['groupId'] == g1);
      if (first['read'] != true) {
        _bug(
          'NOTIF-MARK-READ-400',
          'Opening a notification never marks it read: PATCH '
              '/api/notifications/<id>/read is sent with Content-Type '
              'application/json and no body, which Fastify rejects with 400 '
              '"Body cannot be empty when content-type is set to '
              'application/json" (notification_repository.dart:27 calls '
              'ApiClient.patch without data; api_client.dart:49 has no {} '
              'default like delete()). The error is swallowed '
              '(notifications_screen.dart:24-30), so the unread badge never '
              'goes down except via "Mark all read".',
        );
        // BUG: mark it read the way the server accepts, then reload.
        await api.patch<dynamic>(
          '/api/notifications/${first['id']}/read',
          data: const <String, Object?>{},
        );
        c.invalidate(notificationsProvider);
        server = await _serverNotifications(api);
      }
      expect(server.singleWhere((n) => n['groupId'] == g1)['read'], true);
      expect(server.singleWhere((n) => n['groupId'] == g2)['read'], false);
      // The invitation opened the Groups tab; the bell is on Home.
      await _openTab(tester, 'Home', find.byTooltip('1 unread notification'));
      await _pumpUntil(
        tester,
        find.byTooltip('1 unread notification'),
        what: 'bell with 1 unread',
      );
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );

      // -- mark all read --
      await _tap(tester, find.byTooltip('1 unread notification'));
      await _pumpUntil(tester, find.text('Mark all read'));
      await _tap(tester, find.text('Mark all read'));
      await _pumpUntilGone(tester, find.text('Mark all read'));
      server = await _serverNotifications(api);
      expect(server.every((n) => n['read'] == true), isTrue);

      // -- delete one through its menu --
      final countBefore = server.length;
      await _tap(tester, find.byTooltip('Notification actions').first);
      await _pumpUntil(tester, find.text('Delete'));
      await _tap(tester, find.text('Delete'));
      server = await _poll(
        () => _serverNotifications(api),
        (n) => n.length == countBefore - 1,
      );
      expect(server, hasLength(countBefore - 1));
      await _pumpFor(tester, const Duration(seconds: 2));
      if (find.byTooltip('Notification actions').evaluate().length !=
          server.length) {
        _bug(
          'NOTIF-DELETE-MENU-STALE',
          'Deleting a notification with the "..." menu > Delete removes it '
              'on the server but it stays in the list '
              '(${find.text('Group invitation').evaluate().length} rows for 1 '
              'notification) until pull-to-refresh '
              '(notifications_screen.dart:119-124 onDismiss never invalidates '
              'notificationsProvider; only a swipe removes the row)',
        );
        // BUG: refresh so the rest of the flow sees the real list.
        await _pullToRefresh(tester);
        if (find.byTooltip('Notification actions').evaluate().length !=
            server.length) {
          c.invalidate(notificationsProvider);
          await _pumpFor(tester, const Duration(seconds: 2));
        }
      }
      expect(
        find.byTooltip('Notification actions'),
        findsNWidgets(server.length),
      );

      await _backToShell(tester);
      await _pumpUntil(tester, find.byTooltip('Notifications'));
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '6. settings: currency, pause all, quiet hours (invalid time '
    'refused), per-type in-app switch; values persist and act on the '
    'server',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      await _openTab(tester, 'Profile', find.text('Sign Out'));
      await _tap(tester, find.text('Settings'));
      await _pumpUntil(tester, find.text('Currency'));
      await _pumpUntil(tester, find.text('CAD'));

      // -- currency --
      await _tap(tester, find.text('Currency'));
      await _pumpUntil(tester, find.text('USD'));
      await _tap(tester, find.text('USD'));
      await _pumpUntilGone(tester, find.text('EUR'), what: 'currency sheet');
      await _pumpUntil(tester, find.text('USD'), what: 'USD subtitle');
      final prefs = await _get(api, '/api/user/preferences', {'userId': _uidA});
      expect((prefs['preferences'] as Map)['currency'], 'USD');

      // -- notification preferences --
      Future<void> openPrefs() async {
        await _tap(tester, find.text('Notification Preferences'));
        await _pumpUntil(tester, find.text('Pause All Notifications'));
        await _pumpFor(tester, const Duration(seconds: 1));
      }

      Future<Map<String, dynamic>> serverSettings() async =>
          Map<String, dynamic>.from(
            (await _get(api, '/api/notification-settings', {
                      'userId': _uidA,
                    }))['settings']
                    as Map? ??
                {},
          );

      Future<void> leavePrefs() async {
        await tester.tap(find.byTooltip('Back'));
        await _pumpUntilGone(tester, find.text('Pause All Notifications'));
        await _pumpUntil(tester, find.text('Appearance'));
        await _pumpFor(tester, const Duration(milliseconds: 500));
      }

      bool muteShown() =>
          tester.widget<Switch>(_switchInRow('Pause All Notifications')).value;

      await openPrefs();
      expect(muteShown(), isFalse);
      await _tap(tester, _switchInRow('Pause All Notifications'));
      final muted = await _poll(serverSettings, (s) => s['globalMute'] == true);
      expect(muted['globalMute'], true, reason: 'server saved the mute');
      await _pumpFor(tester, const Duration(seconds: 1));
      if (!muteShown()) {
        _bug(
          'PREFS-MUTE-SWITCH-SNAPS-BACK',
          '"Pause All Notifications" switch snaps back to off right after '
              'tapping, although the server saved globalMute=true '
              '(notification_preferences_screen.dart:78-85 never invalidates '
              'notificationSettingsProvider; repository watchSettings is a '
              'one-shot Stream.fromFuture)',
        );
      }
      // Leave and come back.
      await leavePrefs();
      await openPrefs();
      if (!muteShown()) {
        _bug(
          'PREFS-MUTE-STALE-AFTER-REOPEN',
          'Leaving and reopening Notification Preferences still shows '
              '"Pause All Notifications" off while the server has it on; '
              'tapping it again would send globalMute=true again, so the user '
              'cannot turn mute off from the app in this session.',
        );
        // BUG: reload so the switch shows the saved value.
        c.invalidate(notificationSettingsProvider);
        await _pumpFor(tester, const Duration(seconds: 2));
      }
      expect(muteShown(), isTrue);

      // Muted: a new invitation makes no in-app notification.
      final before = (await _serverNotifications(api)).length;
      await _inviteAToNewGroup('Fin Muted $_stamp');
      await Future<void>.delayed(const Duration(seconds: 2));
      expect((await _serverNotifications(api)).length, before);

      // Unmute.
      await _tap(tester, _switchInRow('Pause All Notifications'));
      final unmuted = await _poll(
        serverSettings,
        (s) => s['globalMute'] == false,
      );
      expect(unmuted['globalMute'], false);
      c.invalidate(notificationSettingsProvider); // (see bug above)
      await _pumpFor(tester, const Duration(seconds: 1));
      expect(muteShown(), isFalse);

      // -- quiet hours: invalid typed time refused, then 23:30 - 06:45 --
      await _tap(tester, find.text('Quiet Hours'));
      await _pumpUntil(tester, find.text('Start'));
      Future<void> pickTime(String row, int hour24, int minute) async {
        await _tap(tester, find.text(row));
        await _pumpUntil(tester, find.byType(Dialog));
        await _tap(tester, find.byIcon(Icons.keyboard_outlined));
        final inputs = find.descendant(
          of: find.byType(Dialog),
          matching: find.byType(TextField),
        );
        await _pumpUntil(tester, inputs);
        final twelveHour = find.text('PM').evaluate().isNotEmpty;
        await _type(tester, inputs.at(0), '99');
        await _type(tester, inputs.at(1), '99');
        await _tap(tester, find.text('OK'));
        expect(
          find.byType(Dialog),
          findsOneWidget,
          reason: 'an impossible time must not be accepted',
        );
        expect(find.textContaining('valid time'), findsOneWidget);
        final shownHour = twelveHour
            ? (hour24 % 12 == 0 ? 12 : hour24 % 12)
            : hour24;
        await _type(tester, inputs.at(0), '$shownHour');
        await _type(tester, inputs.at(1), minute.toString().padLeft(2, '0'));
        if (twelveHour) {
          await _tap(tester, find.text(hour24 >= 12 ? 'PM' : 'AM'));
        }
        await _tap(tester, find.text('OK'));
        await _pumpUntilGone(tester, find.byType(Dialog));
      }

      await pickTime('Start', 23, 30);
      await pickTime('End', 6, 45);
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Save'));
      await _pumpUntilGone(tester, find.text('Start'));
      final quiet = await _poll(
        serverSettings,
        (s) => s['quietHoursStart'] == '23:30',
      );
      expect(quiet['quietHoursStart'], '23:30');
      expect(quiet['quietHoursEnd'], '06:45');
      await _expectUpdates(
        tester,
        c,
        find.text('23:30 - 06:45'),
        bugId: 'PREFS-QUIET-HOURS-STALE',
        bugText:
            'Saved quiet hours still show the old "22:00 - 08:00" on the '
            'preferences screen (no invalidate after save, '
            'notification_preferences_screen.dart:154-160)',
        provider: notificationSettingsProvider,
        wait: const Duration(seconds: 3),
      );
      await leavePrefs();
      await openPrefs();
      expect(find.text('23:30 - 06:45'), findsOneWidget);

      // -- per type: group invitations not shown in-app --
      await tester.scrollUntilVisible(
        find.text('Group Invitation'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await _tap(tester, find.text('Group Invitation'));
      await _pumpUntil(tester, find.text('In-App'));
      expect(tester.widget<Switch>(_switchInRow('In-App')).value, isTrue);
      await _tap(tester, _switchInRow('In-App'));
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Save'));
      await _pumpUntilGone(tester, find.text('In-App'));
      final typePrefs = await _poll(
        () async => Map<String, dynamic>.from(
          (await _get(api, '/api/notification-preferences', {
                    'userId': _uidA,
                  }))['preferences']
                  as Map? ??
              {},
        ),
        (p) => (p['group_invitation'] as Map?)?['inApp'] == false,
      );
      expect((typePrefs['group_invitation'] as Map)['inApp'], false);
      expect((typePrefs['group_invitation'] as Map)['push'], true);
      final row = find.ancestor(
        of: find.text('Group Invitation'),
        matching: find.byType(InkWell),
      );
      final inboxIcon = find.descendant(
        of: row.first,
        matching: find.byIcon(Icons.inbox_outlined),
      );
      await _expectGoneOrRefresh(
        tester,
        c,
        inboxIcon,
        bugId: 'PREFS-TYPE-STALE',
        bugText:
            'After switching In-App off for "Group Invitation" the row still '
            'shows the in-app icon (no invalidate of '
            'notificationTypePrefsProvider, '
            'notification_preferences_screen.dart:191-199)',
        provider: notificationTypePrefsProvider,
      );

      final beforeType = (await _serverNotifications(api)).length;
      await _inviteAToNewGroup('Fin NoInApp $_stamp');
      await Future<void>.delayed(const Duration(seconds: 2));
      expect(
        (await _serverNotifications(api)).length,
        beforeType,
        reason: 'in-app off for group invitations',
      );
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '7. profile: display name (empty refused), initial, server',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      await _openTab(tester, 'Profile', find.text('Sign Out'));
      await _pumpUntil(tester, find.text('E2E User'));
      final avatar = find.descendant(
        of: find.byType(CircleAvatar),
        matching: find.byType(Text),
      );
      expect(tester.widget<Text>(avatar.first).data, 'E');

      // -- empty and blank names are refused --
      await _tap(tester, find.text('E2E User'));
      await _pumpUntil(tester, find.text('Edit Display Name'));
      final field = _inSheet(find.byType(TextFormField));
      await _type(tester, field, '');
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Save'));
      expect(find.text('Name cannot be empty'), findsOneWidget);
      await _type(tester, field, '    ');
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Save'));
      expect(find.text('Name cannot be empty'), findsOneWidget);
      expect(find.text('Edit Display Name'), findsOneWidget);

      // -- a 60-character name is cut at 50 --
      await tester.enterText(field.first, 'Z' * 60);
      await tester.pump();
      expect(
        tester
            .widget<TextField>(_inSheet(find.byType(TextField)))
            .controller!
            .text
            .length,
        lessThanOrEqualTo(50),
      );

      // -- a real name --
      await _type(tester, field, 'Zoe Tester');
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Save'));
      await _pumpUntilGone(tester, find.text('Edit Display Name'));
      final profile = await _poll(
        () => _get(api, '/api/user/profile'),
        (p) => (p['profile'] as Map)['displayName'] == 'Zoe Tester',
      );
      expect((profile['profile'] as Map)['displayName'], 'Zoe Tester');
      await FirebaseAuth.instance.currentUser!.reload();
      expect(FirebaseAuth.instance.currentUser!.displayName, 'Zoe Tester');
      if (!await _appears(tester, find.text('Zoe Tester'))) {
        _bug(
          'PROFILE-NAME-STALE',
          'Profile still shows "E2E User" after saving "Zoe Tester" (server '
              'and Firebase user have the new name). profile_screen.dart:106 '
              'reloads the user but the screen reads the User object held by '
              'currentUserProvider (auth_provider.dart:18), which is not '
              'refreshed.',
        );
      } else {
        expect(tester.widget<Text>(avatar.first).data, 'Z');
      }
      _note('Profile has no default-group setting (it lives on group detail)');

      // A fresh start shows the new name.
      await tester.pumpWidget(const SizedBox());
      await _pumpFor(tester, const Duration(seconds: 1));
      await tester.pumpWidget(const ProviderScope(child: PennyApp()));
      await _pumpUntil(tester, find.text('Describe an expense...'));
      await _openTab(tester, 'Profile', find.text('Sign Out'));
      await _pumpUntil(
        tester,
        find.text('Zoe Tester'),
        what: 'name after restart',
      );
      expect(tester.widget<Text>(avatar.first).data, 'Z');
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );

  // ==========================================================================
  testWidgets(
    '8. account deletion (last): cancel, delete, signed out, old '
    'credentials refused, data gone',
    _guarded((tester) async {
      final c = await _launch(tester);
      final api = c.read(apiClientProvider);

      // Some data to be removed.
      final expensesBefore = await _firestoreCount('expenses', 'userId', _uidA);
      final incomeBefore = await _firestoreCount(
        'income_sources_personal',
        'userId',
        _uidA,
      );
      final savingsBefore = await _firestoreCount(
        'savings_goals_personal',
        'userId',
        _uidA,
      );
      final budgetsBefore = await _firestoreCount(
        'budgets_personal',
        'userId',
        _uidA,
      );
      final notificationsBefore = await _firestoreCount(
        'notifications',
        'userId',
        _uidA,
      );
      _note(
        'before deletion: expenses $expensesBefore, income $incomeBefore, '
        'savings $savingsBefore, budgets $budgetsBefore, '
        'notifications $notificationsBefore',
      );
      expect(expensesBefore, greaterThan(0));
      expect(incomeBefore + savingsBefore + budgetsBefore, greaterThan(0));

      await _openTab(tester, 'Profile', find.text('Sign Out'));
      await _tap(tester, find.text('Settings'));
      await _pumpUntil(tester, find.text('Currency'));
      final deleteButton = find.text('Delete Account');
      await tester.scrollUntilVisible(
        deleteButton,
        200,
        scrollable: find.byType(Scrollable).first,
      );

      // -- cancel keeps everything --
      await _tap(tester, deleteButton);
      await _pumpUntil(tester, find.text('Delete Account?'));
      await _tap(tester, find.widgetWithText(OutlinedButton, 'Cancel'));
      await _pumpUntilGone(tester, find.text('Delete Account?'));
      expect(FirebaseAuth.instance.currentUser?.uid, _uidA);
      expect((await _get(api, '/api/user/profile'))['profile'], isNotNull);

      // -- delete --
      await _tap(tester, deleteButton);
      await _pumpUntil(tester, find.text('Delete Account?'));
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Delete'));
      final signIn = find.widgetWithText(ElevatedButton, 'Sign In');
      final onboarding = find.text('Skip');
      final end = DateTime.now().add(const Duration(seconds: 40));
      final snacks = <String>{};
      while (DateTime.now().isBefore(end) &&
          signIn.evaluate().isEmpty &&
          onboarding.evaluate().isEmpty) {
        await tester.pump(const Duration(milliseconds: 250));
        for (final e
            in find
                .descendant(
                  of: find.byType(SnackBar),
                  matching: find.byType(Text),
                )
                .evaluate()) {
          final t = (e.widget as Text).data;
          if (t != null && snacks.add(t)) _note('snackbar during delete: $t');
        }
      }
      final authGone =
          (await _authEmulator('signInWithPassword', {
            'email': _emailA,
            'password': _passA,
            'returnSecureToken': true,
          }))['error'] !=
          null;
      if (FirebaseAuth.instance.currentUser != null) {
        _bug(
          'DELETE-NOT-SIGNED-OUT',
          'After "Delete" the account is gone on the server '
              '(auth user removed: $authGone) but the app stays signed in on '
              'Settings and never reaches the sign-in screen. Snackbars: '
              '${snacks.isEmpty ? '(none)' : snacks.join(' / ')}. Screen: '
              '${_onScreen()}. deleteAccount() (settings_screen.dart:384-393) '
              'calls user.delete() after the API already deleted the auth '
              'user and only tolerates code user-not-found.',
        );
        // BUG: sign out by hand so the rest of the flow can run.
        await FirebaseAuth.instance.signOut();
        final end2 = DateTime.now().add(const Duration(seconds: 20));
        while (DateTime.now().isBefore(end2) &&
            signIn.evaluate().isEmpty &&
            onboarding.evaluate().isEmpty) {
          await tester.pump(const Duration(milliseconds: 250));
        }
      }
      expect(FirebaseAuth.instance.currentUser, isNull);
      await _pumpFor(tester, const Duration(seconds: 2));
      if (signIn.evaluate().isEmpty) {
        _bug(
          'DELETE-LANDS-ON-ONBOARDING',
          'After deleting the account the app shows the first-run onboarding '
              '(it clears the whole app_preferences box incl. '
              'onboarding_complete, settings_screen.dart:341) instead of the '
              'sign-in screen. Screen: ${_onScreen()}',
        );
        // BUG: walk through onboarding to the sign-in screen.
        final link = find.text('Already have an account? Sign In');
        for (var i = 0; i < 8 && link.evaluate().isEmpty; i++) {
          if (find.text('Next').evaluate().isNotEmpty) {
            await _tap(tester, find.text('Next'));
          }
          await _pumpFor(tester, const Duration(milliseconds: 500));
        }
        await _tap(tester, link);
        await _pumpUntil(tester, signIn);
      }
      _note('after deletion the app shows: ${_onScreen()}');

      // -- the old credentials are refused, cleanly --
      await _pumpFor(tester, const Duration(milliseconds: 1500));
      await _type(tester, find.widgetWithText(TextFormField, 'Email'), _emailA);
      await _type(
        tester,
        find.widgetWithText(TextFormField, 'Password'),
        _passA,
      );
      await _tap(tester, signIn);
      await _pumpFor(tester, const Duration(seconds: 3));
      final end2 = DateTime.now().add(const Duration(seconds: 15));
      String? message;
      while (DateTime.now().isBefore(end2) && message == null) {
        for (final t in [
          'No account found',
          'Incorrect password',
          'Sign in failed',
          'Invalid',
        ]) {
          final f = find.textContaining(t);
          if (f.evaluate().isNotEmpty) {
            message = (tester.widget(f.first) as Text).data;
          }
        }
        await tester.pump(const Duration(milliseconds: 250));
      }
      _note('sign-in with deleted account shows: $message');
      expect(message, isNotNull, reason: 'an error is shown');
      expect(FirebaseAuth.instance.currentUser, isNull);
      expect(find.text('Describe an expense...'), findsNothing);
      if (message!.contains('firebase_auth') ||
          message.contains('[') ||
          message.startsWith('Sign in failed')) {
        _bug(
          'LOGIN-RAW-ERROR',
          'Signing in with a deleted account shows a raw Firebase error: '
              '"$message" (login_screen.dart:170-192 does not map '
              'invalid-credential / INVALID_LOGIN_CREDENTIALS)',
        );
      }
      final emulatorSignIn = await _authEmulator('signInWithPassword', {
        'email': _emailA,
        'password': _passA,
        'returnSecureToken': true,
      });
      expect(emulatorSignIn['error'], isNotNull, reason: 'auth user removed');

      // -- the server no longer has their data --
      expect(await _firestoreCount('expenses', 'userId', _uidA), 0);
      expect(
        await _firestoreCount('income_sources_personal', 'userId', _uidA),
        0,
      );
      expect(
        await _firestoreCount('savings_goals_personal', 'userId', _uidA),
        0,
      );
      expect(await _firestoreCount('budgets_personal', 'userId', _uidA), 0);
      expect(await _firestoreCount('notifications', 'userId', _uidA), 0);
      expect(await _firestoreCount('groupMembers', 'userId', _uidA), 0);
      expect(await _firestoreDocStatus('users/$_uidA'), 404);
      expect(await _firestoreDocStatus('userNotificationSettings/$_uidA'), 404);
      expect(tester.takeException(), isNull);
    }),
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );
}
